export const STALL_MS = 45_000;
export const HEARTBEAT_IS_PROGRESS = false;
export const MAX_SILENT_RETRIES = 3;

export type GenerationSurface = "outline" | "presentation";
export type GenerationLifecycleState =
  | "idle" | "connecting" | "generating" | "stalled"
  | "cancelling" | "cancelled" | "failed" | "complete";

export type StreamEventType =
  | "status" | "chunk" | "slide_html" | "slide_assets" | "fonts"
  | "complete" | "closing" | "error" | "heartbeat";

const USEFUL_EVENT_TYPES = new Set<StreamEventType>([
  "status", "chunk", "slide_html", "slide_assets", "fonts",
  "complete", "closing", "error",
]);

export function isUsefulStreamEvent(type: string): boolean {
  return USEFUL_EVENT_TYPES.has(type as StreamEventType);
}

export function silentRetryDelayMs(retryCount: number): number {
  return 1_000 * retryCount;
}

export function shouldSilentRetry(args: {
  retryCount: number; hasUsefulEvent: boolean; closed: boolean;
}): boolean {
  if (args.closed || args.hasUsefulEvent) return false;
  return args.retryCount < MAX_SILENT_RETRIES;
}

export function needsCancelConfirm(draftCount: number): boolean {
  return draftCount > 0;
}

export function isStalled(args: {
  now: number; lastUsefulEventAt: number | null; state: GenerationLifecycleState | string;
}): boolean {
  if (args.state !== "generating" && args.state !== "connecting") return false;
  if (args.lastUsefulEventAt == null) return false;
  return args.now - args.lastUsefulEventAt >= STALL_MS;
}

export type StallCause = "silence" | "socket";

export function shouldShowKeepWaiting(
  cause: StallCause | null | undefined,
): boolean {
  return cause === "silence";
}