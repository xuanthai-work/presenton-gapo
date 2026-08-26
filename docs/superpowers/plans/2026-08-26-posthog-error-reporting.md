# PostHog Error Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Presenton Mixpanel from GSlide and send only crash plus generate/export/stream/save failures to a separately started PostHog stack in this repo.

**Architecture:** Next.js reads `POSTHOG_HOST` and `POSTHOG_PROJECT_API_KEY` on the server, exposes them through fail-closed `/api/telemetry-status`, and inits `posthog-js` in the browser. Explicit `captureError()` covers caught API failures. Mixpanel call sites are deleted. PostHog’s hobby compose lives under `deploy/posthog/` and is started with a different command than GSlide.

**Tech Stack:** Next.js 16, `posthog-js`, Node `node --test`, Docker Compose (separate project `gslide-posthog`).

**Spec:** `docs/superpowers/specs/2026-08-26-posthog-error-reporting-design.md`

## Global Constraints

- Errors only: `crash` | `generate` | `export` | `stream` | `save`. No click/funnel/pageview events.
- Session replay off: `disable_session_recording: true`. Autocapture off. `capture_pageview` / `capture_pageleave` false.
- Fail-closed: missing host/key, `DISABLE_ANONYMOUS_TRACKING=true`/`True` (env or user-config file), or telemetry-status fetch failure → no SDK, no events.
- No `NEXT_PUBLIC_POSTHOG_*`. Host/key leave the server only via `/api/telemetry-status` when enabled.
- Do not overwrite `servers/nextjs/utils/analytics.ts`. Keep `sanitizeAnalyticsError`.
- Do not send `file_name`, `theme_name`, `template_name`, `font_name`, `font_url`, `presentation_id`, `duration_ms`, prompts, chat, slide HTML, or API keys.
- Root `docker-compose.yml` must not start PostHog, include `deploy/posthog/`, or `depends_on` it.
- PostHog command is separate: `docker compose -f deploy/posthog/docker-compose.yml --project-name gslide-posthog up`. Port **8010**.
- Do not split `Chat.tsx` or `TemplateV2KonvaSlide.tsx`. Do not hand-edit 20k-line `NOTICE` files.
- English Privacy copy from the spec, verbatim.
- Do not push unless asked.

## File map

- Create: `servers/nextjs/utils/posthog.ts`
- Create: `servers/nextjs/app/PostHogInitializer.tsx`
- Create: `servers/nextjs/tests/posthog-error-reporting.test.mjs`
- Create: `deploy/posthog/docker-compose.yml`
- Create: `deploy/posthog/.env.example`
- Create: `deploy/posthog/README.md`
- Create: `deploy/posthog/.gitignore`
- Modify: `servers/nextjs/app/api/telemetry-status/route.ts`
- Modify: `servers/nextjs/app/ClientRoot.tsx`
- Delete: `servers/nextjs/app/MixpanelInitializer.tsx`
- Delete: `servers/nextjs/utils/mixpanel.ts`
- Modify: `servers/nextjs/package.json` (add `posthog-js`, remove `mixpanel-browser`)
- Modify: `.env.example`, `docker-compose.yml`
- Modify: captureError sites listed in Task 4
- Modify: every Mixpanel import file listed in Task 5
- Modify: `docs/architecture/04-level-nextjs.md` (Mixpanel → PostHog one-liners)

---

### Task 1: Fail-closed telemetry-status

**Files:**
- Modify: `servers/nextjs/app/api/telemetry-status/route.ts`
- Create: `servers/nextjs/tests/posthog-error-reporting.test.mjs`
- Modify: `.env.example`
- Modify: `docker-compose.yml` (both `production` and `development` `environment` lists)

**Interfaces:**
- Consumes: existing `readUserConfigFile`, `USER_CONFIG_PATH`, `DISABLE_ANONYMOUS_TRACKING`
- Produces: `GET /api/telemetry-status` JSON `{ telemetryEnabled: boolean, host?: string, key?: string }`

- [ ] **Step 1: Write the failing test file**

Create `servers/nextjs/tests/posthog-error-reporting.test.mjs`:

```js
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(nextRoot, "..", "..");

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

async function readRepo(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("telemetry-status is fail-closed and serves PostHog config only when enabled", async () => {
  const source = await readNext("app/api/telemetry-status/route.ts");
  assert.match(source, /POSTHOG_HOST/);
  assert.match(source, /POSTHOG_PROJECT_API_KEY/);
  assert.match(source, /telemetryEnabled: false/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_POSTHOG/);
  assert.match(source, /readUserConfigFile/);
  assert.match(source, /DISABLE_ANONYMOUS_TRACKING/);
});

test("root env example documents browser-reachable PostHog host", async () => {
  const env = await readRepo(".env.example");
  assert.match(env, /POSTHOG_HOST=/);
  assert.match(env, /POSTHOG_PROJECT_API_KEY=/);
  assert.match(env, /localhost:8010/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_POSTHOG/);
});

test("GSlide compose forwards PostHog env and does not start PostHog", async () => {
  const compose = await readRepo("docker-compose.yml");
  assert.match(compose, /POSTHOG_HOST=\$\{POSTHOG_HOST:-\}/);
  assert.match(compose, /POSTHOG_PROJECT_API_KEY=\$\{POSTHOG_PROJECT_API_KEY:-\}/);
  assert.doesNotMatch(compose, /clickhouse/i);
  assert.doesNotMatch(compose, /deploy\/posthog/);
});
```

