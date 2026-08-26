import { GSlideHeader, GSlideSkeleton } from "@/components/gslide";

function Shimmer({ className }: { className?: string }) {
  return <GSlideSkeleton className={className} aria-hidden />;
}

export default function LoadingSettings() {
  return (
    <div className="flex min-h-[100dvh] flex-col font-syne">
      <GSlideHeader
        title="Settings"
        actions={
          <div className="flex items-center gap-2">
            <Shimmer className="h-11 w-[108px] rounded-full" />
            <Shimmer className="h-11 w-[88px] rounded-full" />
          </div>
        }
      />

      <div className="mx-7 pb-16">
        <div className="flex gap-1 border-b border-[var(--gslide-border)]">
          {["w-12", "w-14", "w-16", "w-20", "w-14"].map((width, index) => (
            <Shimmer
              key={index}
              className={`mx-3 my-2.5 h-5 ${width} rounded-md`}
            />
          ))}
        </div>
        <Shimmer className="mt-4 h-3 w-72 max-w-full rounded-md" />

        <div className="mt-8 max-w-3xl space-y-6">
          <div className="rounded-2xl border border-[var(--gslide-border)] bg-[var(--gslide-card)] p-7">
            <Shimmer className="h-6 w-48" />
            <Shimmer className="mt-3 h-4 w-full max-w-[280px]" />
            <Shimmer className="mt-6 h-12 w-full rounded-lg" />
          </div>
          <div className="rounded-2xl border border-[var(--gslide-border)] bg-[var(--gslide-card)] p-7">
            <Shimmer className="h-6 w-28" />
            <Shimmer className="mt-3 h-4 w-52" />
          </div>
        </div>
      </div>
    </div>
  );
}
