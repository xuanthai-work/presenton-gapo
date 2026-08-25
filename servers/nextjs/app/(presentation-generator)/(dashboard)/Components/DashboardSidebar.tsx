"use client";

import React from "react";
import { LayoutDashboard, Settings, HelpCircle, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import { GSlideSidebar, gslideNavActiveClass, gslideNavIdleClass } from "@/components/gslide";

/** Replace with the real support address. */
const GSLIDE_HELP_MAILTO = "mailto:help@placeholder.example";

const DashboardSidebar = () => {
    const pathname = usePathname();

    return (
        <GSlideSidebar
            footer={
                <div className="border-t border-[var(--gslide-border)] pt-5 font-syne">
                    <Link
                        href="/settings"
                        className="flex flex-col items-center gap-2 transition-colors"
                    >
                        <Settings className={["h-4 w-4", pathname === "/settings" ? gslideNavActiveClass : gslideNavIdleClass].join(" ")} />
                        <span className={["text-[11px]", pathname === "/settings" ? gslideNavActiveClass : gslideNavIdleClass].join(" ")}>Settings</span>
                    </Link>
                    <div className="py-2" />
                    <a
                        href={GSLIDE_HELP_MAILTO}
                        className="flex flex-col items-center gap-2 transition-colors"
                        aria-label="Email GSlide help"
                    >
                        <HelpCircle className={["h-4 w-4", gslideNavIdleClass].join(" ")} />
                        <span className={["text-[11px]", gslideNavIdleClass].join(" ")}>Help</span>
                    </a>
                </div>
            }
        >
            <div className="space-y-6">

                {/* Dashboard */}
                <Link
                    prefetch={false}
                    href={`/dashboard`}
                    className={[
                        "flex flex-col tex-center items-center gap-2 transition-colors",
                        pathname === "/dashboard" ? "" : "ring-transparent",
                    ].join(" ")}
                    aria-label="Dashboard"
                    title="Dashboard"
                >
                    <LayoutDashboard className={["h-4 w-4", pathname === "/dashboard" ? gslideNavActiveClass : gslideNavIdleClass].join(" ")} />
                    <span className={["text-[11px]", pathname === "/dashboard" ? gslideNavActiveClass : "text-[var(--gslide-ink)]"].join(" ")}>Dashboard</span>
                </Link>
                <Link
                    prefetch={false}
                    href={`/templates`}
                    className={[
                        "flex flex-col tex-center items-center gap-2 transition-colors",
                        pathname === "/templates" ? "" : "ring-transparent",
                    ].join(" ")}
                    aria-label="Templates"
                    title="Templates"
                >
                    <div className="flex flex-col cursor-pointer tex-center items-center gap-2 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={`${pathname === "/templates" ? "var(--gslide-accent)" : "var(--gslide-muted)"}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 14h6" /><path d="M4 2h10" /><rect x="4" y="18" width="16" height="4" rx="1" /><rect x="4" y="6" width="16" height="4" rx="1" /></svg>
                        <span className={["text-[11px]", pathname === "/templates" ? gslideNavActiveClass : "text-[var(--gslide-ink)]"].join(" ")}>Templates</span>
                    </div>
                </Link>
                <Link
                    prefetch={false}
                    href="/community"
                    className="flex flex-col items-center gap-2 text-center transition-colors"
                    aria-label="Community"
                    title="Community"
                >
                    <UsersRound className={["h-4 w-4", pathname === "/community" ? gslideNavActiveClass : gslideNavIdleClass].join(" ")} />
                    <span className={["text-[11px]", pathname === "/community" ? gslideNavActiveClass : "text-[var(--gslide-ink)]"].join(" ")}>Community</span>
                </Link>
            </div>
        </GSlideSidebar>
    );
};

export default DashboardSidebar;
