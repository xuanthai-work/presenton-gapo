"use client";

import { useEffect } from "react";
import { initPostHog } from "@/utils/posthog";

export function PostHogInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);
  return <>{children}</>;
}

export default PostHogInitializer;