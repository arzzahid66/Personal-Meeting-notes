import * as React from "react";
import { authApi } from "@/api/auth";
import {
  API_BASE,
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  setUnauthenticatedHandler,
} from "@/api/client";
import type { AccessTokenResponse, Me } from "@/api/types";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  /** True when a usable LLM *and* STT key exists — the onboarding gate. */
  keysReady: boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [me, setMe] = React.useState<Me | null>(null);

  const clear = React.useCallback(async () => {
    setAccessToken(null);
    await setRefreshToken(null);
    setMe(null);
    setStatus("anonymous");
  }, []);

  // A 401 that survives one refresh means the session is genuinely gone.
  React.useEffect(() => {
    setUnauthenticatedHandler(() => {
      void clear();
    });
    return () => setUnauthenticatedHandler(null);
  }, [clear]);

  const refreshMe = React.useCallback(async () => {
    try {
      const next = await authApi.me();
      setMe(next);
      setStatus("authenticated");
      return next;
    } catch {
      await clear();
      return null;
    }
  }, [clear]);

  // Restore the session on launch: exchange the stored refresh token for an
  // access token, then read /auth/me for the provider-key flags.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const refresh = await getRefreshToken();
      if (!refresh) {
        if (!cancelled) setStatus("anonymous");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/mn/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) throw new Error("refresh rejected");
        const data = (await res.json()) as AccessTokenResponse;
        setAccessToken(data.access_token);
        if (!cancelled) await refreshMe();
      } catch {
        if (!cancelled) await clear();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clear, refreshMe]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const pair = await authApi.login({ email, password });
      setAccessToken(pair.access_token);
      await setRefreshToken(pair.refresh_token);
      await refreshMe();
    },
    [refreshMe],
  );

  const signup = React.useCallback(
    async (name: string, email: string, password: string) => {
      // Signup returns no tokens by design; starting the session is a separate call.
      await authApi.signup({ name, email, password });
      await login(email, password);
    },
    [login],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      login,
      signup,
      logout: clear,
      refreshMe,
      keysReady: Boolean(me?.llm_key_configured && me?.stt_key_configured),
    }),
    [status, me, login, signup, clear, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
