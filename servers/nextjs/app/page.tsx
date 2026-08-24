import Link from "next/link";
import { GSlideWordmark } from "@/components/gslide";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--gslide-bg)]">
      {/* subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, #BFDBFE 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <GSlideWordmark className="text-5xl sm:text-6xl" />

        <div className="space-y-3">
          <p className="max-w-md text-base text-[var(--gslide-muted)]">
            Create stunning AI-powered presentations in minutes.
          </p>
        </div>

        <Link
          href="/auth"
          className="mt-2 rounded-full bg-[var(--gslide-accent)] px-10 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--gslide-accent-hover)] active:scale-95"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
