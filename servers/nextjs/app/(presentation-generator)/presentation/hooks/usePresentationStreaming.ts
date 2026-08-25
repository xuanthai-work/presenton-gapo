import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearPresentationData,
  setPresentationData,
  setStreaming,
  type PresentationData,
} from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { notify } from "@/components/ui/sonner";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { sanitizeAnalyticsError } from "@/utils/analytics";
import { getApiUrl, normalizeBackendAssetUrls } from "@/utils/api";
import { store, type RootState } from "@/store/store";
import {
  mergeSingleSlidePreservingResolvedAssets,
  mergeSlidesPreservingResolvedAssets,
} from "../utils/streamAssetMerge";
import { isTemplateV2Slide } from "../../_shared/blank-slide";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import {
  isStalled,
  isUsefulStreamEvent,
  shouldSilentRetry,
  silentRetryDelayMs,
  type GenerationLifecycleState,
} from "@/lib/generation-lifecycle";

const MAX_STREAM_RETRIES = 3;
const STALL_INTERVAL_MS = 1_000;

const STREAMING_STATES: ReadonlySet<GenerationLifecycleState> = new Set([
  "connecting",
  "generating",
  "stalled",
  "cancelling",
]);

function mergePresentationPreservingTemplateData(
  incoming: PresentationData
): PresentationData {
  const prev = store.getState().presentationGeneration.presentationData;
  if (!prev) return incoming;

  return {
    ...prev,
    ...incoming,
    layout: incoming.layout ?? prev.layout,
    version: incoming.version ?? prev.version,
    theme: incoming.theme ?? prev.theme,
    structure: (incoming as any).structure ?? (prev as any).structure,
    slides: Array.isArray(incoming.slides)
      ? mergeSlidesPreservingResolvedAssets(prev.slides, incoming.slides)
      : prev.slides,
  } as PresentationData;
}

