import { useState, useCallback, useEffect } from "react";
import type { CurrentUser } from "../types/chat";

export function useAuth(
  baseUrl: string,
  onAuthenticated: (token: string, user: CurrentUser) => void
) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-login from saved token on mount
  useEffect(() => {
    try {
      const savedToken =
        typeof window !== "undefined" ? localStorage.getItem("vortex_token") : null;
      if (!savedToken) {
        setLoadingAuth(false);
        return;
      }

      setLoadingAuth(true);
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        setLoadingAuth(false);
      }, 3000);

      fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timer);
          if (!res.ok) throw new Error();
          const data = (await res.json()) as { user: CurrentUser };
          setCurrentUser(data.user);
          onAuthenticated(savedToken, data.user);
        })
        .catch(() => {
          clearTimeout(timer);
          try {
            localStorage.removeItem("vortex_token");
          } catch {}
        })
        .finally(() => {
          setLoadingAuth(false);
        });
    } catch {
      setLoadingAuth(false);
    }
  }, [baseUrl, onAuthenticated]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Login failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      localStorage.setItem("vortex_token", data.token);
      setCurrentUser(data.user);
      onAuthenticated(data.token, data.user);
    },
    [baseUrl, onAuthenticated]
  );

  const register = useCallback(
    async (username: string, password: string, serverInviteCode?: string) => {
      setError(null);
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, serverInviteCode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Registration failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      localStorage.setItem("vortex_token", data.token);
      setCurrentUser(data.user);
      onAuthenticated(data.token, data.user);
    },
    [baseUrl, onAuthenticated]
  );

  const join = useCallback(
    async (username: string) => {
      setError(null);
      const res = await fetch(`${baseUrl}/auth/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Join failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      localStorage.setItem("vortex_token", data.token);
      setCurrentUser(data.user);
      onAuthenticated(data.token, data.user);
    },
    [baseUrl, onAuthenticated]
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem("vortex_token");
    } catch {}
    setCurrentUser(null);
    setError(null);
  }, []);

  return {
    currentUser,
    setCurrentUser,
    loadingAuth,
    error,
    setError,
    login,
    register,
    join,
    reset,
  };
}

