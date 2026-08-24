"use client";

import MixpanelInitializer from "./MixpanelInitializer";
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
      <MixpanelInitializer>{children}</MixpanelInitializer>
      <TailwindBrowserRuntime />
      <Toaster position="top-center" />
    </Providers>
  );
}
