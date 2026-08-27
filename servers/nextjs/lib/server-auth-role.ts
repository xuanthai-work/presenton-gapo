import { NextResponse } from "next/server";

export type ServerAuthStatus = {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  user_id: string | null;
};

function fastApiBase(): string {
  return (
    process.env.FAST_API_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_FAST_API?.trim() ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
}

export async function authStatusForRequest(
  request: Request
): Promise<ServerAuthStatus> {
  const cookie = request.headers.get("cookie") || "";
  try {
    const response = await fetch(`${fastApiBase()}/api/v1/auth/status`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        configured: true,
        authenticated: false,
        username: null,
        user_id: null,
      };
    }
    return (await response.json()) as ServerAuthStatus;
  } catch {
    return {
      configured: true,
      authenticated: false,
      username: null,
      user_id: null,
    };
  }
}

export async function requireAuthenticatedApi(
  request: Request
): Promise<NextResponse | null> {
  const status = await authStatusForRequest(request);
  if (!status.authenticated) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  return null;
}