- [ ] **Step 2: Run the new tests (expect FAIL)**

Run: `node --test tests/posthog-error-reporting.test.mjs`

Working directory: `servers/nextjs`

Expected: FAIL — route has no `POSTHOG_HOST`; `.env.example` and compose lack the new vars.

- [ ] **Step 3: Implement telemetry-status**

Replace `servers/nextjs/app/api/telemetry-status/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { readUserConfigFile } from "@/lib/user-config-store";

export const dynamic = "force-dynamic";

function isTrueFlag(value: string | undefined): boolean {
  return value === "true" || value === "True";
}

export async function GET() {
  const host = process.env.POSTHOG_HOST?.trim() ?? "";
  const key = process.env.POSTHOG_PROJECT_API_KEY?.trim() ?? "";
  const posthogConfigured = Boolean(host && key);

  const userConfigPath = process.env.USER_CONFIG_PATH;
  let fileDisabled: string | undefined;
  if (userConfigPath) {
    try {
      const parsed = readUserConfigFile<{ DISABLE_ANONYMOUS_TRACKING?: string }>(
        userConfigPath
      );
      fileDisabled = parsed?.DISABLE_ANONYMOUS_TRACKING;
    } catch {
      fileDisabled = undefined;
    }
  }

  const envDisabled = isTrueFlag(process.env.DISABLE_ANONYMOUS_TRACKING);
  const telemetryEnabled =
    posthogConfigured && !envDisabled && !isTrueFlag(fileDisabled);

  if (!telemetryEnabled) {
    return NextResponse.json({ telemetryEnabled: false });
  }

  return NextResponse.json({ telemetryEnabled: true, host, key });
}
```

- [ ] **Step 4: Document env on GSlide only**

In repo-root `.env.example`, after `DISABLE_ANONYMOUS_TRACKING=true`, add:

```bash
# Error reporting — PostHog (separate compose in deploy/posthog/, not started with GSlide).
# Browser-reachable URL, e.g. http://localhost:8010
# Never use a Docker-internal hostname (posthog:8000) — the browser cannot resolve it.
POSTHOG_HOST=
POSTHOG_PROJECT_API_KEY=
```

In `docker-compose.yml`, add to **both** `production` and `development` `environment` lists (next to `DISABLE_ANONYMOUS_TRACKING`):

```yaml
      - POSTHOG_HOST=${POSTHOG_HOST:-}
      - POSTHOG_PROJECT_API_KEY=${POSTHOG_PROJECT_API_KEY:-}
```

- [ ] **Step 5: Re-run Task 1 tests (expect PASS)**

Run: `node --test tests/posthog-error-reporting.test.mjs`

Working directory: `servers/nextjs`

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add servers/nextjs/app/api/telemetry-status/route.ts servers/nextjs/tests/posthog-error-reporting.test.mjs .env.example docker-compose.yml
git commit -m "$(cat <<'EOF'
fix: fail-closed PostHog telemetry-status

Serve host and project key only when PostHog is configured and tracking is not disabled.
EOF
)"
```

---

### Task 2: `posthog.ts` wrapper and initializer

**Files:**
- Create: `servers/nextjs/utils/posthog.ts`
- Create: `servers/nextjs/app/PostHogInitializer.tsx`
- Modify: `servers/nextjs/app/ClientRoot.tsx`
- Delete: `servers/nextjs/app/MixpanelInitializer.tsx`
- Modify: `servers/nextjs/package.json` (add `posthog-js` only; keep `mixpanel-browser` until Task 5)
- Modify: `docs/architecture/04-level-nextjs.md`
- Modify: `servers/nextjs/tests/posthog-error-reporting.test.mjs`

**Interfaces:**
- Consumes: `GET /api/telemetry-status`, `sanitizeAnalyticsError` from `@/utils/analytics`
- Produces:

```ts
export type ErrorOperation = "crash" | "generate" | "export" | "stream" | "save";
export function initPostHog(): void;
export function setTelemetryEnabled(enabled: boolean): void;
export function resetTelemetryCache(): void;
export function captureError(
  error: unknown,
  context: { operation: ErrorOperation }
): void;
```

- [ ] **Step 1: Extend tests (expect FAIL)**

Append to `servers/nextjs/tests/posthog-error-reporting.test.mjs`:

```js
test("posthog wrapper exists and does not import mixpanel", async () => {
  const source = await readNext("utils/posthog.ts");
  assert.match(source, /export type ErrorOperation/);
  assert.match(source, /export function initPostHog/);
  assert.match(source, /export function captureError/);
  assert.match(source, /disable_session_recording:\s*true/);
  assert.match(source, /sanitizeAnalyticsError/);
  assert.doesNotMatch(source, /mixpanel-browser/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_POSTHOG/);
});

