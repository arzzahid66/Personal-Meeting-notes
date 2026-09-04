import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import { AuthProvider } from "./hooks/auth";
import { applyStoredTheme } from "./lib/theme";
import "./index.css";

applyStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Pipeline state changes server-side; short staleness keeps lists honest
      // without hammering the API.
      staleTime: 15_000,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status ?? 0;
        // Auth, ownership and business-rule failures are never worth retrying.
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ duration: 5000 }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
