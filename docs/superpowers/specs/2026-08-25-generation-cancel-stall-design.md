# Generation Cancel + Stall — Design Spec

**Date:** 2026-08-25  
**Status:** Draft  
**Approach:** A — progress-first generation chrome; cancel is secondary while work is moving, and becomes a stall recovery action after silence.

## Product goal

Users can stop outline or slide generation without feeling they must race the model. The default action is to wait with visible progress. Cancel exists for true stalls and impatient exits, but it must not be the loudest control while tokens are still arriving.

This spec covers the product UI generation paths:

- Outline SSE: `GET /api/v1/ppt/outlines/stream/{id}`
- Standard slide SSE: `GET /api/v1/ppt/presentation/stream/{id}`
- Smart slide SSE: the same presentation stream when `generation_mode == "smart"`

Out of scope: chat edits, image picker generate, custom-template reconstruction, export, API `generate_presentation_handler` except where disconnect plumbing is shared.

## Problem

Generation already streams, but the client waits forever and the loudest signal is a spinner / fake overlay progress bar.

| Failure | What happens today |
|---|---|
| Perceived hang | Long first-token wait (web search, documents, reasoning). Outline status is `sr-only`. Slide overlay uses a fake 90s bar. |
| Silent retry | EventSource `onerror` retries up to 3 times **from scratch**, even after slides already arrived. |
| Weak cancel | Closing the tab is the only stop. Outline stream checks `request.is_disconnected`. Presentation stream does not take `Request`, so cancel is delayed until the next SSE yield. |
| True hang | OpenAI/custom clients are created without an app timeout. EventSource has no client watchdog. `CLIENT_DISCONNECT_POLL_SECONDS` is unused during token iteration. |
| Lost work | Slides persist only after the stream finishes. Cancel mid-way leaves Redux drafts that a refresh throws away. |

Users who are not patient will cancel a healthy job if Stop is always primary. Users who hit a stall have no recovery besides refresh.

## Decisions locked

| Topic | Choice |
|---|---|
| Approach | **A**: progress-first bar + stall-aware cancel. Not always-on Stop. Not timeout-only. |
| Progress vs heartbeat | Heartbeat keeps the SSE connection alive. It is **not** progress. Stall uses last *useful* event only. |
| Stall threshold | **45 seconds** without a useful event. |
| Useful events | `status`, `chunk` with parseable outline/slide progress, `slide_html`, `slide_assets`, `fonts`, `complete`, `closing`, `error`. Not `heartbeat`. |
| Silent reconnect | Allowed only **before the first useful event**, max 3 attempts, backoff 1s / 2s / 3s. After first useful event, connection loss → stalled recovery, do not restart the job. |
| Cancel confirm | Confirm if any draft exists (outline slide or generated slide). No confirm if nothing has arrived. |
| Partial results | Keep the in-memory draft. Persist it on cancel so refresh does not restart a blank job. |
| Overlay | Do not trap the user in `OverlayLoader` for the whole stream. Replace with in-place generation chrome after stream start (immediately for outline; after prepare navigation for slides). |
| Copy language | English, matching current generator UI. |
| LLM request timeout | **180s** total per provider HTTP request for OpenAI and custom OpenAI-compatible clients. Connect timeout 10s. Google: set equivalent HTTP timeout if the client accepts it; do not invent a second stack. |
| Upstream magnets | Do not split `presentation.py`, `Chat.tsx`, `memory_layer.py`, `templates/v2/generation.py`. |

## Approaches considered

**A — Progress-first + stall recovery (chosen)**  
In-place generation bar. Stop is a quiet text button while events arrive. After 45s silence, the bar becomes a recovery card: Keep waiting / Stop / Try again. Backend abort is wired so Stop actually stops.

- Pros: matches the patience concern; still escapes hangs.  
- Cons: more UI states than a single Stop button.

**B — Always-visible primary Stop**  
Stop next to the spinner from second 0, confirm every time.

- Rejected: trains users to abort healthy 30–90s outline jobs and multi-minute decks.

**C — No cancel; hard timeout then retry**  
Kill the job at 3 minutes and ask to retry.

- Rejected: a 10-slide deck can legitimately exceed 3 minutes; a hung custom LLM can exceed any fixed budget. Users still need a manual stop.

## Lifecycle

Shared client state machine. One implementation, used by outline and presentation stream hooks.