test("ClientRoot wires PostHogInitializer and MixpanelInitializer is gone", async () => {
  const root = await readNext("app/ClientRoot.tsx");
  assert.match(root, /PostHogInitializer/);
  assert.doesNotMatch(root, /MixpanelInitializer/);
  await assert.rejects(
    () => access(path.join(nextRoot, "app/MixpanelInitializer.tsx")),
    (error) => error && error.code === "ENOENT",
  );
});
```

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: FAIL — `utils/posthog.ts` missing.

- [ ] **Step 2: Install posthog-js**

Working directory: `servers/nextjs`

Run: `npm install posthog-js`

Do not remove `mixpanel-browser` yet (Task 5).

- [ ] **Step 3: Implement `utils/posthog.ts`**

Create `servers/nextjs/utils/posthog.ts`:

```ts
"use client";

import posthog from "posthog-js";
import { sanitizeAnalyticsError } from "@/utils/analytics";

export type ErrorOperation = "crash" | "generate" | "export" | "stream" | "save";

declare global {
  interface Window {
    __posthog_initialized?: boolean;
    __posthog_telemetry_enabled?: boolean;
  }
}

let statusPromise: Promise<boolean> | null = null;

async function ensureTelemetryStatus(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (typeof window.__posthog_telemetry_enabled === "boolean") {
    return window.__posthog_telemetry_enabled;
  }
  if (!statusPromise) {
    statusPromise = (async () => {
      try {
        const res = await fetch("/api/telemetry-status");
        if (!res.ok) throw new Error(`telemetry-status returned ${res.status}`);
        const data = (await res.json()) as {
          telemetryEnabled?: boolean;
          host?: string;
          key?: string;
        };
        const enabled = Boolean(
          data.telemetryEnabled && data.host && data.key
        );
        window.__posthog_telemetry_enabled = enabled;
        if (enabled) {
          initializePostHogNow(data.host!, data.key!);
        }
        return enabled;
      } catch {
        window.__posthog_telemetry_enabled = false;
        return false;
      }
    })();
  }
  return statusPromise;
}

function initializePostHogNow(host: string, key: string): void {
  if (typeof window === "undefined") return;
  if (window.__posthog_initialized) return;
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    capture_exceptions: true,
    persistence: "localStorage",
    disable_surveys: true,
  });
  window.__posthog_initialized = true;
}

export function initPostHog(): void {
  if (typeof window === "undefined") return;
  void ensureTelemetryStatus();
}

export function captureError(
  error: unknown,
  context: { operation: ErrorOperation }
): void {
  try {
    if (typeof window === "undefined") return;
    if (window.__posthog_telemetry_enabled === false) return;
    if (!window.__posthog_initialized) return;
    const message = sanitizeAnalyticsError(error, "Unknown error");
    const err = error instanceof Error ? error : new Error(message);
    posthog.captureException(err, {
      operation: context.operation,
      pathname: window.location.pathname,
    });
  } catch {
    // Error reporting must never break product UI.
  }
}

export function resetTelemetryCache(): void {
  statusPromise = null;
  if (typeof window !== "undefined") {
    delete window.__posthog_telemetry_enabled;
  }
}

export function setTelemetryEnabled(enabled: boolean): void {
  if (typeof window !== "undefined") {
    window.__posthog_telemetry_enabled = enabled;
  }
  statusPromise = null;
  if (!enabled) return;
  void ensureTelemetryStatus();
}
```

If `tsc` later reports `capture_exceptions` or `capture_pageleave` is not in `posthog-js` types, use the equivalent flags from that installed version’s `PostHogConfig` (still must disable session recording and pageview autocapture). Do not invent `NEXT_PUBLIC_` fallbacks.

- [ ] **Step 4: Replace MixpanelInitializer**

Create `servers/nextjs/app/PostHogInitializer.tsx`:

```tsx
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
```

Change `servers/nextjs/app/ClientRoot.tsx` to import `PostHogInitializer` from `./PostHogInitializer` and wrap children with it (same place as MixpanelInitializer today). Do **not** send Page View.

Delete `servers/nextjs/app/MixpanelInitializer.tsx`.

In `docs/architecture/04-level-nextjs.md`, replace `MixpanelInitializer.tsx` with `PostHogInitializer.tsx` and `mixpanel.ts` with `posthog.ts` in the two tables that mention them.

- [ ] **Step 5: Re-run tests (expect PASS for Task 2 assertions)**

Run: `node --test tests/posthog-error-reporting.test.mjs`

Working directory: `servers/nextjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add servers/nextjs/utils/posthog.ts servers/nextjs/app/PostHogInitializer.tsx servers/nextjs/app/ClientRoot.tsx servers/nextjs/app/MixpanelInitializer.tsx servers/nextjs/package.json servers/nextjs/package-lock.json servers/nextjs/tests/posthog-error-reporting.test.mjs docs/architecture/04-level-nextjs.md
git commit -m "$(cat <<'EOF'
feat: add fail-closed PostHog browser wrapper