function parseStreamedSlideChunk(chunk: unknown): any | null {
  if (typeof chunk !== "string" || !chunk.trim()) return null;
  try {
    const parsed = JSON.parse(chunk);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.layout === "string" &&
      typeof parsed.index === "number" &&
      parsed.content &&
      typeof parsed.content === "object"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function hasTemplateV2LayoutPayload(layout: unknown): boolean {
  if (!layout || typeof layout !== "object") return false;
  const layouts = (layout as any).layouts;
  if (Array.isArray(layouts)) return true;
  return Boolean(
    layouts &&
      typeof layouts === "object" &&
      Array.isArray((layouts as any).layouts)
  );
}

function isTemplateV2SlidePayload(slide: unknown): boolean {
  return isTemplateV2Slide(slide);
}

function isTemplateV2PresentationPayload(presentation: unknown): boolean {
  if (!presentation || typeof presentation !== "object") return false;
  const record = presentation as Record<string, unknown>;
  return (
    hasTemplateV2LayoutPayload(record.layout) ||
    (Array.isArray(record.slides) && record.slides.some(isTemplateV2SlidePayload))
  );
}

export const usePresentationStreaming = (
  presentationId: string,
  stream: string | null,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
  fetchUserSlides: (options?: {
    clearHistory?: boolean;
  }) => void | Promise<unknown>,
  options: {
    preloadPresentationData?: boolean;
    generationMode?: "standard" | "smart";
  } = {}
) => {
  const dispatch = useDispatch();
  const presentationData = useSelector(
    (state: RootState) => state.presentationGeneration.presentationData
  );
  const previousSlidesLength = useRef(0);
  const preloadPresentationData = Boolean(options.preloadPresentationData);
  const isSmartMode = options.generationMode === "smart";

  const defaultStatusMessage = isSmartMode
    ? "Preparing Smart presentation"
    : "Creating your presentation";

  const [lifecycle, setLifecycle] =
    useState<GenerationLifecycleState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>(
    defaultStatusMessage
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const isClosedRef = useRef(false);
  const retryCountRef = useRef(0);
  const hasUsefulEventRef = useRef(false);
  const lastUsefulEventAtRef = useRef<number | null>(null);
  const streamStartedAtRef = useRef<number | null>(null);
  const lifecycleRef = useRef<GenerationLifecycleState>("idle");
  const statusMessageRef = useRef<string>(defaultStatusMessage);
  const accumulatedChunksRef = useRef<string>("");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openStreamRef = useRef<() => void>(() => {});

  // Keep lifecycle ref in sync so the stall watcher can read the latest state.
  useEffect(() => {
    lifecycleRef.current = lifecycle;
  }, [lifecycle]);

  // Keep statusMessage ref in sync so stall analytics read the latest value.
  useEffect(() => {
    statusMessageRef.current = statusMessage;
  }, [statusMessage]);

  // Stall watcher: ticks every STALL_INTERVAL_MS and flips lifecycle to
  // "stalled" when no useful event has arrived for STALL_MS. Defined in the
  // hook body (not the effect) so both openStream and keepWaiting can (re)start
  // it — important because an onerror-stall clears the interval, and
  // keepWaiting must be able to resume stall detection afterwards.
  const startStallWatcher = useCallback(() => {
    if (stallIntervalRef.current) {
      return;
    }
    stallIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (
        isStalled({
          now,
          lastUsefulEventAt: lastUsefulEventAtRef.current,
          state: lifecycleRef.current,
        })
      ) {
        setLifecycle("stalled");
        setStatusMessage(
          "Presentation stream stalled — waiting for the server."
        );
        trackEvent(MixpanelEvent.Generation_Stalled, {
          surface: "presentation",
          last_status: statusMessageRef.current,
          duration_ms: now - (streamStartedAtRef.current ?? now),
        });
      }
    }, STALL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    if (!stream) {
      setLifecycle("idle");
      fetchUserSlides();
      return;
    }

    let accumulatedChunks = "";
    const shownAssetWarnings = new Set<string>();
    let preloadAttempted = false;
    let preloadRequest: Promise<void> | null = null;
    const streamStartedAt = Date.now();
    let streamIsTemplateV2 = preloadPresentationData;
    let smartGenerationOutcomeTracked = false;

    streamStartedAtRef.current = streamStartedAt;
    isClosedRef.current = false;
    hasUsefulEventRef.current = false;
    retryCountRef.current = 0;
    accumulatedChunksRef.current = "";
    lastUsefulEventAtRef.current = null;

    const closeEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const clearStallInterval = () => {
      if (stallIntervalRef.current) {
        clearInterval(stallIntervalRef.current);
        stallIntervalRef.current = null;
      }
    };

    const finalizeFailure = (
      description: string,
      opts: { showToast?: boolean } = {}
    ) => {
      if (isSmartMode && !smartGenerationOutcomeTracked) {
        smartGenerationOutcomeTracked = true;
        trackEvent(MixpanelEvent.Smart_Mode_Generation_Failed, {
          presentation_id: presentationId,
          stage: "presentation_stream",
          retry_count: retryCountRef.current,
          duration_ms: Date.now() - streamStartedAt,
          error_message: sanitizeAnalyticsError(description, "Stream failed"),
        });
      }
      if (streamIsTemplateV2) {
        trackEvent(MixpanelEvent.TemplateV2_Stream_Failed, {
          presentation_id: presentationId,
          retry_count: retryCountRef.current,
          duration_ms: Date.now() - streamStartedAt,
          error_message: sanitizeAnalyticsError(description, "Stream failed"),
        });
      }
      closeEventSource();
      clearRetryTimer();
      clearStallInterval();
      setLoading(false);
      dispatch(setStreaming(false));
      setError(true);
      setLifecycle("failed");
      if (opts.showToast !== false) {
        notify.error("Presentation streaming failed", description);
      }
    };

    const scheduleRetry = (reason: string): boolean => {
      const shouldRetry = shouldSilentRetry({
        retryCount: retryCountRef.current,
        hasUsefulEvent: hasUsefulEventRef.current,
        closed: isClosedRef.current,
      });
      if (!shouldRetry) {
        return false;
      }

      const retryCount = (retryCountRef.current += 1);
      const retryDelay = silentRetryDelayMs(retryCount);
      console.warn(
        `Presentation stream retry ${retryCount}/${MAX_STREAM_RETRIES}: ${reason}`
      );

      closeEventSource();
      clearRetryTimer();
      clearStallInterval();
      accumulatedChunks = "";
      accumulatedChunksRef.current = "";
      previousSlidesLength.current = 0;
      setStatusMessage("Reconnecting to presentation stream");
      setLifecycle("connecting");

      retryTimerRef.current = setTimeout(() => {
        if (!isClosedRef.current) {
          openStream();
        }
      }, retryDelay);

      return true;
    };

    const preloadPreparedPresentation = async (force = false) => {
      if ((!preloadPresentationData && !force) || preloadAttempted) return;
      if (preloadRequest) return preloadRequest;

      preloadAttempted = true;
      preloadRequest = (async () => {
        try {
          const response = await fetch(
            getApiUrl(`/api/v1/ppt/presentation/${presentationId}`),
            {
              credentials: "include",
            }
          );
          if (!response.ok) {
            throw new Error("Failed to preload prepared presentation.");
          }
          const preparedPresentation = normalizeBackendAssetUrls(
            await response.json()
          );
          if (!isClosedRef.current) {
            const prev = store.getState().presentationGeneration.presentationData;
            streamIsTemplateV2 =
              streamIsTemplateV2 ||
              isTemplateV2PresentationPayload(preparedPresentation);
            dispatch(
              setPresentationData({
                ...(prev ?? {}),
                ...(preparedPresentation as PresentationData),
                slides: prev?.slides ?? (preparedPresentation as any).slides,
              } as PresentationData)
            );
          }
        } catch (error) {
          console.warn("Could not preload prepared presentation:", error);
        } finally {
          preloadRequest = null;
        }
      })();

      return preloadRequest;
    };

    const trackTemplateV2StreamCompleted = (presentation: unknown) => {
      if (!streamIsTemplateV2 && !isTemplateV2PresentationPayload(presentation)) {
        return;
      }
      streamIsTemplateV2 = true;
      const slides = isTemplateV2PresentationPayload(presentation)
        ? (presentation as Record<string, unknown>).slides
        : store.getState().presentationGeneration.presentationData?.slides;
      trackEvent(MixpanelEvent.TemplateV2_Stream_Completed, {
        presentation_id: presentationId,
        slide_count: Array.isArray(slides) ? slides.length : 0,
        retry_count: retryCountRef.current,
        duration_ms: Date.now() - streamStartedAt,
      });
    };

    const trackSmartModeGenerationCompleted = (presentation: unknown) => {
      if (!isSmartMode || smartGenerationOutcomeTracked) return;
      smartGenerationOutcomeTracked = true;
      const slides =
        presentation &&
        typeof presentation === "object" &&
        Array.isArray((presentation as Record<string, unknown>).slides)
          ? (presentation as Record<string, unknown>).slides
          : store.getState().presentationGeneration.presentationData?.slides;
      trackEvent(MixpanelEvent.Smart_Mode_Generation_Completed, {
        presentation_id: presentationId,
        slide_count: Array.isArray(slides) ? slides.length : 0,
        retry_count: retryCountRef.current,
        duration_ms: Date.now() - streamStartedAt,
      });
    };

    const updateGeneratingStatus = (slidesLength: number) => {
      const total =
        store.getState().presentationGeneration.presentationData?.structure
          ?.slides?.length ?? 0;
      setStatusMessage(
        total
          ? `Creating slide ${slidesLength} of ${total}…`
          : `Creating slide ${slidesLength}…`
      );
    };

    const removeStreamParamFromUrl = () => {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("stream");
      window.history.replaceState({}, "", newUrl.toString());
    };

    const openStream = () => {
      closeEventSource();
      clearStallInterval();

      // Start each (re)open from a clean buffer so a new job (e.g. after retry)
      // does not append to stale partial JSON. Also reset the slide-diff ref
      // so the new job's slides are not diffed against the previous job's.
      accumulatedChunks = "";
      accumulatedChunksRef.current = "";
      previousSlidesLength.current = 0;

      // Stream just (re)opened: reset stall clock so a hung CONNECT also stalls
      // after STALL_MS. Heartbeat is NOT useful, so it must not refresh this.
      const now = Date.now();
      lastUsefulEventAtRef.current = now;
      if (streamStartedAtRef.current == null) {
        streamStartedAtRef.current = now;
      }
      setLifecycle("connecting");

      const eventSource = new EventSource(
        getApiUrl(`/api/v1/ppt/presentation/stream/${presentationId}`)
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("response", async (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          if (!scheduleRetry("invalid SSE payload")) {
            finalizeFailure("Failed to parse stream response.");
          }
          return;
        }

        if (isUsefulStreamEvent(data.type)) {
          if (!hasUsefulEventRef.current) {
            hasUsefulEventRef.current = true;
          }
          lastUsefulEventAtRef.current = Date.now();
          // A useful event recovers stalled → generating. Do NOT guard with
          // !== "stalled": isStalled already returns false for stalled state,
          // so this organic recovery matches the Task 5 fix.
          if (
            data.type !== "complete" &&
            data.type !== "closing" &&
            data.type !== "error"
          ) {
            setLifecycle("generating");
          }
        }

        switch (data.type) {
          case "fonts": {
            if (data.fonts && typeof data.fonts === "object") {
              const prev = store.getState().presentationGeneration.presentationData;
              dispatch(
                setPresentationData({
                  ...(prev ?? {}),
                  fonts: data.fonts,
                  slides: prev?.slides ?? [],
                } as PresentationData)
              );
            }
            break;
          }

          case "slide_html": {
            const slideIndex = Number(data.index);
            const html = typeof data.html === "string" ? data.html : "";
            if (!Number.isFinite(slideIndex) || !html) break;

            const incomingSlide =
              data.slide && typeof data.slide === "object"
                ? data.slide
                : {
                    id: data.slide_id,
                    index: slideIndex,
                    layout: "smart-html",
                    layout_group: "smart-html",
                    content: { title: `Slide ${slideIndex + 1}` },
                    html_content: html,
                  };
            const normalizedSlide = normalizeBackendAssetUrls(incomingSlide);
            const prev = store.getState().presentationGeneration.presentationData;
            const mergedSlides = mergeSingleSlidePreservingResolvedAssets(
              prev?.slides,
              normalizedSlide
            );
            dispatch(
              setPresentationData({
                ...(prev ?? {}),
                slides: mergedSlides,
              } as PresentationData)
            );
            previousSlidesLength.current = mergedSlides.length;
            updateGeneratingStatus(mergedSlides.length);
            setLoading(false);
            break;
          }

          case "chunk":
            accumulatedChunks += data.chunk;
            accumulatedChunksRef.current = accumulatedChunks;
            const streamedSlide = parseStreamedSlideChunk(data.chunk);
            if (streamedSlide) {
              const prev = store.getState().presentationGeneration.presentationData;
              const normalizedSlide = normalizeBackendAssetUrls(streamedSlide);
              const mergedSlides = mergeSingleSlidePreservingResolvedAssets(
                prev?.slides,
                normalizedSlide
              );
              dispatch(
                setPresentationData({
                  ...(prev ?? {}),
                  slides: mergedSlides,
                } as PresentationData)
              );
              previousSlidesLength.current = mergedSlides.length;
              updateGeneratingStatus(mergedSlides.length);
              setLoading(false);
              if (
                isTemplateV2SlidePayload(normalizedSlide) &&
                !hasTemplateV2LayoutPayload(prev?.layout)
              ) {
                streamIsTemplateV2 = true;
                void preloadPreparedPresentation(true);
              }
            }

            try {
              const repairedJson = jsonrepair(accumulatedChunks);
              const partialData = JSON.parse(repairedJson);
              const normalizedPartialData = normalizeBackendAssetUrls(partialData);

              if (
                normalizedPartialData.slides &&
                normalizedPartialData.slides.length > 0
              ) {
                const prev =
                  store.getState().presentationGeneration.presentationData;
                const mergedSlides = mergeSlidesPreservingResolvedAssets(
                  prev?.slides,
                  normalizedPartialData.slides
                );
                dispatch(
                  setPresentationData({
                    ...(prev ?? {}),
                    ...normalizedPartialData,
                    slides: mergedSlides,
                  } as PresentationData)
                );
                previousSlidesLength.current =
                  normalizedPartialData.slides.length;
                updateGeneratingStatus(mergedSlides.length);
                setLoading(false);
              }
            } catch {
              // JSON isn't complete yet, continue accumulating
            }
            break;

          case "slide_assets": {
            if (
              data.slide &&
              typeof data.slide === "object"
            ) {
              const prev = store.getState().presentationGeneration.presentationData;
              const normalizedSlide = normalizeBackendAssetUrls(data.slide);
              const mergedSlides = mergeSingleSlidePreservingResolvedAssets(
                prev?.slides,
                normalizedSlide
              );
              dispatch(
                setPresentationData({
                  ...(prev ?? {}),
                  slides: mergedSlides,
                } as PresentationData)
              );
              if (
                isTemplateV2SlidePayload(normalizedSlide) &&
                !hasTemplateV2LayoutPayload(prev?.layout)
              ) {
                streamIsTemplateV2 = true;
                void preloadPreparedPresentation(true);
              }
            }
            if (Array.isArray(data.warnings)) {
              for (const warning of data.warnings) {
                const detail =
                  warning &&
                  typeof warning === "object" &&
                  typeof warning.detail === "string"
                    ? warning.detail
                    : null;
                if (!detail || shownAssetWarnings.has(detail)) {
                  continue;
                }
                shownAssetWarnings.add(detail);
                notify.warning("Some images could not be generated", detail, {
                  duration: 12_000,
                });
              }
            }
            break;
          }

          case "complete":
            try {
              const hasCompletePresentation =
                data.presentation &&
                typeof data.presentation === "object" &&
                !Array.isArray(data.presentation);
              let completedPresentation: unknown = hasCompletePresentation
                ? data.presentation
                : null;

              if (hasCompletePresentation) {
                dispatch(
                  setPresentationData(
                    mergePresentationPreservingTemplateData(
                      normalizeBackendAssetUrls(
                        data.presentation
                      ) as PresentationData
                    )
                  )
                );
              } else if (
                isSmartMode &&
                typeof data.presentation_id === "string" &&
                data.presentation_id === presentationId
              ) {
                // Smart v2 completes with only the presentation id. The local
                // proxy mirrors the finished cloud deck before forwarding this
                // event, so load that persisted presentation for the editor.
                const fetchedPresentation = await fetchUserSlides({
                  clearHistory: false,
                });
                if (!fetchedPresentation) {
                  throw new Error("Completed presentation could not be loaded");
                }
                completedPresentation = fetchedPresentation;
              } else {
                throw new Error("Completion event did not contain a presentation");
              }

              if (!completedPresentation) {
                throw new Error("Completed presentation could not be loaded");
              }

              trackTemplateV2StreamCompleted(completedPresentation);
              trackSmartModeGenerationCompleted(completedPresentation);
              dispatch(setStreaming(false));
              setLoading(false);
              isClosedRef.current = true;
              closeEventSource();
              clearRetryTimer();
              clearStallInterval();
              retryCountRef.current = 0;
              setStatusMessage("Presentation ready");
              setLifecycle("complete");

              // Remove stream parameter from URL
              removeStreamParamFromUrl();
            } catch (error) {
              console.error("Could not finalize presentation stream:", error);
              if (!scheduleRetry("failed to parse complete payload")) {
                finalizeFailure("Failed to load the completed presentation.");
              }
            }
            accumulatedChunks = "";
            accumulatedChunksRef.current = "";
            break;

          case "closing":
            dispatch(
              setPresentationData(
                mergePresentationPreservingTemplateData(
                  normalizeBackendAssetUrls(data.presentation) as PresentationData
                )
              )
            );
            trackTemplateV2StreamCompleted(data.presentation);
            trackSmartModeGenerationCompleted(data.presentation);
            setLoading(false);
            dispatch(setStreaming(false));
            isClosedRef.current = true;
            closeEventSource();
            clearRetryTimer();
            clearStallInterval();
            retryCountRef.current = 0;
            setStatusMessage("Presentation ready");
            setLifecycle("complete");

            // Remove stream parameter from URL
            removeStreamParamFromUrl();
            break;

          case "error":
            // Server already failed the job: do NOT silent-retry.
            finalizeFailure(
              data.detail ||
                "Failed to connect to the server. Please try again."
            );
            break;

          case "status":
            if (data.status) {
              setStatusMessage(data.status);
            }
            break;

          case "heartbeat":
            // Socket is alive. NOT a useful event: do NOT refresh
            // lastUsefulEventAt. No-op so the stall watcher keeps running.
            break;
        }
      });

      eventSource.onerror = () => {
        if (isClosedRef.current) {
          return;
        }
        if (!hasUsefulEventRef.current) {
          // Connection lost before any useful event: silent retry allowed.
          if (!scheduleRetry("connection lost")) {
            finalizeFailure(
              "Failed to connect to the server. Please try again."
            );
          }
          return;
        }
        // After a useful event, a dead socket is a stall — do NOT reopen.
        closeEventSource();
        clearStallInterval();
        setLifecycle("stalled");
        setStatusMessage(
          "Presentation stream stalled — waiting for the server."
        );
        trackEvent(MixpanelEvent.Generation_Stalled, {
          surface: "presentation",
          last_status: statusMessageRef.current,
          duration_ms: Date.now() - (streamStartedAtRef.current ?? Date.now()),
        });
      };

      // Stall watcher: ticks every STALL_INTERVAL_MS and flips to "stalled"
      // when no useful event has arrived for STALL_MS. Uses the shared
      // startStallWatcher so keepWaiting can resume detection after an
      // onerror-stall cleared the interval.
      clearStallInterval();
      startStallWatcher();
    };

    openStreamRef.current = openStream;

    const startStream = async () => {
      dispatch(setStreaming(true));
      dispatch(clearPresentationData());
      trackEvent(MixpanelEvent.Presentation_Stream_API_Call, {
        presentation_id: presentationId,
        generation_mode: options.generationMode ?? "standard",
      });
      setStatusMessage(defaultStatusMessage);
      setLifecycle("connecting");
      await preloadPreparedPresentation();
      if (!isClosedRef.current) {
        openStream();
      }
    };

    void startStream();

    return () => {
      isClosedRef.current = true;
      closeEventSource();
      clearRetryTimer();
      clearStallInterval();
    };
  }, [
    presentationId,
    stream,
    dispatch,
    setLoading,
    setError,
    fetchUserSlides,
    preloadPresentationData,
    isSmartMode,
    options.generationMode,
    defaultStatusMessage,
  ]);

  // isStreaming is derived from lifecycle so it always agrees.
  const isStreaming = STREAMING_STATES.has(lifecycle);

  // draftCount read from the store reactively (slides length).
  const draftCount = presentationData?.slides?.length ?? 0;

  const cancel = useCallback(async () => {
    const previousLifecycle = lifecycleRef.current;
    setLifecycle("cancelling");
    isClosedRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallIntervalRef.current) {
      clearInterval(stallIntervalRef.current);
      stallIntervalRef.current = null;
    }
    dispatch(setStreaming(false));
    setLoading(false);
    // Remove the stream search param so a refresh/reload does not resume.
    if (typeof window !== "undefined") {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("stream");
      window.history.replaceState({}, "", newUrl.toString());
    }
    setLifecycle("cancelled");
    const draftSlides =
      store.getState().presentationGeneration.presentationData?.slides?.length ??
      0;
    trackEvent(MixpanelEvent.Generation_Cancelled, {
      surface: "presentation",
      reason:
        previousLifecycle === "stalled" ? "user_stop_stalled" : "user_stop",
      draft_count: draftSlides,
      duration_ms: Date.now() - (streamStartedAtRef.current ?? Date.now()),
    });
    // Best-effort persist of the stopped slide draft. Set lifecycle to
    // "cancelled" BEFORE the await so the UI dismisses the bar immediately;
    // the UI fire-and-forgets this with `void cancel()` (Task 8). Do NOT
    // clearPresentationData: cancel keeps the current Redux slides as the draft.
    const presentationData = store.getState().presentationGeneration.presentationData;
    const slides = presentationData?.slides;
    if (Array.isArray(slides) && slides.length > 0) {
      try {
        await PresentationGenerationApi.updatePresentationContent(
          JSON.stringify(presentationData)
        );
      } catch {
        notify.error("Draft not saved", "Refresh may lose the stopped slides.");
      }
    }
  }, [dispatch, setLoading]);

  const keepWaiting = useCallback(() => {
    const stalledForMs =
      Date.now() - (lastUsefulEventAtRef.current ?? Date.now());
    lastUsefulEventAtRef.current = Date.now();
    setLifecycle("generating");
    // An onerror-stall clears the stall interval. Restart it here so stall
    // detection continues if the user opts to keep waiting after a socket
    // death (intended recovery after socket death is retry, but keepWaiting
    // must not leave the watcher dead).
    if (!stallIntervalRef.current) {
      startStallWatcher();
    }
    trackEvent(MixpanelEvent.Generation_Keep_Waiting, {
      surface: "presentation",
      stalled_for_ms: stalledForMs,
    });
  }, [startStallWatcher]);

  const retry = useCallback(() => {
    const fromState = lifecycleRef.current;
    if (fromState !== "stalled" && fromState !== "failed") {
      return;
    }
    hasUsefulEventRef.current = false;
    retryCountRef.current = 0;
    isClosedRef.current = false;
    accumulatedChunksRef.current = "";
    previousSlidesLength.current = 0;
    lastUsefulEventAtRef.current = null;
    streamStartedAtRef.current = null;
    setLifecycle("connecting");
    setStatusMessage(defaultStatusMessage);
    trackEvent(MixpanelEvent.Generation_Retry_Clicked, {
      surface: "presentation",
      from_state: fromState,
    });
    openStreamRef.current();
  }, [defaultStatusMessage]);

  return {
    lifecycle,
    isStreaming,
    statusMessage,
    draftCount,
    cancel,
    keepWaiting,
    retry,
  };
};