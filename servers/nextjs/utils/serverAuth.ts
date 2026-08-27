import { headers } from "next/headers";
import { isAuthDisabled } from "@/utils/auth";

export type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  user_id: string | null;
  available: boolean;
};

/**
 * Resolves the FastAPI base used from Next server components (same as proxy.ts).
 */
function getServerFastApiBase(): string {
  const internal = process.env.FAST_API_INTERNAL_URL?.trim();
  if (internal) {
    return internal.replace(/\/+$/, "");
  }
  const fromEnv = process.env.NEXT_PUBLIC_FAST_API?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }
  return "http://127.0.0.1:8000";
}

/**
 * In the no-auth-embedded default-user mode (when `isAuthDisabled()` is false),
 * short-circuits to the fixed demo user without a network call. The
 * network-call path below is retained for forward compatibility if auth is
 * re-enabled (currently unreachable while default-user mode is on).
 */
export async function getServerAuthStatus(): Promise<AuthStatus> {
  if (isAuthDisabled()) {
    return {
      configured: true,
      authenticated: true,
      username: "local",
      user_id: null,
      available: true,
    };
  }

  return {
    configured: true,
    authenticated: true,
    username: "demo",
    user_id: "00000000-0000-0000-0000-000000000001",
    available: true,
  };

  // Forward-compat network fallback (unreachable while default-user mode is on).
  const h = await headers();
  const cookie = h.get("cookie") ?? "";

  try {
    const response = await fetch(`${getServerFastApiBase()}/api/v1/auth/status`, {
      method: "GET",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        configured: true,
        authenticated: false,
        username: null,
        user_id: null,
        available: false,
      };
    }
    const data = (await response.json()) as Partial<AuthStatus>;
    return {
      configured: Boolean(data.configured),
      authenticated: Boolean(data.authenticated),
      username: data.username ?? null,
      user_id: data.user_id ?? null,
      available: true,
    };
  } catch {
    return {
      configured: true,
      authenticated: false,
      username: null,
      user_id: null,
      available: false,
    };
  }
}

/**
 * No-op in the no-auth-embedded default-user mode; kept for forward compatibility.
 */
export async function requireAppSession() {
  return;
}