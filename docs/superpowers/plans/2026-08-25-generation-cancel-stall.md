# Generation Cancel + Stall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users stop outline/slide generation without aborting healthy jobs, by showing real progress, stalling only after 45s of silence, and actually cancelling the SSE/LLM work.

**Architecture:** A shared client lifecycle module owns stall/retry/confirm rules. Outline and presentation EventSource hooks call it. FastAPI wraps SSE with heartbeats, polls `request.is_disconnected` during token iteration, and passes that checker into the presentation stream. Partial drafts persist on explicit Stop.

**Tech Stack:** Next.js EventSource hooks, FastAPI `StreamingResponse` / SSE, pytest, Node `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-25-generation-cancel-stall-design.md`

## Global Constraints

- Stall: 45_000 ms without a useful SSE event. Heartbeat is not useful.
- Silent EventSource retry: only before the first useful event, max 3, delays 1000/2000/3000 ms.
- LLM HTTP timeout: 180s total, 10s connect, on OpenAI and custom clients.
- Heartbeat interval: 15s.
- Disconnect poll: `CLIENT_DISCONNECT_POLL_SECONDS = 0.1`.
- Do not split `presentation.py`, `Chat.tsx`, `memory_layer.py`, `templates/v2/generation.py`.
- Do not use fake determinate `ProgressBar` as generation progress.
- English copy from the spec, verbatim.
- Do not push unless asked.

## File map

- Create: `servers/nextjs/lib/generation-lifecycle.ts`
- Create: `servers/nextjs/tests/generation-lifecycle.test.mjs`
- Create: `servers/nextjs/app/(presentation-generator)/components/GenerationStatusBar.tsx`
- Modify: `servers/fastapi/utils/sse.py`
- Modify: `servers/fastapi/models/sse_response.py`
- Modify: `servers/fastapi/utils/llm_utils.py`
- Modify: `servers/fastapi/utils/llm_provider.py`
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (add `Request` + disconnect_checker only)
- Modify: `servers/nextjs/app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlineContent.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlinePage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/components/PresentationPage.tsx`
- Modify: `servers/nextjs/utils/mixpanel.ts`
- Test: `servers/fastapi/tests/unit/test_sse_heartbeat.py`
- Test: `servers/fastapi/tests/unit/test_llm_utils_disconnect.py` (extend)
- Test: `servers/fastapi/tests/unit/test_llm_provider.py` or new `test_llm_client_timeout.py`

---

### Task 1: Client generation lifecycle helper

**Files:**
- Create: `servers/nextjs/lib/generation-lifecycle.ts`
- Create: `servers/nextjs/tests/generation-lifecycle.test.mjs`

**Interfaces:**
- Consumes: none
- Produces:

```ts
export const STALL_MS = 45_000;
export const HEARTBEAT_IS_PROGRESS = false;
export const MAX_SILENT_RETRIES = 3;
export const silentRetryDelayMs = (retryCount: number) => 1_000 * retryCount;

export type GenerationSurface = "outline" | "presentation";
export type GenerationLifecycleState =
  | "idle"
  | "connecting"
  | "generating"
  | "stalled"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "complete";

export type StreamEventType =
  | "status"
  | "chunk"
  | "slide_html"
  | "slide_assets"
  | "fonts"
  | "complete"
  | "closing"
  | "error"
  | "heartbeat";

export function isUsefulStreamEvent(type: string): boolean;
export function shouldSilentRetry(args: {
  retryCount: number;
  hasUsefulEvent: boolean;
  closed: boolean;
}): boolean;
export function needsCancelConfirm(draftCount: number): boolean;
export function isStalled(args: {
  now: number;
  lastUsefulEventAt: number | null;
  state: GenerationLifecycleState;
}): boolean;
```

- [ ] **Step 1: Write the failing Node test**

Create `servers/nextjs/tests/generation-lifecycle.test.mjs` that imports the TypeScript file via Node strip-types. If the local Node cannot import `.ts`, compile the assertions against a copied ESM file is not allowed — instead run:

```
node --experimental-strip-types --test tests/generation-lifecycle.test.mjs
```

