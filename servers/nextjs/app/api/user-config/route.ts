import { NextResponse } from "next/server";
import { getFastApiBaseUrl } from "@/lib/fastapi-internal";
import { requireAuthenticatedApi } from "@/lib/server-auth-role";

const canChangeKeys = process.env.CAN_CHANGE_KEYS !== "false";
const INSTANCE_LEVEL_FIELDS = new Set(["DISABLE_ANONYMOUS_TRACKING"]);

function isTrackingOnlyBody(parsed: Record<string, unknown>): boolean {
  const keys = Object.keys(parsed);
  return (
    keys.length > 0 && keys.every((key) => INSTANCE_LEVEL_FIELDS.has(key))
  );
}

function immutableResponse() {
  return NextResponse.json(
    { error: "You are not allowed to access this resource", status: 403 },
    { status: 403 }
  );
}

async function forwardProviderSettings(
  request: Request,
  method: "GET" | "PUT",
  body?: string
) {
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(
    `${getFastApiBaseUrl()}/api/v1/settings/provider`,
    {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    }
  );
  const payload = await response.text();
  return new NextResponse(payload || null, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") || "application/json",
    },
  });
}

export async function GET(request: Request) {
  const denied = await requireAuthenticatedApi(request);
  if (denied) return denied;
  if (!canChangeKeys) return immutableResponse();

  try {
    return await forwardProviderSettings(request, "GET");
  } catch {
    return NextResponse.json(
      { error: "Unable to read provider settings", status: 500 },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAuthenticatedApi(request);
  if (denied) return denied;

  try {
    const body = await request.text();
    if (!body.trim()) {
      return NextResponse.json(
        { error: "Invalid user config JSON body", status: 400 },
        { status: 400 }
      );
    }
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Invalid user config JSON body", status: 400 },
        { status: 400 }
      );
    }
    const record = parsed as Record<string, unknown>;
    if (!canChangeKeys && !isTrackingOnlyBody(record)) {
      return immutableResponse();
    }
    return await forwardProviderSettings(request, "PUT", body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid user config JSON body", status: 400 },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Unable to save provider settings", status: 500 },
      { status: 500 }
    );
  }
}
