"use client";

import { cn } from "@/lib/utils";
import { GSlideWordmark } from "./GSlideWordmark";

export const GSLIDE_SPLASH_MIN_DURATION_MS = 3000;

export function GSlideSplashLoader({
  message = "Preparing your workspace",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={message}
      role="status"
      className={cn(
        "fixed inset-0 z-[2147483000] flex min-h-screen items-center justify-center bg-[var(--gslide-bg)]",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-6">
        <GSlideWordmark className="text-3xl sm:text-4xl" />
        <div
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gslide-accent-soft)] border-t-[var(--gslide-accent)]"
        />
        <p className="font-syne text-sm text-[var(--gslide-muted)]">{message}</p>
      </div>
    </main>
  );
}