from `servers/nextjs`. If that flag is unavailable, keep the helper as `.ts` and have the test read the file as text for the constants **and** duplicate the four pure functions in the test file only as a last resort. Prefer strip-types.

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  STALL_MS,
  isUsefulStreamEvent,
  shouldSilentRetry,
  needsCancelConfirm,
  isStalled,
  silentRetryDelayMs,
} from "../lib/generation-lifecycle.ts";

test("heartbeat is not a useful event", () => {
  assert.equal(isUsefulStreamEvent("heartbeat"), false);
  assert.equal(isUsefulStreamEvent("status"), true);
  assert.equal(isUsefulStreamEvent("chunk"), true);
  assert.equal(isUsefulStreamEvent("slide_html"), true);
  assert.equal(isUsefulStreamEvent("complete"), true);
  assert.equal(isUsefulStreamEvent("error"), true);
});

test("silent retry only before first useful event", () => {
  assert.equal(
    shouldSilentRetry({ retryCount: 0, hasUsefulEvent: false, closed: false }),
    true
  );
  assert.equal(
    shouldSilentRetry({ retryCount: 3, hasUsefulEvent: false, closed: false }),
    false
  );
  assert.equal(
    shouldSilentRetry({ retryCount: 0, hasUsefulEvent: true, closed: false }),
    false
  );
  assert.equal(
    shouldSilentRetry({ retryCount: 0, hasUsefulEvent: false, closed: true }),
    false
  );
  assert.equal(silentRetryDelayMs(1), 1000);
  assert.equal(silentRetryDelayMs(3), 3000);
});

test("cancel confirm only when a draft exists", () => {
  assert.equal(needsCancelConfirm(0), false);
  assert.equal(needsCancelConfirm(2), true);
});

