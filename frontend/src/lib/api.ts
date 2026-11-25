import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import type { SessionReason } from '@/lib/session-notice';
import { queryClient } from '@/lib/query-client';
import type { AuthPayload, Envelope, Paged } from '@/types';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** The caller shows this request's error itself; the global error toast is skipped. */
    skipGlobalErrorToast?: boolean;
  }
}

/**
 * The localhost fallback exists for local development only. A production build/start must be given
 * NEXT_PUBLIC_API_URL explicitly (it is inlined at build time), otherwise we fail loudly instead of
 * silently talking to localhost.
 */
function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Set it to the deployed API base URL (e.g. https://api.example.com/api/v1) before building for production.'
    );
  }
  return 'http://localhost:4000/api/v1';
}

export const API_URL = resolveApiUrl();

export interface FieldError {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  errors?: FieldError[];
  isNetwork: boolean;

  constructor(init: { message: string; status?: number; code?: string; errors?: FieldError[]; isNetwork?: boolean }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.errors = init.errors;
    this.isNetwork = init.isNetwork ?? false;
  }
}

const OFFLINE = 'The service is currently unavailable. Please check your connection and try again.';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // sends the HttpOnly refresh cookie
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { token } = useAuthStore.getState();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Single-flight session refresh (shared by bootstrap and the 401 interceptor) ──
// The backend rotates refresh tokens and treats reuse as theft, so two concurrent
// refreshes with the same cookie must never happen.
let refreshing: Promise<AuthPayload | null> | null = null;

export function refreshSession(): Promise<AuthPayload | null> {
  if (!refreshing) {
    refreshing = axios
      .post<Envelope<AuthPayload>>(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const { accessToken, user } = res.data.data;
        useAuthStore.getState().setSession(accessToken, user);
        return res.data.data;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export function sessionExpired(message = 'Your session has expired. Please sign in again.', reason: SessionReason = 'expired') {
  const hadSession = !!useAuthStore.getState().token;
  useAuthStore.getState().clear();
  queryClient.clear();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    if (hadSession) toast.error(message);
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // The toast above is lost by the reload, so the login page shows the reason from the URL.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- outside React; full reload clears memory state
    window.location.assign(`/login?next=${next}&reason=${reason}`); // full reload on purpose: drops all in-memory state
  }
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

function normalise(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Partial<{ message: string; code: string; errors: FieldError[] }> | undefined;
    const network = !error.response;
    return new ApiError({
      message: data?.message || (network ? OFFLINE : error.message) || 'Request failed',
      status: error.response?.status,
      code: data?.code,
      errors: data?.errors,
      isNetwork: network,
    });
  }
  return new ApiError({ message: 'An unexpected error occurred' });
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const code = (error.response?.data as { code?: string } | undefined)?.code;
    const hadToken = !!useAuthStore.getState().token;

    // Expired / invalid access token → one silent refresh, then replay the request.
    if (status === 401 && original && !original._retry && hadToken && !NO_REFRESH.some((p) => original.url?.startsWith(p))) {
      original._retry = true;
      const session = await refreshSession();
      if (session) {
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        return api(original);
      }
      sessionExpired();
      return Promise.reject(normalise(error));
    }

    // Account deactivated while signed in.
    if (status === 403 && code === 'ACCOUNT_INACTIVE' && hadToken) {
      sessionExpired('Your account has been deactivated.', 'deactivated');
      return Promise.reject(normalise(error));
    }

    if (status !== 401 && !original?.skipGlobalErrorToast) {
      toast.error(normalise(error).message);
    }
    return Promise.reject(normalise(error));
  }
);

async function request<T>(config: AxiosRequestConfig): Promise<Envelope<T>> {
  const res = await api.request<Envelope<T>>(config);
  return res.data;
}

export const apiData = async <T>(config: AxiosRequestConfig): Promise<T> => (await request<T>(config)).data;

export const apiPage = async <T>(config: AxiosRequestConfig): Promise<Paged<T>> => {
  const body = await request<T[]>(config);
  return { items: body.data, meta: body.meta! };
};
