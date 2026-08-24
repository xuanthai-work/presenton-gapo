import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GSlidePage({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-screen bg-[var(--gslide-bg)] text-[var(--gslide-ink)]", className)}
      {...props}
    />
  );
}
