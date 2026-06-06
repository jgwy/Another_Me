import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { ApiError, getMe } from "./lib/api";
import { queryClient } from "./lib/queryClient";
import { router } from "./routes/router";
import { useAuthStore } from "./store/auth";

export function App() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  // If we restored a token from storage, validate it and refresh the user.
  useEffect(() => {
    if (!token) return;
    let active = true;
    getMe()
      .then((user) => {
        if (active) setUser(user);
      })
      .catch((err) => {
        if (active && err instanceof ApiError && err.status === 401) logout();
      });
    return () => {
      active = false;
    };
  }, [token, setUser, logout]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