Init posthog-js from telemetry-status; session replay and autocapture stay off.
EOF
)"
```

---

### Task 3: Honest Error reports UI

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/PrivacySettings.tsx`
- Modify: `servers/nextjs/components/OnBoarding/FinalStep.tsx`
- Modify: `servers/nextjs/tests/posthog-error-reporting.test.mjs`

**Interfaces:**
- Consumes: `setTelemetryEnabled` from `@/utils/posthog`
- Produces: Settings + onboarding toggle copy from the spec; fail-closed fetch default

- [ ] **Step 1: Extend tests (expect FAIL)**

Append:

```js
test("privacy copy is error reports and fail-closed", async () => {
  const privacy = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/PrivacySettings.tsx",
  );
  const finalStep = await readNext("components/OnBoarding/FinalStep.tsx");
  assert.match(privacy, /Error reports/);
  assert.match(
    privacy,
    /We send anonymous error reports \(crashes and failed generate, export, stream, or save actions\) to our self-hosted PostHog/,
  );
  assert.doesNotMatch(
    privacy,
    /No personal information or presentation content is collected/,
  );
  assert.match(privacy, /from "@\/utils\/posthog"/);
  assert.doesNotMatch(privacy, /Usage_Analytics_Disabled/);
  assert.match(privacy, /setTrackingEnabled\(false\)/);
  assert.match(finalStep, /Error reports/);
  assert.match(finalStep, /from "@\/utils\/posthog"/);
  assert.doesNotMatch(finalStep, /setTrackingEnabled\(true\)/);
});
```

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: FAIL on PrivacySettings copy.

- [ ] **Step 2: Rewrite PrivacySettings**

Keep the same layout/toggle/POST `/api/user-config` with `DISABLE_ANONYMOUS_TRACKING`. Changes:

- Import `setTelemetryEnabled` from `@/utils/posthog` only (no Mixpanel).
- Fetch catch: `setTrackingEnabled(false)` (not `true`).
- Remove `trackEventImmediately` / `Usage_Analytics_Disabled`.
- Title: `Error reports`
- Body (verbatim):

```
We send anonymous error reports (crashes and failed generate, export, stream, or save actions) to our self-hosted PostHog. We do not send presentation content, prompts, chat messages, uploaded files, or API keys. Session recording is off.
```

- Sub-text on: `Anonymous error reports are being sent.`
- Sub-text off: `Anonymous error reports are not being sent.`
- POST failure: revert toggle and `setTelemetryEnabled(prev ?? false)` (not `true`).

- [ ] **Step 3: Align FinalStep**

In `servers/nextjs/components/OnBoarding/FinalStep.tsx`:

- Drop Mixpanel imports and all `trackEvent` / `trackEventImmediately` calls (viewed, completed, navigation, Usage_Analytics_Disabled).
- Import `setTelemetryEnabled` from `@/utils/posthog`.
- Fetch catch: `setTrackingEnabled(false)`.
- POST failure: `setTelemetryEnabled(prev ?? false)`.
- Replace “Usage analytics” / “Help improve GSlide…” with title `Error reports` and the same body sentence as PrivacySettings (or the short sub-text pair if space is tight). Must not claim “anonymous usage data” as if Mixpanel funnels still exist.

- [ ] **Step 4: Re-run tests (expect PASS)**

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "servers/nextjs/app/(presentation-generator)/(dashboard)/settings/PrivacySettings.tsx" servers/nextjs/components/OnBoarding/FinalStep.tsx servers/nextjs/tests/posthog-error-reporting.test.mjs
git commit -m "$(cat <<'EOF'
fix: describe error reports honestly and default opt-out on status failure

EOF
)"
```

---

### Task 4: `captureError` on the closed failure list

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/hooks/usePresentationGeneration.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlinePage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/components/UploadPage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/custom-template/hooks/useTemplateCreation.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/components/PresentationHeader.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/components/Chat.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/theme/components/ThemePanel/index.tsx`
- Modify: `servers/nextjs/tests/posthog-error-reporting.test.mjs`

**Interfaces:**
- Consumes: `captureError` from `@/utils/posthog`
- Produces: one capture per listed failure; payload only `{ operation, pathname }` plus sanitized Error message inside `captureException`

Do **not** pass `presentation_id`, `duration_ms`, `file_name`, or Mixpanel event names. Do **not** capture stall/cancel/retry. Do **not** split `Chat.tsx`.

- [ ] **Step 1: Extend tests (expect FAIL)**

Append:

