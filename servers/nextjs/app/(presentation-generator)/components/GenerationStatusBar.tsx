"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  needsCancelConfirm,
  type GenerationLifecycleState,
} from "@/lib/generation-lifecycle";

type Props = {
  surface: "outline" | "presentation";
  lifecycle: GenerationLifecycleState;
  statusMessage: string;
  draftCount: number;
  totalCount?: number | null;
  canKeepWaiting?: boolean;
  onCancel: () => void;
  onKeepWaiting: () => void;
  onRetry: () => void;
};

const GenerationStatusBar: React.FC<Props> = ({
  surface,
  lifecycle,
  statusMessage,
  draftCount,
  totalCount,
  canKeepWaiting = false,
  onCancel,
  onKeepWaiting,
  onRetry,
}) => {
  // Render nothing for terminal/idle states.
  if (lifecycle === "idle" || lifecycle === "complete" || lifecycle === "cancelled") {
    return null;
  }

  const handleStop = () => {
    if (needsCancelConfirm(draftCount)) {
      const message =
        surface === "outline"
          ? `Stop generating this outline? ${draftCount} section(s) already drafted will be kept.`
          : `Stop generating these slides? ${draftCount} of ${totalCount ?? draftCount} slide(s) already drafted will be kept.`;
      if (!window.confirm(message)) return;
    }
    void onCancel();
    toast.success(
      draftCount > 0
        ? "Generation stopped. Your draft so far was kept."
        : "Generation stopped.",
    );
  };

  const handleKeepWaiting = () => {
    void onKeepWaiting();
  };

  const handleRetry = () => {
    void onRetry();
  };

  const isCancelling = lifecycle === "cancelling";
  const isStalled = lifecycle === "stalled";
  const isFailed = lifecycle === "failed";
  const isConnectingOrGenerating =
    lifecycle === "connecting" || lifecycle === "generating";

  const containerStyle: React.CSSProperties = {
    background: "var(--gslide-card)",
    border: "1px solid var(--gslide-border)",
    color: "var(--gslide-ink)",
  };
  const accentStyle: React.CSSProperties = {
    background: "var(--gslide-accent)",
    color: "#ffffff",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={containerStyle}
      className="mt-2 inline-flex w-fit max-w-[min(100%,22rem)] items-center gap-2 rounded-[12px] px-3 py-2 shadow-[0_4px_12px_rgba(16,24,40,0.06)]"
    >
      {isConnectingOrGenerating && (
        <>
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin"
            style={{ color: "var(--gslide-accent)" }}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-sm">{statusMessage}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleStop}
            className="h-7 shrink-0 px-2 text-sm"
          >
            Stop
          </Button>
        </>
      )}

      {isStalled && (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-semibold">
            This is taking longer than usual
          </span>
          <span className="min-w-0 text-sm opacity-80">
            {statusMessage || "No new content for 45 seconds."}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {canKeepWaiting && (
              <Button
                type="button"
                size="sm"
                onClick={handleKeepWaiting}
                style={accentStyle}
                className="h-7 shrink-0 px-2.5"
              >
                Keep waiting
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleStop}
              className="h-7 shrink-0 px-2.5"
            >
              Stop
            </Button>
            <Button
              type="button"
              variant={canKeepWaiting ? "ghost" : undefined}
              size="sm"
              onClick={handleRetry}
              style={canKeepWaiting ? undefined : accentStyle}
              className="h-7 shrink-0 px-2.5"
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {isCancelling && (
        <>
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin"
            style={{ color: "var(--gslide-accent)" }}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-sm">Stopping…</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled
            className="h-7 shrink-0 px-2"
          >
            Stopping…
          </Button>
        </>
      )}

      {isFailed && (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="min-w-0 text-sm">{statusMessage}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleRetry}
              style={accentStyle}
              className="h-7 shrink-0 px-2.5"
            >
              Try again
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleStop}
              className="h-7 shrink-0 px-2.5"
            >
              Stop
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationStatusBar;