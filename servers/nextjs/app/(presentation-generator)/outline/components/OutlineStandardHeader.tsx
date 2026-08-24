"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GSlideWordmark } from "@/components/gslide";

interface OutlineStandardHeaderProps {
  title: string;
  onBack: () => void;
}

const OutlineStandardHeader = ({
  title,
  onBack,
}: OutlineStandardHeaderProps) => (
  <header className="sticky top-0 z-[60] h-[68px] w-full border-b border-[var(--gslide-border)] bg-[var(--gslide-bg)] font-syne">
    <div className="flex h-full items-center justify-between px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gslide-accent)]/30"
        >
          <GSlideWordmark className="text-base" />
        </Link>
        <h1 className="truncate text-base font-medium tracking-[0.16px] text-[var(--gslide-ink)]">
          {title}
        </h1>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.96px] text-[var(--gslide-ink)] transition-colors hover:text-[var(--gslide-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gslide-accent)]/30"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
    </div>
  </header>
);

export default OutlineStandardHeader;
