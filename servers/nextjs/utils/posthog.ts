"use client";

import posthog from "posthog-js";
import { sanitizeAnalyticsError } from "@/utils/analytics";

export type ErrorOperation = "crash" | "generate" | "export" | "stream" | "save";

declare global {
  interface Window {
    __posthog_initialized?: boolean;
    __posthog_telemetry_enabled?: boolean;
  }
}

let statusPromise: Promise<boolean> | null = null;

async function ensureTelemetryStatus(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (typeof window.__posthog_telemetry_enabled === "boolean") {
    return window.__posthog_telemetry_enabled;
  }
  if (!statusPromise) {
    statusPromise = (async () => {
      try {
        const res = await fetch("/api/telemetry-status");
        if (!res.ok) throw new Error(`telemetry-status returned ${res.status}`);
        const data = (await res.json()) as {
          telemetryEnabled?: boolean;
          host?: string;
          key?: string;
        };
        const enabled = Boolean(
          data.telemetryEnabled && data.host && data.key
        );
        window.__posthog_telemetry_enabled = enabled;
        if (enabled) {
          initializePostHogNow(data.host!, data.key!);
        }
        return enabled;
      } catch {
        window.__posthog_telemetry_enabled = false;
        return false;
      }
    })();
  }
  return statusPromise;
}

function initializePostHogNow(host: string, key: string): void {
  if (typeof window === "undefined") return;
  if (window.__posthog_initialized) {
    posthog.opt_in_capturing();
    return;
  }
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    capture_exceptions: true,
    persistence: "localStorage",
    disable_surveys: true,
  });
  window.__posthog_initialized = true;
}

export function initPostHog(): void {
  if (typeof window === "undefined") return;
  void ensureTelemetryStatus();
}

export function captureError(
  error: unknown,
  context: { operation: ErrorOperation }
): void {
  try {
    if (typeof window === "undefined") return;
    if (window.__posthog_telemetry_enabled === false) return;
    if (!window.__posthog_initialized) return;
    const message = sanitizeAnalyticsError(error, "Unknown error");
    posthog.captureException(new Error(message), {
      operation: context.operation,
      pathname: window.location.pathname,
    });
  } catch {
    // Error reporting must never break product UI.
  }
}

export function resetTelemetryCache(): void {
  statusPromise = null;
  if (typeof window !== "undefined") {
    delete window.__posthog_telemetry_enabled;
  }
}

export function setTelemetryEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  statusPromise = null;
  if (!enabled) {
    window.__posthog_telemetry_enabled = false;
    if (window.__posthog_initialized) {
      posthog.opt_out_capturing();
    }
    return;
  }
  delete window.__posthog_telemetry_enabled;
  void ensureTelemetryStatus();
}
