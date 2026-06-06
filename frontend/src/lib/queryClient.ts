import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client.
 * Conservative defaults: short staleness window, a single retry, and no
 * refetch-on-focus thrash while spectating live conversations.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
