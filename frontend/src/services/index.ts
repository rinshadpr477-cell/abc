import { apiData, apiPage } from '@/lib/api';
import type {
  AuthPayload, Category, CategoryNode, DashboardStats, Order, OrderStatus, Product, ProductStatus, Role, User,
} from '@/types';

type Params = Record<string, string | number | boolean | undefined | null>;
const clean = (p: Params = {}): Record<string, string | number | boolean> =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Record<
    string,
    string | number | boolean
  >;

export const authService = {
  register: (body: { name: string; email: string; password: string }) =>
    apiData<AuthPayload>({ method: 'POST', url: '/auth/register', data: body, skipGlobalErrorToast: true }),
  login: (body: { email: string; password: string }) =>
    apiData<AuthPayload>({ method: 'POST', url: '/auth/login', data: body, skipGlobalErrorToast: true }),
  logout: () => apiData<null>({ method: 'POST', url: '/auth/logout', skipGlobalErrorToast: true }),
  me: () => apiData<User>({ method: 'GET', url: '/auth/me' }),
  updateProfile: (body: { name?: string; email?: string }) =>
    apiData<User>({ method: 'PATCH', url: '/auth/profile', data: body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiData<AuthPayload>({ method: 'PATCH', url: '/auth/change-password', data: body }),
};

export const userService = {
  list: (p: Params) => apiPage<User>({ method: 'GET', url: '/users', params: clean(p) }),
  get: (id: string) => apiData<User>({ method: 'GET', url: `/users/${id}` }),
  setStatus: (id: string, isActive: boolean) =>
    apiData<User>({ method: 'PATCH', url: `/users/${id}/status`, data: { isActive } }),
};

export interface CategoryInput {
  name?: string;
  description?: string;
  parent?: string | null;
  isActive?: boolean;
}

export const categoryService = {
  tree: (includeInactive = false) =>
    apiData<CategoryNode[]>({ method: 'GET', url: '/categories/tree', params: includeInactive ? { includeInactive: true } : {} }),
  get: (id: string) => apiData<Category>({ method: 'GET', url: `/categories/${id}` }),
  create: (body: CategoryInput) => apiData<Category>({ method: 'POST', url: '/categories', data: body }),
  update: (id: string, body: CategoryInput) => apiData<Category>({ method: 'PATCH', url: `/categories/${id}`, data: body }),
  remove: (id: string) => apiData<null>({ method: 'DELETE', url: `/categories/${id}`, skipGlobalErrorToast: true }),
};

export interface ProductInput {
  name?: string;
  sku?: string;
  description?: string;
  price?: number;
  salePrice?: number | null;
  stock?: number;
  category?: string;
  status?: ProductStatus;
}

export const productService = {
  list: (p: Params) => apiPage<Product>({ method: 'GET', url: '/products', params: clean(p) }),
  get: (id: string, quiet = false) =>
    apiData<Product>({ method: 'GET', url: `/products/${id}`, skipGlobalErrorToast: quiet }),
  create: (body: ProductInput) => apiData<Product>({ method: 'POST', url: '/products', data: body }),
  update: (id: string, body: ProductInput) => apiData<Product>({ method: 'PATCH', url: `/products/${id}`, data: body }),
  remove: (id: string) =>
    apiData<{ deleted: boolean; deactivated: boolean }>({ method: 'DELETE', url: `/products/${id}` }),
};

export const orderService = {
  /** Only ids + quantities are sent; the backend computes every price and total. */
  place: (items: { productId: string; quantity: number }[], idempotencyKey: string) =>
    apiData<Order>({
      method: 'POST',
      url: '/orders',
      data: { items },
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  mine: (p: Params) => apiPage<Order>({ method: 'GET', url: '/orders/my-orders', params: clean(p) }),
  get: (id: string) => apiData<Order>({ method: 'GET', url: `/orders/${id}` }),
  cancel: (id: string) => apiData<Order>({ method: 'PATCH', url: `/orders/${id}/cancel` }),
  adminList: (p: Params) => apiPage<Order>({ method: 'GET', url: '/admin/orders', params: clean(p) }),
  adminSetStatus: (id: string, status: OrderStatus, note?: string) =>
    apiData<Order>({ method: 'PATCH', url: `/admin/orders/${id}/status`, data: { status, note: note || undefined } }),
  stats: () => apiData<DashboardStats>({ method: 'GET', url: '/admin/dashboard/stats' }),
};

export type { Role };