```js
const CAPTURE_SITES = [
  ["app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts", "generate"],
  ["app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts", "generate"],
  ["app/(presentation-generator)/outline/hooks/usePresentationGeneration.ts", "generate"],
  ["app/(presentation-generator)/outline/components/OutlinePage.tsx", "generate"],
  ["app/(presentation-generator)/upload/components/UploadPage.tsx", "generate"],
  ["app/(presentation-generator)/custom-template/hooks/useTemplateCreation.ts", "generate"],
  ["app/(presentation-generator)/presentation/components/PresentationHeader.tsx", "export"],
  ["app/(presentation-generator)/presentation/components/Chat.tsx", "stream"],
  ["app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx", "save"],
  ["app/(presentation-generator)/(dashboard)/theme/components/ThemePanel/index.tsx", "save"],
];

test("closed failure list calls captureError with the spec operation", async () => {
  for (const [file, operation] of CAPTURE_SITES) {
    const source = await readNext(file);
    assert.match(source, /from "@\/utils\/posthog"/);
    assert.match(
      source,
      new RegExp(`captureError\\([\\s\\S]*operation:\\s*"${operation}"`),
      `missing captureError operation ${operation} in ${file}`,
    );
    assert.doesNotMatch(source, /file_name/);
  }
});
```

`useTemplateCreation.ts` must also contain `operation: "save"` (same file, two operations). After the loop, extra assert:

```js
  const template = await readNext(
    "app/(presentation-generator)/custom-template/hooks/useTemplateCreation.ts",
  );
  assert.match(template, /operation:\s*"save"/);
```

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: FAIL.

- [ ] **Step 2: Wire generate/stream/export/save**

Import `captureError` from `@/utils/posthog`. Replace Mixpanel fail tracking as follows. Leave other Mixpanel calls in these files for Task 5.

**`usePresentationStreaming.ts` `finalizeFailure`:** delete both `Smart_Mode_Generation_Failed` and `TemplateV2_Stream_Failed` `trackEvent` blocks. Once per failure:

```ts
captureError(description, { operation: "generate" });
```

Use the toast `description` string, not extra props.

**`useOutlineStreaming.ts`:** in the SSE `"error"` branch (the `notify.error("Outline streaming failed", …)` path) and the parse-fail path that toasts `"Parse failed"`, add:

```ts
captureError(data.detail ?? "Outline streaming failed", { operation: "generate" });
```

and

```ts
captureError("Failed to parse presentation data.", { operation: "generate" });
```

Do not add capture on `Generation_Stalled`.

**`usePresentationGeneration.ts` prepare `catch`:** replace `TemplateV2_Prepare_Failed` with `captureError(error, { operation: "generate" })`.

**`OutlinePage.tsx` outline regeneration `catch`:** replace `TemplateV2_Outline_Regeneration_Failed` with `captureError(error, { operation: "generate" })`.

**`UploadPage.tsx` `handleGenerationError`:** replace `Smart_Mode_Generation_Failed` with `captureError(error, { operation: "generate" })`. Call it for every generationMode, not only smart.

**`useTemplateCreation.ts`:**
- Slide/layout generation catches that currently send `CustomTemplate_Slide_Generation_Failed`, `CustomTemplate_Blocks_Generation_Failed`, `CustomTemplate_Creation_Failed`, `CustomTemplate_Preview_Failed` → `captureError(error, { operation: "generate" })`.
- Font-check failure stays **unreported** (not in the spec list) — Task 5 will delete the Mixpanel call only.
- In `saveTemplateV2Layouts` callers, any `catch` that means layouts failed to persist, and any catch around template save that currently would have been a save failure: `captureError(error, { operation: "save" })`. If save has no catch today, wrap `saveTemplateV2Layouts` body in try/catch, rethrow after `captureError(error, { operation: "save" })` so callers still see the failure.

**`PresentationHeader.tsx`:** in both PPTX and PDF `catch` blocks, replace `trackExportLifecycle(… Presentation_Export_Failed …)` with `captureError(error, { operation: "export" })`. You may delete `trackExportLifecycle` entirely in Task 5; in this task at least the Failed path must call `captureError` and must not send `slide_count` / `presentation_id`.

**`Chat.tsx`:** in the `AI_Assistant_Prompt_Failed` catch (non-abort), replace that `trackEvent` with `captureError(message, { operation: "stream" })`. Do not capture `AI_Assistant_Prompt_Stopped` or attachment failures.

**`SettingPage.tsx` `handleSaveConfig` catch:** after `notify.error("Could not save settings", message)` add `captureError(error, { operation: "save" })`.

**`ThemePanel/index.tsx`:** in **both** save `catch` blocks (update and create), add `captureError(error, { operation: "save" })` next to the existing `notify.error`. Do not send `theme_name`.

- [ ] **Step 3: Re-run tests (expect PASS)**

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add servers/nextjs/app servers/nextjs/tests/posthog-error-reporting.test.mjs
git commit -m "$(cat <<'EOF'
feat: report generate, export, stream, and save failures to PostHog

EOF
)"
```

Only stage the files listed in this task (not unrelated settings WIP).

---

### Task 5: Delete Mixpanel

**Files:**
- Delete: `servers/nextjs/utils/mixpanel.ts`
- Modify: `servers/nextjs/package.json` and `package-lock.json` (remove `mixpanel-browser`)
- Modify every file that still imports `@/utils/mixpanel` (complete list below)
- Modify: `servers/nextjs/app/(presentation-generator)/template-preview/components/editor/templatePreviewAnalytics.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/template-preview/components/TemplatePreviewClient.tsx` (remove `track(ANALYTICS_EVENTS…)` calls)
- Modify: `servers/nextjs/tests/posthog-error-reporting.test.mjs`

**Interfaces:**
- Consumes: none from Mixpanel
- Produces: zero `mixpanel-browser` / Mixpanel token / `api-eu.mixpanel.com` under `servers/nextjs` except tests that assert absence

Complete import list (remove Mixpanel usage from each; keep `@/utils/analytics` sanitizer imports):

- `app/(presentation-generator)/(dashboard)/templates/components/TemplatePanel.tsx`
- `app/(presentation-generator)/(dashboard)/community/components/CommunityPage.tsx`
- `app/(presentation-generator)/(dashboard)/settings/ImageProvider.tsx`
- `app/(presentation-generator)/(dashboard)/settings/WebSearchProvider.tsx`
- `app/(presentation-generator)/(dashboard)/settings/TextProvider.tsx`
- `app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx`
- `app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage.tsx`
- `app/(presentation-generator)/presentation/components/PresentationPage.tsx`
- `app/(presentation-generator)/outline/components/OutlinePage.tsx`
- `app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts`
- `app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts`
- `app/(presentation-generator)/presentation/components/PresentationHeader.tsx`
- `app/(presentation-generator)/presentation/components/Chat.tsx`
- `components/OnBoarding/OnboardingMode.tsx`
- `components/Auth/AuthGate.tsx`
- `app/(presentation-generator)/custom-template/CustomTemplatePage.tsx`
- `components/slide-editor/surface/TemplateV2KonvaSlide.tsx`
- `app/(presentation-generator)/outline/components/TemplateSelection.tsx`
- `app/(presentation-generator)/(dashboard)/templates/components/CreateCustomTemplate.tsx`
- `app/(presentation-generator)/(dashboard)/theme/components/ThemePanel/index.tsx`
- `app/(presentation-generator)/components/SmartHtmlEditor.tsx`
- `app/(presentation-generator)/presentation/components/PresentationActions.tsx`
- `app/(presentation-generator)/presentation/components/NewSlide.tsx`
- `app/(presentation-generator)/documents-preview/components/DocumentPreviewPage.tsx`
- `components/OnBoarding/FinalStep.tsx`
- `app/(presentation-generator)/(dashboard)/dashboard/components/PresentationCard.tsx`
- `app/(presentation-generator)/(dashboard)/dashboard/components/EmptyState.tsx`
- `app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx`
- `app/(presentation-generator)/(dashboard)/dashboard/components/Header.tsx`
- `app/(presentation-generator)/upload/components/UploadPage.tsx`
- `app/(presentation-generator)/components/ImageEditor.tsx`
- `components/OnBoarding/OnBoardingHeader.tsx`
- `components/Auth/LogoutButton.tsx`
- `app/(presentation-generator)/presentation/components/SlideActionBar.tsx`
- `app/(presentation-generator)/presentation/components/SidePanel.tsx`
- `app/(presentation-generator)/presentation/components/ThemeSelector.tsx`
- `app/(presentation-generator)/outline/hooks/usePresentationGeneration.ts`
- `app/(presentation-generator)/custom-template/hooks/useTemplateCreation.ts`
- `app/(presentation-generator)/components/HeaderNab.tsx`
- `app/(export)/pdf-maker/PdfMakerPage.tsx`

For each file: delete the Mixpanel import and every `trackEvent` / `trackEventImmediately` / `track(` Mixpanel call. Leave the surrounding product logic (toasts, navigation, catches). In `LogoutButton.tsx` and `PresentationHeader.tsx`, delete Mixpanel-only helpers (`trackExportLifecycle` if it still only wraps Mixpanel).

`templatePreviewAnalytics.ts`: remove `trackMixpanel` import. Delete `ANALYTICS_EVENTS`, `track`, and `useAnalyticsPageView` if unused after stripping `TemplatePreviewClient.tsx`. Keep `bucketTextLength`, `countWords`, `getPresentationErrorProperties`, `getUserSendTimeProperties` only if still imported; otherwise delete the dead exports.

`TemplatePreviewClient.tsx`: remove every `track(ANALYTICS_EVENTS…)` call. Do not add `captureError` there (not in the spec list).

- [ ] **Step 1: Extend tests then run (expect FAIL until deletion)**

Append:

```js
test("mixpanel is gone from Next.js app source", async () => {
  await assert.rejects(
    () => access(path.join(nextRoot, "utils/mixpanel.ts")),
    (error) => error && error.code === "ENOENT",
  );
  const pkg = await readNext("package.json");
  const lock = await readNext("package-lock.json");
  assert.doesNotMatch(pkg, /mixpanel-browser/);
  assert.doesNotMatch(lock, /mixpanel-browser/);
  const { execFileSync } = await import("node:child_process");
  const rg = execFileSync(
    "npx",
    [
      "--yes",
      "rg",
      "-l",
      "d726e8bea8ec147f4c7720060cb2e6d1|api-eu\\.mixpanel\\.com|from [\"']@/utils/mixpanel[\"']",
      ".",
      "-g",
      "!NOTICE",
      "-g",
      "!**/NOTICE",
      "-g",
      "!tests/posthog-error-reporting.test.mjs",
    ],
    { cwd: nextRoot, encoding: "utf8" },
  );
  assert.equal(rg.trim(), "");
});
```

Do **not** use `rg` if it is not guaranteed. Prefer a Node walk:

```js
test("mixpanel is gone from Next.js app source", async () => {
  await assert.rejects(
    () => access(path.join(nextRoot, "utils/mixpanel.ts")),
    (error) => error && error.code === "ENOENT",
  );
  const pkg = await readNext("package.json");
  assert.doesNotMatch(pkg, /mixpanel-browser/);
  const banned = /d726e8bea8ec147f4c7720060cb2e6d1|api-eu\.mixpanel\.com|@\/utils\/mixpanel/;
  async function walk(dir) {
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) continue;
      if (entry.name === "NOTICE") continue;
      if (full.endsWith("tests/posthog-error-reporting.test.mjs")) continue;
      if (full.endsWith("package-lock.json")) {
        const lock = await readFile(full, "utf8");
        assert.doesNotMatch(lock, /mixpanel-browser/);
        continue;
      }
      const text = await readFile(full, "utf8");
      assert.doesNotMatch(text, banned, full);
    }
  }
  await walk(nextRoot);
});
```

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: FAIL until Mixpanel files are gone.

- [ ] **Step 2: Strip call sites, delete `mixpanel.ts`, uninstall Mixpanel**

Working directory: `servers/nextjs`

Run: `npm uninstall mixpanel-browser`

Delete `utils/mixpanel.ts`.

Strip every file in the list. Grep `@/utils/mixpanel` and `MixpanelEvent` under `servers/nextjs` until zero matches outside the new test.

- [ ] **Step 3: Typecheck and tests**

Working directory: `servers/nextjs`

Run: `node --test tests/posthog-error-reporting.test.mjs tests/gslide-ui-kit.test.mjs`

Expected: PASS.

Run: `npx tsc --noEmit --pretty false`

Expected: exit 0. If `capture_exceptions` typing fails, fix `posthog.ts` init options only.

- [ ] **Step 4: Commit**

```bash
git add servers/nextjs
git commit -m "$(cat <<'EOF'
chore: remove Mixpanel token, SDK, and product-usage events

