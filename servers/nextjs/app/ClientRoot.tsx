"use client";

import PostHogInitializer from "./PostHogInitializer";
import { Providers } from "./providers";
import TailwindBrowserRuntime from "@/components/runtime/TailwindBrowserRuntime";
import { Toaster } from "@/components/ui/sonner";

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <PostHogInitializer>{children}</PostHogInitializer>
      <TailwindBrowserRuntime />
      <Toaster position="top-center" />
    </Providers>
  );
}