```
connecting → generating → complete
                ↓
             stalled ⇄ generating   (Keep waiting)
                ↓
            cancelling → cancelled
                ↓
              failed            (error after retries exhausted, or user Try again → connecting)
```

| State | UI | Stop |
|---|---|---|
| `connecting` | “Starting…” | Quiet Stop, no confirm |
| `generating` | Live status + counts | Quiet Stop; confirm if draft exists |
| `stalled` | “This is taking longer than usual” | Recovery: Keep waiting (primary), Stop, Try again |
| `cancelling` | “Stopping…” | Disabled |
| `cancelled` | Draft kept; generation chrome dismissed | — |
| `failed` | Existing error toast + retry | — |
| `complete` | Current success path | — |

`Keep waiting` resets the stall timer and returns to `generating`. It does not reconnect. The EventSource stays open.

`Try again` is user-initiated. It closes the current EventSource if any, then opens a new stream. Allowed from `stalled` or `failed`, not from `generating`.

## Progress copy

Use server `status` when present. Otherwise:

| Surface | Connecting | Generating | Extra |
|---|---|---|---|
| Outline | Preparing your presentation outline | Server status, or “Writing outline {n}…” once slides exist | “This usually takes under a minute.” |
| Standard slides | Creating your presentation | “Creating slide {n} of {total}…” | “This can take a few minutes depending on slide count.” |
| Smart slides | Preparing Smart presentation | Server status, or “Creating slide {n} of {total}…” | Same as standard |

`{total}` is `presentation.n_slides` or outline length after prepare. `{n}` is the highest received slide/outline index + 1.

Do not show a fake determinate percent. The current `ProgressBar` animation in `OverlayLoader` is not progress.

## Cancel UX

### Quiet Stop (connecting / generating)

Secondary text button in the generation bar: **Stop**. Not red, not full-width, not the only visible action.

If a draft exists, confirm:

- Outline: “Stop generating this outline? {n} section(s) already drafted will be kept.”
- Slides: “Stop generating these slides? {n} of {total} slide(s) already drafted will be kept.”

If no draft: stop immediately.

After confirm: close EventSource, persist draft, strip `stream=true` from the presentation URL, toast “Generation stopped. Your draft so far was kept.” (or “Generation stopped.” when empty).

### Stall recovery

After 45s without a useful event, the same bar switches to:

- Title: “This is taking longer than usual”
- Body: last status, or “No new content for 45 seconds.”
- **Keep waiting** (primary)
- **Stop** (same confirm rules)
- **Try again** (no confirm; restarts the stream)

Stall is the moment Stop is allowed to feel loud. Healthy generation never reaches this card.

## Backend abort

Stop must cancel the server job, not only the UI spinner.

1. **Presentation stream takes `Request`.** `stream_presentation` and `_stream_smart_presentation` pass `request.is_disconnected` into slide LLM calls, same pattern as `stream_outlines`.
2. **Poll disconnect during token iteration.** Use existing `CLIENT_DISCONNECT_POLL_SECONDS = 0.1` inside `stream_generate_events` iteration so a Stop during a long completion does not wait for the full 180s timeout.
3. **Heartbeat SSE events** every 15s while the generator is blocked, via `safe_sse_stream` (or a wrapper next to it). Payload: `{"type":"heartbeat"}`. Proxies stay alive. Client stall logic ignores them.
4. **Do not retry after disconnect.** Existing `generate_structured_with_schema_retries` already raises `CancelledError` without looping. Keep that. Heartbeat must not swallow `CancelledError`.
5. **LLM HTTP timeout 180s** on OpenAI and custom clients in `get_llm_client()`. A hung provider then fails into the existing SSE error path instead of an infinite EventSource.

Cancel lag budget: after EventSource.close(), the next disconnect poll (≤100ms) or the next heartbeat check should observe disconnect. At most one in-flight LLM request may finish if the SDK cannot abort the HTTP body; the next request must not start.

## Persist on cancel

Today outlines commit only on SSE `complete`. Slides commit only after every slide + assets finish.

On user cancel with a non-empty draft:

- Outline: `PUT /api/v1/ppt/outlines/{id}` with the Redux slides.
- Standard/smart slides: `PATCH /api/v1/ppt/presentation/update` with the slides already in Redux (best-effort). If persist fails, keep Redux and toast that refresh may lose the draft.

