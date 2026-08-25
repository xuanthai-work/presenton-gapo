import Link from "next/link";
import type { ReactNode } from "react";
import { GSlideWordmark } from "./GSlideWordmark";

export const gslideNavActiveClass = "text-[var(--gslide-accent)]";
export const gslideNavIdleClass = "text-[var(--gslide-muted)]";

export function GSlideSidebar({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      className="sticky top-0 flex h-screen w-[114px] shrink-0 flex-col justify-between border-r border-[var(--gslide-border)] bg-[var(--gslide-bg)] px-4 py-8"
      aria-label="Dashboard sidebar"
    >
      <div>
        <Link
          href="/dashboard"
          className="flex items-center border-b border-[var(--gslide-border)] pb-6"
        >
          <GSlideWordmark markOnly className="mx-auto text-5xl" />
        </Link>
        <nav className="pt-6 font-syne" aria-label="Dashboard sections">
          {children}
        </nav>
      </div>
      {footer}
    </aside>
  );
}
