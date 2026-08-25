import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GSlideHeader({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-[105px] items-center justify-between border-b border-[var(--gslide-border)] px-1 backdrop-blur",
        className,
      )}
    >
      <h1 className="whitespace-nowrap font-unbounded text-[22px] font-normal tracking-[-0.03em] text-[var(--gslide-ink)]">
        {title}
      </h1>
      {actions}
    </header>
  );
}
