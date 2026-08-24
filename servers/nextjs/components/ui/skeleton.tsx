import { GSlideSkeleton } from "@/components/gslide";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <GSlideSkeleton className={className} {...props} />;
}

export { Skeleton };