test("stalls after 45s without useful events while generating", () => {
  assert.equal(STALL_MS, 45_000);
  assert.equal(
    isStalled({
      now: 50_000,
      lastUsefulEventAt: 0,
      state: "generating",
    }),
    true
  );
  assert.equal(
    isStalled({
      now: 40_000,
      lastUsefulEventAt: 0,
      state: "generating",
    }),
    false
  );
  assert.equal(
    isStalled({
      now: 80_000,
      lastUsefulEventAt: 0,
      state: "connecting",
    }),
    true
  );
  assert.equal(
    isStalled({
      now: 80_000,
      lastUsefulEventAt: 0,
      state: "complete",
    }),
    false
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```
cd servers/nextjs
node --experimental-strip-types --test tests/generation-lifecycle.test.mjs
```

Expected: FAIL because `../lib/generation-lifecycle.ts` does not exist.

- [ ] **Step 3: Write the helper**

```ts
export const STALL_MS = 45_000;
export const HEARTBEAT_IS_PROGRESS = false;
export const MAX_SILENT_RETRIES = 3;

const USEFUL_EVENT_TYPES = new Set([
  "status",
  "chunk",
  "slide_html",
  "slide_assets",
  "fonts",
  "complete",
  "closing",
  "error",
]);

export function isUsefulStreamEvent(type: string): boolean {
  return USEFUL_EVENT_TYPES.has(type);
}

export function silentRetryDelayMs(retryCount: number): number {
  return 1_000 * retryCount;
}

export function shouldSilentRetry(args: {
  retryCount: number;
  hasUsefulEvent: boolean;
  closed: boolean;
}): boolean {
  if (args.closed || args.hasUsefulEvent) return false;
  return args.retryCount < MAX_SILENT_RETRIES;
}

export function needsCancelConfirm(draftCount: number): boolean {
  return draftCount > 0;
}

export function isStalled(args: {
  now: number;
  lastUsefulEventAt: number | null;
  state: string;
}): boolean {
  if (args.state !== "generating" && args.state !== "connecting") return false;
  if (args.lastUsefulEventAt == null) return false;
  return args.now - args.lastUsefulEventAt >= STALL_MS;
}
```

Also export the type aliases from the Interfaces block.

For `connecting`, start `lastUsefulEventAt` at stream open time so a hung connect also stalls.

- [ ] **Step 4: Re-run the test**

Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**

```
git add servers/nextjs/lib/generation-lifecycle.ts servers/nextjs/tests/generation-lifecycle.test.mjs
git commit -m "$(cat <<'EOF'
feat: add generation lifecycle rules for stall and cancel

EOF
)"
```

On Windows PowerShell, pass the message as `git commit -m "feat: add generation lifecycle rules for stall and cancel"`.

---

### Task 2: SSE heartbeat + cancel-safe wrapper

**Files:**
- Modify: `servers/fastapi/models/sse_response.py`
- Modify: `servers/fastapi/utils/sse.py`
- Test: `servers/fastapi/tests/unit/test_sse_heartbeat.py`

**Interfaces:**
- Consumes: existing `safe_sse_stream(stream, logger=, error_detail=, on_error=)`
- Produces: `SSEHeartbeatResponse.to_string()` → `event: response` / `{"type":"heartbeat"}`; `safe_sse_stream` emits heartbeats every 15s when the inner generator is blocked; `CancelledError` still returns without an error event.

- [ ] **Step 1: Write the failing tests**

```python
# servers/fastapi/tests/unit/test_sse_heartbeat.py
import asyncio
import json

from models.sse_response import SSEHeartbeatResponse
from utils.sse import safe_sse_stream


def _payload(frame: str) -> dict:
    data_line = next(
        line for line in frame.splitlines() if line.startswith("data:")
    )
    return json.loads(data_line[len("data:") :].strip())


def test_heartbeat_response_type():
    payload = _payload(SSEHeartbeatResponse().to_string())
    assert payload == {"type": "heartbeat"}


def test_safe_sse_stream_emits_heartbeat_while_inner_blocked():
    async def inner():
        await asyncio.sleep(0.05)
        yield "chunk-one\n\n"
        await asyncio.sleep(0.05)
        yield "chunk-two\n\n"

    async def collect():
        frames = []
        async for frame in safe_sse_stream(
            inner(),
            logger=__import__("logging").getLogger("test"),
            error_detail="boom",
            heartbeat_seconds=0.02,
        ):
            frames.append(frame)
        return frames

    frames = asyncio.run(collect())
    types = []
    for frame in frames:
        if frame == "chunk-one\n\n" or frame == "chunk-two\n\n":
            types.append(frame.strip())
            continue
        types.append(_payload(frame)["type"])
    assert "heartbeat" in types
    assert types[-1] == "chunk-two"


def test_safe_sse_stream_cancelled_does_not_emit_error():
    async def inner():
        raise asyncio.CancelledError

    async def collect():
        return [
            frame
            async for frame in safe_sse_stream(
                inner(),
                logger=__import__("logging").getLogger("test"),
                error_detail="boom",
            )
        ]

    assert asyncio.run(collect()) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```
cd servers/fastapi
python -m pytest tests/unit/test_sse_heartbeat.py -q
```

Expected: FAIL (`SSEHeartbeatResponse` missing and/or unexpected keyword `heartbeat_seconds`).

- [ ] **Step 3: Implement heartbeat without cancelling the inner generator**

Add to `models/sse_response.py`:

```python
class SSEHeartbeatResponse(BaseModel):
    def to_string(self):
        return SSEResponse(
            event="response",
            data=json.dumps({"type": "heartbeat"}),
        ).to_string()
```

In `utils/sse.py`, keep the current try/except, and feed `stream` through a queue producer so `asyncio.wait_for` on the queue **does not cancel** the inner generator:

```python
SSE_HEARTBEAT_SECONDS = 15.0

async def safe_sse_stream(
    stream: AsyncIterator[str],
    *,
    logger: logging.Logger,
    error_detail: str,
    on_error: Callable[[], Awaitable[None]] | None = None,
    heartbeat_seconds: float = SSE_HEARTBEAT_SECONDS,
) -> AsyncGenerator[str, None]:
    queue: asyncio.Queue = asyncio.Queue()

    async def produce() -> None:
        try:
            async for chunk in stream:
                await queue.put(("data", chunk))
        except asyncio.CancelledError:
            await queue.put(("cancelled", None))
            raise
        except Exception as exc:
            await queue.put(("error", exc))
        else:
            await queue.put(("end", None))

    producer = asyncio.create_task(produce())
    try:
        while True:
            try:
                kind, value = await asyncio.wait_for(
                    queue.get(), timeout=heartbeat_seconds
                )
            except asyncio.TimeoutError:
                yield SSEHeartbeatResponse().to_string()
                continue
            if kind == "data":
                yield value
            elif kind == "end":
                break
            elif kind == "cancelled":
                logger.info("SSE stream cancelled by client")
                return
            else:
                logger.exception("SSE stream failed after response started")
                if on_error:
                    try:
                        await on_error()
                    except Exception:
                        logger.exception("SSE stream error cleanup failed")
                detail = (
                    value.detail
                    if isinstance(value, HTTPException)
                    else error_detail
                )
                yield SSEErrorResponse(detail=str(detail)).to_string()
                break
    finally:
        if not producer.done():
            producer.cancel()
            await asyncio.gather(producer, return_exceptions=True)
```

Existing `outlines.py` / `presentation.py` callers keep working: `heartbeat_seconds` defaults to 15.

- [ ] **Step 4: Re-run tests**

```
cd servers/fastapi
python -m pytest tests/unit/test_sse_heartbeat.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git commit -m "fix: emit SSE heartbeats without aborting generation"
```

---

### Task 3: Disconnect poll during LLM token iteration + 180s HTTP timeout

**Files:**
- Modify: `servers/fastapi/utils/llm_utils.py`
- Modify: `servers/fastapi/utils/llm_provider.py`
- Test: `servers/fastapi/tests/unit/test_llm_utils_disconnect.py`
- Test: `servers/fastapi/tests/unit/test_llm_client_timeout.py`

**Interfaces:**
- Consumes: `CLIENT_DISCONNECT_POLL_SECONDS`, `_raise_if_client_disconnected`, `_yield_stream_items`
- Produces: disconnect checks while iterating native streams; `OpenAI(..., timeout=httpx.Timeout(180.0, connect=10.0))` for OpenAI and custom providers.

- [ ] **Step 1: Write failing disconnect-iteration test**

Add to `test_llm_utils_disconnect.py`:

```python
def test_stream_generate_events_polls_disconnect_during_iteration(monkeypatch):
    monkeypatch.setenv("LLM", "openai")
    checks = {"count": 0}

    class SlowStream:
        def __aiter__(self):
            return self

        async def __anext__(self):
            await asyncio.sleep(0.05)
            raise StopAsyncIteration

    async def fake_dispatch(*_args, **_kwargs):
        return SlowStream()

    monkeypatch.setattr("utils.llm_utils._dispatch_chat_completion", fake_dispatch)
    monkeypatch.setattr("utils.llm_utils.get_llm_provider", lambda: __import__("enums.llm_provider", fromlist=["LLMProvider"]).LLMProvider.OPENAI)
    monkeypatch.setattr("utils.llm_utils.use_responses_api", lambda *_args, **_kwargs: False)
    monkeypatch.setattr("utils.llm_utils.CLIENT_DISCONNECT_POLL_SECONDS", 0.01)

    async def is_disconnected():
        checks["count"] += 1
        return checks["count"] > 2

    async def run():
        with pytest.raises(asyncio.CancelledError):
            async for _ in __import__("utils.llm_utils", fromlist=["stream_generate_events"]).stream_generate_events(
                object(),
                disconnect_checker=is_disconnected,
                model="test",
                messages=[],
                stream=True,
            ):
                pass

    asyncio.run(run())
    assert checks["count"] >= 2
```

Prefer importing `stream_generate_events` at module top like the existing file.

Timeout test:

```python
# servers/fastapi/tests/unit/test_llm_client_timeout.py
import httpx

from utils.llm_provider import get_llm_client


def test_openai_client_uses_180s_timeout(monkeypatch):
    monkeypatch.setenv("LLM", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    captured = {}

    class FakeOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr("utils.llm_provider.OpenAI", FakeOpenAI)
    get_llm_client()
    timeout = captured["timeout"]
    assert isinstance(timeout, httpx.Timeout)
    assert timeout.read == 180.0 or timeout.timeout == 180.0
```

If `httpx.Timeout` stores the value on `.timeout` rather than `.read`, assert that. After implementation, inspect `repr(timeout)` once and lock the assertion to the real attribute.

- [ ] **Step 2: Run tests to verify they fail**

```
cd servers/fastapi
python -m pytest tests/unit/test_llm_utils_disconnect.py tests/unit/test_llm_client_timeout.py -q
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `_yield_stream_items` or `stream_generate_events` after the native stream is open, poll disconnect on each item and at least every `CLIENT_DISCONNECT_POLL_SECONDS` while waiting. The sync-stream path already uses `asyncio.to_thread`; wrap the wait:

```python
async def _yield_stream_items(
    stream: Any,
    *,
    disconnect_checker: Optional[DisconnectChecker] = None,
) -> AsyncGenerator[Any, None]:
    if hasattr(stream, "__aiter__"):
        iterator = stream.__aiter__()
        while True:
            await _raise_if_client_disconnected(disconnect_checker)
            next_item = asyncio.create_task(iterator.__anext__())
            try:
                while True:
                    await _raise_if_client_disconnected(disconnect_checker)
                    done, _ = await asyncio.wait(
                        {next_item},
                        timeout=CLIENT_DISCONNECT_POLL_SECONDS,
                    )
                    if done:
                        break
                item = next_item.result()
            except StopAsyncIteration:
                break
            yield item
        return
    # existing sync iterator path, same wait/poll around asyncio.to_thread(_next_item)
```

Pass `disconnect_checker` from `stream_generate_events` into `_yield_stream_items`. Update `_iterate_openai_chat_stream` / `_iterate_openai_responses_stream` / `_iterate_google_stream` only if they call `_yield_stream_items` themselves — then thread the checker through. Smaller change: poll inside `_yield_stream_items` and pass the checker from the iterate helpers. Add an optional `disconnect_checker=None` parameter to the three iterate functions so existing tests that call `_iterate_openai_chat_stream(stream)` still work.

In `get_llm_client()`:

```python
import httpx
LLM_HTTP_TIMEOUT = httpx.Timeout(180.0, connect=10.0)
# OpenAI(...) and custom OpenAI(...) get timeout=LLM_HTTP_TIMEOUT
```

Google client: if `genai.Client` accepts `http_options={"timeout": 180_000}` (milliseconds) in this dependency, set it. If the constructor rejects it, leave Google unchanged and note that in the test skip. Do not add a new HTTP stack.

- [ ] **Step 4: Re-run tests including existing disconnect tests**

```
cd servers/fastapi
python -m pytest tests/unit/test_llm_utils_disconnect.py tests/unit/test_llm_utils_sync_stream.py tests/unit/test_llm_client_timeout.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git commit -m "fix: abort hung LLM streams on disconnect and timeout"
```

---

### Task 4: Wire presentation/smart streams to client disconnect

**Files:**
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (`stream_presentation`, `_stream_smart_presentation`, `get_slide_content_from_type_and_outline` calls, `generate_smart_presentation` if it accepts a checker)
- Test: extend an existing presentation stream unit test if one exists; otherwise add `servers/fastapi/tests/unit/test_presentation_stream_disconnect.py` that patches `get_slide_content_from_type_and_outline` and asserts it received `disconnect_checker`.

**Interfaces:**
- Consumes: `Request.is_disconnected`, `get_slide_content_from_type_and_outline(..., disconnect_checker=)`
- Produces: UI slide generation stops after EventSource.close() without starting the next slide.

- [ ] **Step 1: Write a focused unit test**

If `generate_smart_presentation` has no `disconnect_checker`, do not add a large Smart rewrite. For standard stream, the test should import the handler internals by patching:

```python
def test_stream_presentation_passes_disconnect_checker(monkeypatch):
    # Patch sql_session.get, layout/outline accessors, and capture kwargs
    # of get_slide_content_from_type_and_outline.
```

Keep this test honest: if wiring `Request` through the endpoint is hard to unit test without the full FastAPI app, test a small extracted helper in `presentation.py`:

```python
def _stream_disconnect_checker(request_http: Optional[Request]):
    return request_http.is_disconnected if request_http is not None else None
```

and assert `stream_presentation` signature includes `request: Request`. Source-level test is acceptable here because `presentation.py` must not be split:

```python
from inspect import signature
from api.v1.ppt.endpoints.presentation import stream_presentation

def test_stream_presentation_accepts_request():
    params = signature(stream_presentation).parameters
    assert "request" in params
```

Plus a test that `get_slide_content_from_type_and_outline` is invoked with `disconnect_checker=` by grepping is not enough. Prefer an async test that runs `inner()` with a fake presentation and a disconnect checker that becomes true after the first slide.

Look at `servers/fastapi/tests/unit/test_presentation_template_v2_ui.py` for how presentations are built in tests. Reuse that fixture style.

- [ ] **Step 2: Run test, expect fail**

`stream_presentation` currently has no `request` argument.

- [ ] **Step 3: Implement the minimum wiring**

```python
async def stream_presentation(
    id: uuid.UUID,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
```

Pass `request` into `_stream_smart_presentation(presentation, sql_session, request)`.

In the standard `inner()` loop:

```python
slide_content = await get_slide_content_from_type_and_outline(
    slide_layout,
    outline.slides[i],
    presentation.language,
    presentation.tone,
    presentation.verbosity,
    presentation.instructions,
    slide_number=i + 1,
    disconnect_checker=request.is_disconnected,
)
if await request.is_disconnected():
    raise asyncio.CancelledError
```

Before each slide iteration, check disconnect. Do not start asset tasks after disconnect.

For Smart: if `generate_smart_presentation` cannot take a checker without a large change, still cancel `generation_task` when `request.is_disconnected()` inside the existing `generation_events` wait loop (it already times out every 0.1s — add the disconnect check there). That meets the lag budget without splitting the file.

- [ ] **Step 4: Run targeted tests**

```
cd servers/fastapi
python -m pytest tests/unit/test_presentation_stream_disconnect.py tests/unit/test_sse_heartbeat.py -q
```

Expected: PASS. Also run a broader presentation test file if the signature change breaks callers.

- [ ] **Step 5: Commit**

```
git commit -m "fix: cancel presentation streams when the client disconnects"
```

---

### Task 5: Outline stream hook uses lifecycle + cancel

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlinePage.tsx` only if the hook return type must be threaded

**Interfaces:**
- Consumes: `isUsefulStreamEvent`, `shouldSilentRetry`, `silentRetryDelayMs`, `isStalled`, `STALL_MS`
- Produces hook return:

```ts
{
  isStreaming: boolean;
  isLoading: boolean;
  activeSlideIndex: number | null;
  highestActiveIndex: number;
  statusMessage: string;
  lifecycle: GenerationLifecycleState;
  draftCount: number;
  cancel: () => void;
  keepWaiting: () => void;
  retry: () => void;
}
```

`isStreaming` is true for `connecting` | `generating` | `stalled` | `cancelling`.

- [ ] **Step 1: Add a source contract test**

In `servers/nextjs/tests/generation-lifecycle.test.mjs` (same file as Task 1), add:

```js
test("outline stream hook imports lifecycle helpers", async () => {
  const source = await readFile(
    new URL(
      "../app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /from "@/lib/generation-lifecycle"/);
  assert.match(source, /shouldSilentRetry/);
  assert.match(source, /isUsefulStreamEvent/);
  assert.match(source, /heartbeat/);
});
```

- [ ] **Step 2: Run, expect fail** (hook still uses `MAX_STREAM_RETRIES` always).

- [ ] **Step 3: Implement hook behavior**

- Track `hasUsefulEvent`, `lastUsefulEventAt`, `lifecycle`.
- On any `response` payload: if `isUsefulStreamEvent(data.type)` set `hasUsefulEvent = true` and `lastUsefulEventAt = Date.now()`, `lifecycle = "generating"` unless `complete`/`closing`/`error`.
- Ignore `heartbeat` except that it proves the socket is alive (do not update `lastUsefulEventAt`).
- `setInterval` 1s: if `isStalled(...)` set `lifecycle = "stalled"` and `trackEvent(MixpanelEvent.Generation_Stalled, ...)`.
- `scheduleRetry`: call `shouldSilentRetry`. On `error` event, skip silent retry (server already failed the job).
- `cancel()`: `lifecycle = "cancelling"`, `isClosed = true`, close EventSource, `lifecycle = "cancelled"`. Do not clear Redux outlines.
- `keepWaiting()`: `lastUsefulEventAt = Date.now()`, `lifecycle = "generating"`.
- `retry()`: only from `stalled` or `failed`; reset `hasUsefulEvent` if the user explicitly retries (new job); `openStream()`.

Do not persist in this task.

- [ ] **Step 4: Re-run Node tests**

```
cd servers/nextjs
node --experimental-strip-types --test tests/generation-lifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git commit -m "feat: stall-aware outline stream cancel without silent restarts"
```

---

### Task 6: Presentation stream hook uses the same lifecycle

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts`

**Interfaces:**
- Consumes: same helper as Task 5
- Produces: `cancel`, `keepWaiting`, `retry`, `lifecycle`, `draftCount` (slides length), `statusMessage`, and existing side effects (`setStreaming`, URL `stream` param cleanup on complete **and cancel**).

- [ ] **Step 1: Extend the Node source contract test** for `usePresentationStreaming.ts` the same way as outline.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement**

Mirror Task 5. Extra rules from the spec:

- On cancel/fail: `dispatch(setStreaming(false))`, `setLoading(false)`, delete `stream` search param (copy the existing complete-path URL code).
- Do not `clearPresentationData()` on cancel.
- Server `error`: `finalizeFailure` without silent retry.
- `onerror` after `hasUsefulEvent`: `lifecycle = "stalled"` (socket died). Do not `openStream()`.

Return the new fields from the hook. `PresentationPage` can still compile if extra return values are unused until Task 8 — TypeScript will allow unused returns. Update the hook's return; Task 8 wires UI.

- [ ] **Step 4: Re-run Node tests.** Expected: PASS.

- [ ] **Step 5: Commit**

```
git commit -m "feat: stall-aware presentation stream cancel without silent restarts"
```

---

### Task 7: Persist draft on explicit Stop

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts` (`cancel` persist)
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts` (`cancel` persist)
- Modify: `servers/nextjs/app/(presentation-generator)/services/api/presentation-generation.ts` only if a persist helper is missing (`updateOutlines` and `updatePresentationContent` already exist)

**Interfaces:**
- Consumes: `PresentationGenerationApi.updateOutlines(id, slides)`, `PresentationGenerationApi.updatePresentationContent(body)`
- Produces: after Stop with `draftCount > 0`, a best-effort PUT/PATCH; toast on persist failure.

Read `updatePresentationContent` body shape before calling it. Use the same payload the editor already saves (presentation id + slides). Do not invent a new endpoint.

- [ ] **Step 1: Add a source contract test** that both cancel functions mention `updateOutlines` / `updatePresentationContent`.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement persist inside `cancel()` after EventSource.close()**

Outline:

```ts
const slides = outlinesRef.current;
if (slides.length > 0 && presentationId) {
  try {
    await PresentationGenerationApi.updateOutlines(presentationId, slides);
  } catch {
    notify.error("Draft not saved", "Refresh may lose the stopped outline.");
  }
}
```

Presentation: pass slides from the store (`store.getState().presentationGeneration.presentationData`). If no slides, skip. On failure, same toast pattern.

`cancel` becomes async; UI still fires-and-forgets `void cancel()`.

- [ ] **Step 4: Re-run Node tests.** Expected: PASS.

- [ ] **Step 5: Commit**

```
git commit -m "feat: persist outline and slide drafts when generation is stopped"
```

---

### Task 8: Generation status bar UI on outline and presentation

**Files:**
- Create: `servers/nextjs/app/(presentation-generator)/components/GenerationStatusBar.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlineContent.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlinePage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/components/PresentationPage.tsx`
- Modify: `servers/nextjs/utils/mixpanel.ts`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs` only if the bar must use GSlide tokens (it should: `--gslide-accent`, `--gslide-ink`, `--gslide-card`, `--gslide-border`)

**Interfaces:**
- Consumes: hook `lifecycle`, `statusMessage`, `draftCount`, `cancel`, `keepWaiting`, `retry`, `needsCancelConfirm`
- Produces: visible bar (not `sr-only` only) with quiet Stop; stall recovery card; confirm dialog copy from the spec.

Copy (verbatim):

- Stop
- Keep waiting
- Try again
- This is taking longer than usual
- No new content for 45 seconds.
- Stop generating this outline? {n} section(s) already drafted will be kept.
- Stop generating these slides? {n} of {total} slide(s) already drafted will be kept.
- Generation stopped. Your draft so far was kept.
- Generation stopped.

- [ ] **Step 1: Write a source contract test in `gslide-ui-kit.test.mjs` or `generation-lifecycle.test.mjs`**

```js
test("GenerationStatusBar uses stall copy and gslide tokens", async () => {
  const source = await readFile(
    new URL(
      "../app/(presentation-generator)/components/GenerationStatusBar.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /This is taking longer than usual/);
  assert.match(source, /Keep waiting/);
  assert.match(source, /--gslide-accent/);
  assert.match(source, /aria-live/);
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement the bar and wire pages**

`GenerationStatusBar` props:

```ts
type Props = {
  surface: "outline" | "presentation";
  lifecycle: GenerationLifecycleState;
  statusMessage: string;
  draftCount: number;
  totalCount?: number | null;
  onCancel: () => void;
  onKeepWaiting: () => void;
  onRetry: () => void;
};
```

Quiet Stop: `variant="ghost"` / text button. Stall: primary **Keep waiting**, secondary Stop, tertiary Try again.

Confirm: `window.confirm` is acceptable for v1 (no new modal system). Use the spec strings.

Outline: render the bar at the top of `OutlineContent` when lifecycle is active; keep the existing `aria-live` region.

Presentation: if `searchParams.stream` or lifecycle active, **do not** use `STREAM_LOADING_STATE` full-screen overlay. Set `loading` false when the EventSource opens. Put `GenerationStatusBar` under `PresentationHeader`. Keep per-slide `Loader2` only for missing trailing slides.

Mixpanel enum additions in `mixpanel.ts`:

```
Generation_Cancelled
Generation_Stalled
Generation_Keep_Waiting
Generation_Retry_Clicked
```

Fire them from the bar handlers or the hooks (hooks already have duration). Prefer hooks so UI stays dumb.

- [ ] **Step 4: Run tests**

```
cd servers/nextjs
node --experimental-strip-types --test tests/generation-lifecycle.test.mjs
node --test tests/gslide-ui-kit.test.mjs
```

Expected: PASS.

Manual check (no browser tools required if unavailable): start outline stream, confirm Stop is visible and not primary; wait is not needed if stall CSS/state can be forced by temporarily setting `STALL_MS` is not allowed in prod — instead unit-test `isStalled`.

- [ ] **Step 5: Commit**

```
git commit -m "feat: show generation progress with stall-aware stop actions"
```

---

## Verification

After Task 8:

```
cd servers/fastapi
python -m pytest tests/unit/test_sse_heartbeat.py tests/unit/test_llm_utils_disconnect.py tests/unit/test_llm_utils_sync_stream.py tests/unit/test_llm_client_timeout.py tests/unit/test_presentation_stream_disconnect.py -q

cd servers/nextjs
node --experimental-strip-types --test tests/generation-lifecycle.test.mjs
node --test tests/gslide-ui-kit.test.mjs
```

Manual:

1. Healthy outline: status bar updates, stall card never appears, Continue works.
2. Stop after ~3 outline bullets: confirm, draft remains, refresh does not reopen `/outlines/stream/{id}`.
3. Healthy slides: no full-screen overlay after stream starts; slides appear in canvas; Stop quiet.
4. Stop after 2 slides: editor editable; `stream` query gone; refresh does not restart generation.
5. DevTools block the SSE after the first slide: stall card in 45s; Keep waiting stays on same job; Try again is explicit.

## Spec coverage

| Spec section | Task |
|---|---|
| Lifecycle helper + stall 45s | 1 |
| Heartbeat 15s, not progress | 2, 1 |
| Disconnect poll + 180s timeout | 3 |
| Presentation/smart abort | 4 |
| Outline retry/cancel policy | 5 |
| Presentation retry/cancel policy | 6 |
| Persist on Stop | 7 |
| Progress-first UI + copy + analytics | 8 |
| Overlay not trapping the stream | 8 |

No spec requirement is left without a task.