EOF
)"
```

Do not `git add` unrelated dirty files (settings WIP, `cloudflared`, `tsconfig.tsbuildinfo`).

---

### Task 6: Separate PostHog Compose project

**Files:**
- Create: `deploy/posthog/README.md`
- Create: `deploy/posthog/.gitignore`
- Create: `deploy/posthog/.env.example`
- Create: `deploy/posthog/docker-compose.yml`
- Modify: `servers/nextjs/tests/posthog-error-reporting.test.mjs`

**Interfaces:**
- Consumes: official PostHog hobby images/compose (not the GSlide `Dockerfile`)
- Produces: `docker compose -f deploy/posthog/docker-compose.yml --project-name gslide-posthog up` serving UI on `http://localhost:8010`

Official hobby compose bind-mounts files from a PostHog git checkout (`./posthog/docker/clickhouse/...`) and expects `$DOMAIN`. Do **not** paste the 700-line hobby file into root `docker-compose.yml`. Do **not** `depends_on` GSlide.

- [ ] **Step 1: Extend tests (expect FAIL)**

Append:

```js
test("PostHog stack is a separate compose project in deploy/posthog", async () => {
  const readme = await readRepo("deploy/posthog/README.md");
  assert.match(readme, /gslide-posthog/);
  assert.match(readme, /localhost:8010/);
  assert.match(readme, /--project-name gslide-posthog/);
  await access(path.join(repoRoot, "deploy/posthog/docker-compose.yml"));
  const gslide = await readRepo("docker-compose.yml");
  assert.doesNotMatch(gslide, /include:[\s\S]*deploy\/posthog/);
});
```