Do not mark a cancelled outline as fully ready if the user still needs to edit it. `hasOutlineStreamFinished` becomes true so Continue is enabled when at least one outline slide exists.

Do not auto-start outline streaming when cancelled drafts already exist in Redux (`outlines.length > 0` already gates `useOutlineStreaming`). After persist, a refresh should load those outlines and **must not** reopen `/outlines/stream/{id}`.

Presentation URL: remove `stream` on cancel/complete/fail so a refresh does not reopen `/presentation/stream/{id}`.

## Frontend stream policy

Replace the current “retry 3 times from scratch on any error” in:

- `servers/nextjs/app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts`
- `servers/nextjs/app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts`

New rules:

1. Connection error before first useful event → silent retry, max 3, same backoff.
2. Connection error after first useful event → `stalled` if the socket died quietly, or `failed` if the server sent `error`. Never reopen a duplicate generator automatically.
3. Server `error` event → `failed`. Do not silently retry a failed generation (it would start a second LLM job).
4. Unmount / navigation away → close EventSource (already done). Treat as cancel without persist if the user left the page; persist is best-effort on explicit Stop only.
5. Expose `cancel()`, `keepWaiting()`, `retry()`, lifecycle state, `lastUsefulEventAt`, progress counts.

Shared helper lives in `servers/nextjs/lib/generation-lifecycle.ts` so the two hooks cannot drift.

## UI placement

### Outline

Keep generating in `OutlineContent` (list + skeletons). Add a visible generation bar above the list (not `sr-only` only). Quiet Stop on the right of the bar. Stall recovery replaces the bar content.

`GenerateButton` stays disabled while `generating` / `stalled` / `cancelling`. After `cancelled` with drafts, it is enabled.

### Presentation

`PresentationPage` currently uses `STREAM_LOADING_STATE` overlay for up to 90s. Remove the full-screen overlay for `stream=true` once the EventSource is open. Show:

- Sticky generation bar under `PresentationHeader` (status + Stop / stall actions)
- Existing per-slide spinner only on slides not yet received
- Canvas remains visible so arriving slides are the progress

Editor stays read-only while `generating` / `stalled` / `cancelling` (`isStreaming === true`). After cancel, `isStreaming` becomes false so the user can edit the draft.

## Analytics

Add Mixpanel events (do not rename existing ones):

- `Generation_Cancelled` — `{ surface: "outline" \| "presentation", reason: "user_stop" \| "user_stop_stalled", draft_count, duration_ms }`
- `Generation_Stalled` — `{ surface, last_status, duration_ms }`
- `Generation_Keep_Waiting` — `{ surface, stalled_for_ms }`
- `Generation_Retry_Clicked` — `{ surface, from_state }`

Existing `Presentation_Stream_API_Call` / `Outline_Presentation_Generation_Started` stay.

## Testing

Backend pytest:

- Heartbeat wrapper yields heartbeat after 15s of no inner chunks, then forwards the next chunk.
- `CancelledError` from inner stream is not converted into an SSE error.
- `stream_generate_events` calls disconnect checker while iterating (poll interval 0.1s).
- OpenAI/custom `get_llm_client()` passes timeout 180s.

Frontend `node --test`:

- Lifecycle: useful vs heartbeat, stall at 45s, silent retry only before first useful event, confirm-needed when draft_count > 0.

Manual:

- Outline: Stop during first tokens; Stop after 3 outline slides; wait through a healthy run without seeing stall.
- Slides: Stop after 2 slides; persist + refresh does not restart stream; unplug network after first slide does not auto-restart generation.

## Non-goals

- Parallelizing slide LLM calls in the UI stream (already batched on the API handler, sequential on the UI stream).
- Showing model thinking tokens.
- A global generation job table / resume-from-server-checkpoint.
- Changing document-load or image-generation timeouts in this spec (they already have budgets). Heartbeat + stall UI covers the wait.

## Success criteria

1. A healthy outline/slide run never shows the stall card.
2. Stop during a healthy run requires confirm once a draft exists, and leaves that draft editable.
3. After 45s of no useful events, the user can Keep waiting, Stop, or Try again without refreshing.
4. Stop closes the SSE connection and the server does not start the next slide/outline LLM call.
5. Refresh after cancel does not reopen the stream when a draft was persisted.
