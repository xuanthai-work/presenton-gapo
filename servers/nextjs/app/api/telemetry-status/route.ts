import { NextResponse } from "next/server";
import { readUserConfigFile } from "@/lib/user-config-store";

export const dynamic = "force-dynamic";

function isTrueFlag(value: string | undefined): boolean {
  return value === "true" || value === "True";
}

export async function GET() {
  const host = process.env.POSTHOG_HOST?.trim() ?? "";
  const key = process.env.POSTHOG_PROJECT_API_KEY?.trim() ?? "";
  const posthogConfigured = Boolean(host && key);

  const userConfigPath = process.env.USER_CONFIG_PATH;
  let fileDisabled: string | undefined;
  if (userConfigPath) {
    try {
      const parsed = readUserConfigFile<{ DISABLE_ANONYMOUS_TRACKING?: string }>(
        userConfigPath
      );
      fileDisabled = parsed?.DISABLE_ANONYMOUS_TRACKING;
    } catch {
      fileDisabled = undefined;
    }
  }

  const envDisabled = isTrueFlag(process.env.DISABLE_ANONYMOUS_TRACKING);
  const telemetryEnabled =
    posthogConfigured && !envDisabled && !isTrueFlag(fileDisabled);

  if (!telemetryEnabled) {
    return NextResponse.json({ telemetryEnabled: false });
  }

  return NextResponse.json({ telemetryEnabled: true, host, key });
}