Run: `node --test tests/posthog-error-reporting.test.mjs`

Expected: FAIL — `deploy/posthog` missing.

- [ ] **Step 2: Add deploy/posthog files**

`deploy/posthog/.gitignore`:

```
upstream/
.env
*.override.local.yml
```

`deploy/posthog/.env.example`:

```bash
# Used by the PostHog hobby stack, not by GSlide.
# GSlide reads POSTHOG_HOST / POSTHOG_PROJECT_API_KEY from the repo-root .env.
DOMAIN=localhost
SITE_URL=http://localhost:8010
POSTHOG_SECRET=change-me-to-a-long-random-string
```

Pick **this** operator command (matches the spec). Put it in README verbatim:

```powershell
docker compose --project-name gslide-posthog -f deploy/posthog/docker-compose.yml up
```

`deploy/posthog/docker-compose.yml`:

```yaml
name: gslide-posthog
include:
  - path: ./upstream/docker-compose.hobby.yml

services:
  proxy:
    ports:
      - "8010:80"
```

Bootstrap (README, once): `git clone --depth 1 https://github.com/PostHog/posthog.git deploy/posthog/upstream`

Hobby `extends` `docker-compose.base.yml` relative to `upstream/`. If Compose `include` from the parent folder breaks those relative `extends`, change `docker-compose.yml` to:

