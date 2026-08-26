import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notify } from "@/components/ui/sonner";
import { setOutlines } from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { RootState } from "@/store/store";
import { getApiUrl } from "@/utils/api";
import { limitOutlines } from "@/utils/presentationLimits";
import {
  isStalled,
  isUsefulStreamEvent,
  shouldShowKeepWaiting,
  shouldSilentRetry,
  silentRetryDelayMs,
  type GenerationLifecycleState,
  type StallCause,
} from "@/lib/generation-lifecycle";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";

const DEFAULT_STATUS_MESSAGE = "Preparing your presentation outline";
const STALL_INTERVAL_MS = 1_000;

const STREAMING_STATES: ReadonlySet<GenerationLifecycleState> = new Set([
  "connecting",
  "generating",
  "stalled",
  "cancelling",
]);

export const useOutlineStreaming = (
  presentationId: string | null,
  enabled = true
) => {
  const dispatch = useDispatch();
  const { outlines } = useSelector(
    (state: RootState) => state.presentationGeneration
  );
  const [isLoading, setIsLoading] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number | null>(null);
  const [highestActiveIndex, setHighestActiveIndex] = useState<number>(-1);
  const [statusMessage, setStatusMessage] = useState(DEFAULT_STATUS_MESSAGE);
  const [lifecycle, setLifecycle] =
    useState<GenerationLifecycleState>("idle");
  const [stallCause, setStallCause] = useState<StallCause | null>(null);

  const outlinesRef = useRef<{ content: string }[]>(outlines);
  const prevSlidesRef = useRef<{ content: string }[]>([]);
  const activeIndexRef = useRef<number>(-1);
  const highestIndexRef = useRef<number>(-1);

  const eventSourceRef = useRef<EventSource | null>(null);
  const isClosedRef = useRef(false);
  const retryCountRef = useRef(0);
  const hasUsefulEventRef = useRef(false);
  const lastUsefulEventAtRef = useRef<number | null>(null);
  const streamStartedAtRef = useRef<number | null>(null);
  const lifecycleRef = useRef<GenerationLifecycleState>("idle");
  const stallCauseRef = useRef<StallCause | null>(null);
  const statusMessageRef = useRef<string>(DEFAULT_STATUS_MESSAGE);

  const accumulatedChunksRef = useRef<string>("");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep outlines ref in sync for use inside effect callbacks.
  useEffect(() => {
    outlinesRef.current = outlines;
  }, [outlines]);

  // Keep lifecycle ref in sync so the stall watcher can read the latest state.
  useEffect(() => {
    lifecycleRef.current = lifecycle;
  }, [lifecycle]);

  useEffect(() => {
    stallCauseRef.current = stallCause;
  }, [stallCause]);

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
        const cause: StallCause = eventSourceRef.current ? "silence" : "socket";
        stallCauseRef.current = cause;
        setStallCause(cause);
        setLifecycle("stalled");
        setStatusMessage("Outline stream stalled — waiting for the server.");
        trackEvent(MixpanelEvent.Generation_Stalled, {
          surface: "outline",
          last_status: statusMessageRef.current,
          duration_ms: now - (streamStartedAtRef.current ?? now),
        });
      }
    }, STALL_INTERVAL_MS);
  }, []);

  // openStream is defined inside the effect below because it captures
  // accumulatedChunksRef/prevSlidesRef and status setters; the effect re-runs
  // only on presentationId/enabled dispatch.
  const openStreamRef = useRef<() => void>(() => {});

  useEffect(() => {
    const resetStreamingState = (message = DEFAULT_STATUS_MESSAGE) => {
      setIsLoading(false);
      setActiveSlideIndex(null);
      setHighestActiveIndex(-1);
      setStatusMessage(message);
      prevSlidesRef.current = [];
      activeIndexRef.current = -1;
      highestIndexRef.current = -1;
    };

    if (!enabled || !presentationId || outlinesRef.current.length > 0) {
      resetStreamingState();
      setLifecycle("idle");
      return;
    }

    let accumulatedChunks = "";

    const closeEventSourceLocal = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const clearRetryTimerLocal = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const clearStallIntervalLocal = () => {
      if (stallIntervalRef.current) {
        clearInterval(stallIntervalRef.current);
        stallIntervalRef.current = null;
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
        `Outline stream retry ${retryCount}: ${reason}`
      );

      closeEventSourceLocal();
      clearRetryTimerLocal();
      accumulatedChunks = "";
      accumulatedChunksRef.current = "";
      prevSlidesRef.current = [];
      activeIndexRef.current = -1;
      highestIndexRef.current = -1;
      setStatusMessage("Reconnecting to outline stream");
      setLifecycle("connecting");

      retryTimerRef.current = setTimeout(() => {
        if (!isClosedRef.current) {
          openStream();
        }
      }, retryDelay);

      return true;
    };

    const openStream = () => {
      closeEventSourceLocal();
      clearStallIntervalLocal();

      // Start each (re)open from a clean buffer so a new job (e.g. after retry)
      // does not append to stale partial JSON. Also reset the slide-diff refs
      // so the new job's slides are not diffed against the previous job's.
      accumulatedChunks = "";
      accumulatedChunksRef.current = "";
      prevSlidesRef.current = [];
      activeIndexRef.current = -1;
      highestIndexRef.current = -1;
      setActiveSlideIndex(null);
      setHighestActiveIndex(-1);

      // Stream just (re)opened: reset stall clock so a hung CONNECT also stalls
      // after STALL_MS. Heartbeat is NOT useful, so it must not refresh this.
      const now = Date.now();
      lastUsefulEventAtRef.current = now;
      if (streamStartedAtRef.current == null) {
        streamStartedAtRef.current = now;
      }
      setLifecycle("connecting");

      const eventSource = new EventSource(
        getApiUrl(`/api/v1/ppt/outlines/stream/${presentationId}`)
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("response", (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          if (!scheduleRetry("invalid SSE payload")) {
            resetStreamingState();
            setLifecycle("failed");
            notify.error(
              "Stream parse failed",
              "Failed to parse outline stream response."
            );
          }
          return;
        }

        if (isUsefulStreamEvent(data.type)) {
          if (!hasUsefulEventRef.current) {
            hasUsefulEventRef.current = true;
          }
          lastUsefulEventAtRef.current = Date.now();
        }

        switch (data.type) {
          case "status":
            if (data.status) {
              setStatusMessage(data.status);
            }
            setLifecycle("generating");
            break;

          case "chunk":
            accumulatedChunks += data.chunk;
            accumulatedChunksRef.current = accumulatedChunks;
            try {
              const repairedJson = jsonrepair(accumulatedChunks);
              const partialData = JSON.parse(repairedJson);

              if (partialData.slides) {
                const nextSlides: { content: string }[] =
                  limitOutlines(partialData.slides || []);
                try {
                  const prev = prevSlidesRef.current || [];
                  let changedIndex: number | null = null;
                  const maxLen = Math.max(prev.length, nextSlides.length);
                  for (let i = 0; i < maxLen; i++) {
                    const prevContent = prev[i]?.content;
                    const nextContent = nextSlides[i]?.content;
                    if (nextContent !== prevContent) {
                      changedIndex = i;
                    }
                  }
                  const prevActive = activeIndexRef.current;
                  let nextActive = changedIndex ?? prevActive;
                  if (nextActive < prevActive) {
                    nextActive = prevActive;
                  }
                  activeIndexRef.current = nextActive;
                  setActiveSlideIndex(nextActive);

                  if (nextActive > highestIndexRef.current) {
                    highestIndexRef.current = nextActive;
                    setHighestActiveIndex(nextActive);
                  }
                } catch {}

                prevSlidesRef.current = nextSlides;
                dispatch(setOutlines(nextSlides));
                setIsLoading(false);
                setLifecycle("generating");
              }
            } catch {
              // JSON is not complete yet, so keep accumulating chunks.
            }
            break;

          case "heartbeat":
            // Socket is alive. NOT a useful event: do NOT refresh
            // lastUsefulEventAt. No-op so the stall watcher keeps running.
            break;

          case "complete":
            try {
              const outlinesData: { content: string }[] =
                limitOutlines(data.presentation.outlines.slides);
              dispatch(setOutlines(outlinesData));
              setIsLoading(false);
              setActiveSlideIndex(null);
              setHighestActiveIndex(-1);
              setStatusMessage("Outline ready");
              prevSlidesRef.current = outlinesData;
              activeIndexRef.current = -1;
              highestIndexRef.current = -1;
              isClosedRef.current = true;
              closeEventSourceLocal();
              clearRetryTimerLocal();
              clearStallIntervalLocal();
              setLifecycle("complete");
            } catch {
              if (!scheduleRetry("failed to parse complete payload")) {
                resetStreamingState();
                setLifecycle("failed");
                notify.error("Parse failed", "Failed to parse presentation data.");
              }
            }
            accumulatedChunks = "";
            accumulatedChunksRef.current = "";
            break;

          case "closing":
            resetStreamingState("Outline ready");
            isClosedRef.current = true;
            closeEventSourceLocal();
            clearRetryTimerLocal();
            clearStallIntervalLocal();
            setLifecycle("complete");
            break;

          case "error":
            // Server already failed the job: do NOT silent-retry.
            isClosedRef.current = true;
            closeEventSourceLocal();
            clearRetryTimerLocal();
            clearStallIntervalLocal();
            resetStreamingState();
            setLifecycle("failed");
            notify.error(
              "Outline streaming failed",
              data.detail ||
                "Failed to connect to the server. Please try again."
            );
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
            resetStreamingState();
            closeEventSourceLocal();
            clearStallIntervalLocal();
            setLifecycle("failed");
            notify.error(
              "Connection failed",
              "Failed to connect to the server. Please try again."
            );
          }
          return;
        }
        // After a useful event, a dead socket is a stall — do NOT reopen.
        closeEventSourceLocal();
        clearStallIntervalLocal();
        stallCauseRef.current = "socket";
        setStallCause("socket");
        setLifecycle("stalled");
        setStatusMessage("Outline stream stalled — waiting for the server.");
        trackEvent(MixpanelEvent.Generation_Stalled, {
          surface: "outline",
          last_status: statusMessageRef.current,
          duration_ms: Date.now() - (streamStartedAtRef.current ?? Date.now()),
        });
      };

      // Stall watcher: ticks every STALL_INTERVAL_MS and flips to "stalled"
      // when no useful event has arrived for STALL_MS. Uses the shared
      // startStallWatcher so keepWaiting can resume detection after an
      // onerror-stall cleared the interval.
      clearStallIntervalLocal();
      startStallWatcher();
    };

    openStreamRef.current = openStream;

    setStatusMessage(DEFAULT_STATUS_MESSAGE);
    setIsLoading(true);
    isClosedRef.current = false;
    hasUsefulEventRef.current = false;
    retryCountRef.current = 0;
    accumulatedChunksRef.current = "";
    lastUsefulEventAtRef.current = null;
    streamStartedAtRef.current = null;
    openStream();

    return () => {
      isClosedRef.current = true;
      closeEventSourceLocal();
      clearRetryTimerLocal();
      clearStallIntervalLocal();
    };
  }, [presentationId, dispatch, enabled]);

  // isStreaming is derived from lifecycle so it always agrees.
  const isStreaming = STREAMING_STATES.has(lifecycle);

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
    setIsLoading(false);
    setLifecycle("cancelled");
    trackEvent(MixpanelEvent.Generation_Cancelled, {
      surface: "outline",
      reason:
        previousLifecycle === "stalled" ? "user_stop_stalled" : "user_stop",
      draft_count: outlinesRef.current.length,
      duration_ms: Date.now() - (streamStartedAtRef.current ?? Date.now()),
    });
    // Best-effort persist of the stopped outline draft. Set lifecycle to
    // "cancelled" BEFORE the await so the UI dismisses the bar immediately;
    // the UI fire-and-forgets this with `void cancel()` (Task 8).
    const slides = outlinesRef.current;
    if (slides.length > 0 && presentationId) {
      try {
        await PresentationGenerationApi.updateOutlines(presentationId, slides);
      } catch {
        notify.error("Draft not saved", "Refresh may lose the stopped outline.");
      }
    }
    // Do NOT clear Redux outlines. Do NOT mark the outline as fully ready.
  }, [presentationId]);

  const keepWaiting = useCallback(() => {
    if (!eventSourceRef.current) {
      return;
    }
    const stalledForMs =
      Date.now() - (lastUsefulEventAtRef.current ?? Date.now());
    lastUsefulEventAtRef.current = Date.now();
    stallCauseRef.current = null;
    setStallCause(null);
    setLifecycle("generating");
    // An onerror-stall clears the stall interval. Restart it here so stall
    // detection continues if the user opts to keep waiting after a socket
    // death (intended recovery after socket death is retry, but keepWaiting
    // must not leave the watcher dead).
    if (!stallIntervalRef.current) {
      startStallWatcher();
    }
    trackEvent(MixpanelEvent.Generation_Keep_Waiting, {
      surface: "outline",
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
    lastUsefulEventAtRef.current = null;
    streamStartedAtRef.current = null;
    stallCauseRef.current = null;
    setStallCause(null);
    setLifecycle("connecting");
    setIsLoading(true);
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
    trackEvent(MixpanelEvent.Generation_Retry_Clicked, {
      surface: "outline",
      from_state: fromState,
    });
    openStreamRef.current();
  }, []);

  return {
    isStreaming,
    isLoading,
    activeSlideIndex,
    highestActiveIndex,
    statusMessage,
    lifecycle,
    draftCount: outlines.length,
    canKeepWaiting: shouldShowKeepWaiting(stallCause),
    cancel,
    keepWaiting,
    retry,
  };
};
