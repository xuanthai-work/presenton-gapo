"use client";

import Link from "next/link";
import Image from "next/image";

export const EmptyState = () => {
  return (
    <div className="w-full border-y border-[#EDEEEF]">
      <Link
        href="/upload"
        aria-label="Create your first presentation"
        className="group mx-auto flex h-[250px] w-full max-w-[577px] flex-col items-center justify-center gap-[14px] border-x border-[#EDEEEF] bg-white px-5 outline-none transition-colors hover:bg-[#FDFDFF] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--gslide-accent)]"
      >
        <Image
          src="/dashboard-body/empty-folder.png"
          alt=""
          width={1453}
          height={1083}
          className="h-[48.817px] w-[65.495px] object-cover transition-transform group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
        <span className="flex flex-wrap items-center justify-center gap-x-1.5 text-center font-syne text-sm font-medium">
          <span className="text-[#191919]">No presentations yet.</span>
          <span className="text-[var(--gslide-accent)]">Get started now</span>
        </span>
      </Link>
    </div>
  );
};