```yaml
name: gslide-posthog
```

and document running compose **with `working_directory` / `-f` paths inside `upstream/`** plus a sibling override that only remaps the service that currently publishes `80:80` to `8010:80`. The README command must still contain `--project-name gslide-posthog` and `localhost:8010`. Do not add GSlide services. Do not start PostHog from the repo-root compose file.

Set `DOMAIN=localhost` and `SITE_URL=http://localhost:8010` in `deploy/posthog/.env` (copy from `.env.example`). If Caddy refuses HTTP, remap the web container’s listen port to host `8010` and document it.

`deploy/posthog/README.md` must include:

- RAM warning (~8 GB extra). GSlide runs without this stack.
- Bootstrap clone into `upstream/` (gitignored).
- The up/down command with `--project-name gslide-posthog`.
- First-run: open `http://localhost:8010`, create project, copy `phc_…` into **repo-root** `.env` as `POSTHOG_PROJECT_API_KEY`, set `POSTHOG_HOST=http://localhost:8010`, set `DISABLE_ANONYMOUS_TRACKING=false`, recreate **only** the GSlide container.
- Repo-root `docker compose down` does not stop PostHog.

- [ ] **Step 3: Re-run tests (expect PASS)**

Run: `node --test tests/posthog-error-reporting.test.mjs`

Working directory: `servers/nextjs`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add deploy/posthog servers/nextjs/tests/posthog-error-reporting.test.mjs
git commit -m "$(cat <<'EOF'
chore: add standalone PostHog compose project under deploy/posthog

EOF
)"
```

Do not commit `deploy/posthog/upstream`.

---

### Task 7: Verification

**Files:** none new

**Interfaces:** none

- [ ] **Step 1: Automated suite**

Working directory: `servers/nextjs`

Run: `node --test tests/posthog-error-reporting.test.mjs tests/gslide-ui-kit.test.mjs`

Expected: PASS, 0 fail.

Run: `npx tsc --noEmit --pretty false`

Expected: exit 0.

Run: `npx next build`

Expected: compile + typecheck success (same as a clean GSlide build). `/settings` route present.

- [ ] **Step 2: Grep leftovers**

Working directory: `servers/nextjs`

PowerShell:

```powershell
Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch 'node_modules|\.next' }) -Pattern 'mixpanel|MixpanelEvent|api-eu\.mixpanel' | Select-Object -ExpandProperty Path
```

Expected: no product files (test file may mention Mixpanel only in “gone” assertions).

- [ ] **Step 3: Manual (operator machine with Docker RAM)**

Not required to merge the GSlide Mixpanel removal. When checking the stack:

1. GSlide `docker compose up production` — no PostHog containers.
2. Start `deploy/posthog` per README; UI on `8010`.
3. Point root `.env`; recreate GSlide only.
4. Trigger a save or generate failure; error appears in PostHog. Network tab has no `api-eu.mixpanel.com`.

- [ ] **Step 4: Commit only if Step 1 caused fixes**

If no code changes, skip commit.

---

## Spec coverage

| Spec section | Task |
|---|---|
| Fail-closed telemetry-status + no NEXT_PUBLIC_ | 1 |
| `posthog.ts` API, replay off, initializer, no Page View | 2 |
| Privacy / FinalStep copy + fetch default off | 3 |
| Closed capture list | 4 |
| Mixpanel deletion | 5 |
| `deploy/posthog/` separate command, port 8010, not sidecar | 6 |
| tsc / next build / no Mixpanel leftovers | 7 |
| Abandon Mixpanel history / no k8s / no NOTICE hand-edit | out of scope / 5 note |

## Type names (do not drift)

- `ErrorOperation` = `"crash" | "generate" | "export" | "stream" | "save"`
- Env: `POSTHOG_HOST`, `POSTHOG_PROJECT_API_KEY`
- Window: `__posthog_initialized`, `__posthog_telemetry_enabled`
- Compose project: `gslide-posthog`
- UI port: `8010`
