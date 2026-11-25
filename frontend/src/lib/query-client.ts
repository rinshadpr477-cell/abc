import { QueryClient } from '@tanstack/react-query';

// Singleton shared with the axios layer so a forced logout can clear cached data.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30 * 1000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: 0 },
  },
});
