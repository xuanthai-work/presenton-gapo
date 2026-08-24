'use client';

import { useEffect, useState } from 'react';
import { setCanChangeKeys, setLLMConfig } from '@/store/slices/userConfig';
import { hasValidLLMConfig, normalizeLLMConfig } from '@/utils/storeHelpers';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { LLMConfig } from '@/types/llm_config';
import { getApiUrl } from '@/utils/api';
import { notify } from '@/components/ui/sonner';
import { GSlideSplashLoader } from '@/components/gslide';
import { PRESENTON_SPLASH_MIN_DURATION_MS } from '@/components/ui/presenton-splash-loader';

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

  // Fetch user config state
  useEffect(() => {
    fetchUserConfigState();
    // Configuration bootstrap runs once. Presenton is revalidated separately
    // below whenever the user navigates to another application route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      isAuthRoute ||
      isSettingsRoute ||
      route.startsWith('/pdf-maker')
    ) {
      return;
    }

    let cancelled = false;
    let presentonSelected = false;
    const revalidatePresentonConnection = async () => {
      try {
        const configResponse = await fetch('/api/user-config', {
          cache: 'no-store',
        });
        if (!configResponse.ok) return;

        const config = normalizeLLMConfig(await configResponse.json());
        presentonSelected = config.LLM === 'presenton';
        if (!presentonSelected) return;

        const statusResponse = await fetch(
          getApiUrl('/api/v1/auth/presenton/status'),
          { cache: 'no-store', credentials: 'include' }
        );
        const status = statusResponse.ok
          ? await statusResponse.json() as { linked?: boolean }
          : null;

        if (!cancelled && !status?.linked) {
          router.push('/settings');
        }
      } catch (error) {
        console.error('Failed to revalidate Presenton connection:', error);
        if (!cancelled && presentonSelected) {
          router.push('/settings');
        }
      }
    };

    void revalidatePresentonConnection();
    return () => {
      cancelled = true;
    };
  }, [isSettingsRoute, route, router]);

  useEffect(() => {
    if (!shouldShowStartupSplash) {
      setHasMetSplashDuration(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setHasMetSplashDuration(true);
    }, PRESENTON_SPLASH_MIN_DURATION_MS);

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

      let hasPresentonCloud = false;
      try {
        const response = await fetch(
          getApiUrl('/api/v1/auth/presenton/status'),
          { cache: 'no-store', credentials: 'include' }
        );
        if (response.ok) {
          const status = await response.json();
          hasPresentonCloud = Boolean(status.linked);
        }
      } catch (error) {
        console.error('Failed to fetch Presenton cloud status:', error);
      }
      const isValid = hasValidLLMConfig(llmConfig) &&
        (llmConfig.LLM !== 'presenton' || hasPresentonCloud);
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
      } else if (
        !isAuthRoute &&
        !(isSettingsRoute && llmConfig.LLM === 'presenton')
      ) {
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
              "Ask the administrator to configure the AI providers in the deployment environment.",
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
