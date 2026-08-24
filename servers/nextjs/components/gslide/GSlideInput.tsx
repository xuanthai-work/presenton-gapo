import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const GSlideInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function GSlideInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-lg border bg-[var(--gslide-card)] px-4 text-sm outline-none transition placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60",
        "border-[var(--gslide-input-border)] focus:border-[var(--gslide-input-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--gslide-input-focus)_15%,transparent)]",
        className,
      )}
      {...props}
    />
  );
});
