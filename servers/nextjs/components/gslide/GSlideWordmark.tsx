import { cn } from "@/lib/utils";

export function GSlideWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-unbounded font-normal tracking-[-0.03em] text-[var(--gslide-ink)]",
        className,
      )}
    >GSlide</span>
  );
}
