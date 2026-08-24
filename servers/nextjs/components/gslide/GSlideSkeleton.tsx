import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GSlideSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--gslide-accent-soft)]",
        className,
      )}
      {...props}
    />
  );
}
