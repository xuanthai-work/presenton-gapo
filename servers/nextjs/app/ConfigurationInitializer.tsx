'use client';

import { useEffect, useState } from 'react';
import { setCanChangeKeys, setLLMConfig } from '@/store/slices/userConfig';
import { hasValidLLMConfig, normalizeLLMConfig } from '@/utils/storeHelpers';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { LLMConfig } from '@/types/llm_config';
import { notify } from '@/components/ui/sonner';
import { GSlideSplashLoader, GSLIDE_SPLASH_MIN_DURATION_MS } from '@/components/gslide';

function ConfigurationLoadingScreen() {
  return <GSlideSplashLoader message="Loading GSlide..." />;
}

export function ConfigurationInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();

  const route = usePathname();
  const shouldShowStartupSplash = !route?.startsWith("/pdf-maker");
  const isSettingsRoute =
    route === "/settings" || route?.startsWith("/settings/");
  const isAuthRoute = route === "/" || route === "/auth";
  const [isLoading, setIsLoading] = useState(
    () => shouldShowStartupSplash
  );
  const [hasMetSplashDuration, setHasMetSplashDuration] = useState(
    () => !shouldShowStartupSplash
  );
  const router = useRouter();

  useEffect(() => {
    fetchUserConfigState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shouldShowStartupSplash) {
      setHasMetSplashDuration(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setHasMetSplashDuration(true);
    }, GSLIDE_SPLASH_MIN_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [shouldShowStartupSplash]);

  const setLoadingToFalseAfterNavigatingTo = (pathname: string) => {
    if (window.location.pathname === pathname) {
      setIsLoading(false);
      return;
    }

    const interval = setInterval(() => {
      if (window.location.pathname === pathname) {
        clearInterval(interval);
        setIsLoading(false);
      }
    }, 500);
  }

  const fetchUserConfigState = async () => {
    if (route.startsWith("/pdf-maker")) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    let canChangeKeys = false;
    try {
      const res = await fetch('/api/can-change-keys');
      if (!res.ok) throw new Error(`can-change-keys returned ${res.status}`);
      const data = await res.json();
      canChangeKeys = data.canChange ?? false;
    } catch (e) {
      console.error('Failed to fetch can-change-keys:', e);
      canChangeKeys = false;
    }
    dispatch(setCanChangeKeys(canChangeKeys));

    if (canChangeKeys) {
      let llmConfig: LLMConfig = {};
      try {
        const res = await fetch('/api/user-config');
        if (!res.ok) throw new Error(`user-config returned ${res.status}`);
        llmConfig = await res.json();
      } catch (e) {
        console.error('Failed to fetch user config:', e);
        llmConfig = {};
      }
      llmConfig = normalizeLLMConfig(llmConfig);

      if (!hasValidLLMConfig(llmConfig)) {
        try {
          const runtimeRes = await fetch('/api/runtime-config', { cache: 'no-store' });
          if (runtimeRes.ok) {
            const runtime = await runtimeRes.json();
            const runtimeConfig = normalizeLLMConfig(
              (runtime.config || {}) as LLMConfig
            );
            if (runtime.configured || hasValidLLMConfig(runtimeConfig)) {
              llmConfig = runtimeConfig;
            }
          }
        } catch (error) {
          console.error('Failed to fall back to runtime configuration:', error);
        }
      }

      dispatch(setLLMConfig(llmConfig));

      const isValid = hasValidLLMConfig(llmConfig);
      if (route.startsWith('/pdf-maker')) {
        setIsLoading(false);
        return;
      }
      if (isValid) {
        if (isAuthRoute) {
          router.push('/dashboard');
          setLoadingToFalseAfterNavigatingTo('/dashboard');
        } else {
          setIsLoading(false);
        }
      } else if (!isAuthRoute && !isSettingsRoute) {
        notify.warning(
          "AI provider not configured",
          "Open Settings to configure your text, image, and web search providers.",
          { id: "llm-config-required" }
        );
        router.push('/settings');
        setLoadingToFalseAfterNavigatingTo('/settings');
      } else if (isAuthRoute) {
        router.push('/dashboard');
        setLoadingToFalseAfterNavigatingTo('/dashboard');
      } else {
        setIsLoading(false);
      }
    } else {
      try {
        const res = await fetch("/api/runtime-config", {
          cache: "no-store",
        });
        if (res.ok) {
          const runtime = await res.json();
          const runtimeConfig = normalizeLLMConfig(
            (runtime.config || {}) as LLMConfig
          );
          dispatch(setLLMConfig(runtimeConfig));
          if (!runtime.configured) {
            notify.error(
              "Instance not configured",
              "Ask your operator to set AI provider keys in the deployment environment, or sign in and add your own keys in Settings.",
              { id: "instance-not-configured" }
            );
            setIsLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to fetch runtime configuration:", error);
      }
      if (route === '/auth' || isAuthRoute) {
        router.push('/dashboard');
        setLoadingToFalseAfterNavigatingTo('/dashboard');
      } else {
        setIsLoading(false);
      }
    }
  }


  if (isLoading || !hasMetSplashDuration) {
    return <ConfigurationLoadingScreen />;
  }

  return children;
}
