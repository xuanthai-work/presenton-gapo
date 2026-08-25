import { cn } from "@/lib/utils";

export function GSlideWordmark({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.35em] font-unbounded font-normal tracking-[-0.03em] text-[var(--gslide-ink)]",
        className,
      )}
    >
      <img
        src="/gslide-logo.png"
        alt={markOnly ? "GSlide" : ""}
        className="h-[1.35em] w-[1.35em] shrink-0 object-contain object-center"
      />
      {markOnly ? null : <span>GSlide</span>}
    </span>
  );
}
