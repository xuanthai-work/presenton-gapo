import { NextRequest, NextResponse } from "next/server";

import { getFastApiBaseUrl } from "@/lib/fastapi-internal";
import { authStatusForRequest } from "@/lib/server-auth-role";

type ExportFormat = "pdf" | "pptx";

function isValidFormat(value: unknown): value is ExportFormat {
  return value === "pdf" || value === "pptx";
}

async function readExportRequestBody(req: NextRequest): Promise<{
  format?: unknown;
  id?: unknown;
  title?: unknown;
}> {
  const rawBody = await req.text();
  if (!rawBody.trim()) {
    throw new Error("EMPTY_BODY");
  }

  const parsed = JSON.parse(rawBody) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_BODY");
  }

  return parsed as { format?: unknown; id?: unknown; title?: unknown };
}

function toAppDataUrl(fastapiPath: string): string {
  const trimmed = fastapiPath.trim().replace(/\\/g, "/");
  if (trimmed.startsWith("/app_data/")) {
    return trimmed;
  }
  const appData = (process.env.APP_DATA_DIRECTORY || "/app_data")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (trimmed.startsWith(`${appData}/`)) {
    return `/app_data/${trimmed.slice(appData.length + 1)}`;
  }
  if (trimmed.startsWith("app_data/")) {
    return `/${trimmed}`;
  }
  throw new Error("Export path is not under /app_data");
}

export async function POST(req: NextRequest) {
  const auth = await authStatusForRequest(req);
  if (!auth.authenticated) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: Awaited<ReturnType<typeof readExportRequestBody>>;
  try {
    body = await readExportRequestBody(req);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        (error.message === "EMPTY_BODY" || error.message === "INVALID_BODY"))
    ) {
      return NextResponse.json(
        { error: "Invalid export request JSON body" },
        { status: 400 }
      );
    }
    throw error;
  }

  const { format, id } = body;
  const cookieHeader = req.headers.get("cookie") ?? "";

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json(
      { error: "Missing Presentation ID" },
      { status: 400 }
    );
  }

  if (!isValidFormat(format)) {
    return NextResponse.json(
      { error: "Invalid export format" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${getFastApiBaseUrl()}/api/v1/ppt/presentation/${encodeURIComponent(id.trim())}/export`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({ export_as: format }),
      }
    );
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: detail || "Export failed", success: false },
        { status: response.status }
      );
    }
    const payload = (await response.json()) as { path?: string };
    if (!payload.path) {
      throw new Error("No path returned from export");
    }
    return NextResponse.json({
      success: true,
      path: toAppDataUrl(payload.path),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[export-presentation:${format}]`, message);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
