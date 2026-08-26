# PostHog Error Reporting — Design Spec

**Date:** 2026-08-26  
**Status:** Draft  
**Approach:** Tear out Presenton Mixpanel. Report only user-visible failures to self-hosted PostHog.

## Product goal

Gapo operators can open PostHog and see **why a user hit an error** — a browser crash, or a generate / export / stream / save failure. They do not need funnels, click maps, session replay, or Presenton’s Mixpanel project.

Success looks like:

- Source, lockfile, and Docker image contain no Mixpanel token, host, or `mixpanel-browser` dependency.
- Root `docker compose up` (GSlide) never builds or starts PostHog.
- `deploy/posthog/` has its **own** Compose file and command. Independent project: no GSlide sidecar, no `depends_on` GSlide, no shared image build.
- With PostHog running separately and GSlide `.env` pointing at it, errors appear in the PostHog UI — without prompt text, slide body, file names, or API keys.
- With PostHog env empty, GSlide still runs and sends nothing.

## Problem

`servers/nextjs/utils/mixpanel.ts` still ships Presenton residue:

- Hardcoded project token `d726e8bea8ec147f4c7720060cb2e6d1` and `api_host: 'https://api-eu.mixpanel.com'`.
- Session replay at `record_sessions_percent: 100` with empty mask/block selectors — DOM text, prompts, and editor content leave the browser.
- ~150 `MixpanelEvent` values plus `templatePreviewAnalytics` fire from ~45 client files.
- `ensureTelemetryStatus()` defaults to **enabled** when `/api/telemetry-status` fails.
- Privacy copy claims nothing is collected while events still send `file_name`, `theme_name`, `font_url`.

This is not Gapo analytics. It is upstream product telemetry plus a privacy bug.

## Decisions locked

| Topic | Choice |
|---|---|
| Vendor | **Self-hosted PostHog** (open source). Not Mixpanel. Not PostHog Cloud unless an operator points the host there. |
| Scope | **Errors only.** Uncaught JS + generate / export / stream / save failures. |
| Old Mixpanel data | **Abandon.** Do not export or replay Presenton Mixpanel history. PostHog starts empty. |
| Old `*Failed` catalog | **Delete** the Mixpanel events and call sites. Do not rename them onto PostHog. Re-instrument only the operations listed below. |
| Session replay | **Off.** No DOM recording, no canvas recording. |
| Autocapture | **Off** (no click/pageview/input capture). Exception autocapture **on** after init. |
| Fail-closed | Missing host or key, env/file opt-out, or status-check failure → **no SDK, no events**. |
| Config delivery | **Server env**, not `NEXT_PUBLIC_*` baked into `Dockerfile` `npm run build`. Client receives host/key from `/api/telemetry-status` only when reporting is allowed. |
| Wrapper file | `servers/nextjs/utils/posthog.ts`. Do **not** overwrite `servers/nextjs/utils/analytics.ts`. |
| Sanitizer | Keep `sanitizeAnalyticsError` in `utils/analytics.ts`. Run every error message through it before send. |
| Mixpanel API surface | **Gone.** No `MixpanelEvent`, `trackEvent`, `track`, `initMixpanel`, `identifyAnonymous`. |
| PostHog server stack | **In this repo, separate Compose project** under `deploy/posthog/`. Not a GSlide sidecar. Not built by the GSlide `Dockerfile`. |
| Where you look | PostHog UI from that stack (`http://localhost:8010` by default). GSlide does **not** embed a PostHog dashboard. |
| PII | Never send prompt text, chat text, slide/HTML body, uploaded file contents, file names, font URLs, API keys, passwords. |

## Approaches considered

**A — Error-only PostHog (chosen)**  
Delete Mixpanel. Init PostHog only to capture exceptions. Explicit `captureError()` at generate/export/stream/save failure sites.

- Pros: matches the operator need; smallest privacy surface; no Presenton token.  
- Cons: no feature-usage funnel.

**B — Swap SDK, keep ~150 events**  
Replace `mixpanel-browser` with `posthog-js` and keep `trackEvent(MixpanelEvent.*)`.

- Rejected: user does not want usage analytics; the honest-copy problem remains.

**C — JS crash only**  
`capture_exceptions` with no explicit API-failure calls.

- Rejected: generate/export/stream/save failures are `try/catch` + toast. They never become uncaught exceptions.

## Config and kill switches

Repo-root `.env.example` and both `docker-compose.yml` services (`production`, `development`):

```bash
# Error reporting — PostHog (separate compose in deploy/posthog/, not started with GSlide).
# Browser-reachable URL, e.g. http://localhost:8010
# Never use a Docker-internal hostname (posthog:8000) — the browser cannot resolve it.
POSTHOG_HOST=
POSTHOG_PROJECT_API_KEY=
```

`POSTHOG_HOST` is what **the user’s browser** calls.

Keep existing `DISABLE_ANONYMOUS_TRACKING=true` as the deployment kill switch.

Reporting is **on** only when all of these hold:

1. `POSTHOG_HOST` and `POSTHOG_PROJECT_API_KEY` are non-empty.
2. `DISABLE_ANONYMOUS_TRACKING` env is not `true`/`True`.
3. User-config file flag `DISABLE_ANONYMOUS_TRACKING` is not `true`/`True` (same `USER_CONFIG_PATH` read as today).

Otherwise `/api/telemetry-status` returns `{ telemetryEnabled: false }` and **omits** host/key.

Do not add `NEXT_PUBLIC_POSTHOG_*`. Production `Dockerfile` runs `npm run build` with no PostHog ARG; baking client env would freeze empty keys into the image.

Use the **project** API key (public, designed for browsers). Never a personal PostHog user key.

## Client SDK

New module `servers/nextjs/utils/posthog.ts`:

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

`initPostHog`:

- Browser only.
- Await `/api/telemetry-status`. On network/HTTP/JSON failure → treat as disabled (fail-closed). **Do not** default to enabled.
- If `telemetryEnabled` is false, or host/key missing → return without `posthog.init`.
- Init once:

```ts
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
```

`captureError`:

- No-op if not initialized or telemetry disabled.
- `const message = sanitizeAnalyticsError(error, "Unknown error")`.
- `posthog.captureException(error instanceof Error ? error : new Error(message), { operation, pathname: window.location.pathname })`.
- Autocaptured crashes from `capture_exceptions` do not need an `operation` property.
- Must never throw into product UI.

Replace `app/MixpanelInitializer.tsx` with `PostHogInitializer` (or equivalent) that only calls `initPostHog()` on mount. **Do not** send `Page View`. Update `app/ClientRoot.tsx`.

`setTelemetryEnabled` / `resetTelemetryCache` stay for the Settings toggle (same window-flag pattern as today, renamed off Mixpanel). Turning off must stop further captures; do not require a reload.

## What to report (closed list)

| `operation` | When | Where (current failure UI) |
|---|---|---|
| `crash` | Uncaught exception / unhandled rejection | SDK `capture_exceptions` after init |
| `generate` | Outline or slide generation fails (including smart/template-v2 prepare, outline regeneration, custom-template slide/layout generation) | `useOutlineStreaming` error/parse-fail paths that toast; `usePresentationStreaming` `finalizeFailure`; `usePresentationGeneration` prepare fail; `OutlinePage` outline regeneration fail; `UploadPage` generation fail; `useTemplateCreation` slide/layout generation fail |
| `export` | PPTX/PDF export fails | `PresentationHeader` export catch (today `Presentation_Export_Failed`) |
| `stream` | Chat/assistant stream fails after send | `Chat.tsx` `AI_Assistant_Prompt_Failed` site |
| `save` | Settings / theme / custom-template save fails | `SettingPage` save `catch`; `ThemePanel` save `catch`; `useTemplateCreation` / custom-template save `catch` |

If a listed site has no Mixpanel fail event today (settings/theme save), **add** `captureError` there. Do not add reporting for auth, admin, community load, onboarding validation, image replace, or other `*Failed` Mixpanel events — those call sites are deleted, not migrated.

Do not report stall / cancel / retry (`Generation_Stalled`, `Generation_Cancelled`, `Generation_Keep_Waiting`, `Generation_Retry_Clicked`). Those are lifecycle, not errors.

Payload allows: `operation` (explicit `captureError` only), sanitized message, `pathname`. Do not send `duration_ms`, `presentation_id`, `file_name`, `theme_name`, `template_name`, `font_name`, `font_url`, prompt/chat/slide text, or API keys.

## Mixpanel removal

Delete `servers/nextjs/utils/mixpanel.ts` after all imports are gone.

Remove `mixpanel-browser` from `servers/nextjs/package.json` and lockfile.

Strip every `trackEvent` / `trackEventImmediately` / `track(` Mixpanel call, including `templatePreviewAnalytics.ts` Mixpanel `track`. Keep local helpers in that file (`bucketTextLength`, etc.) if still used by the editor; delete dead `ANALYTICS_EVENTS` if nothing remains.

Remove `Usage_Analytics_Disabled` beacons from `PrivacySettings` and `FinalStep`. Opt-out must work even if PostHog is down — do not wait on a last event.

`NOTICE` files that list `mixpanel-browser` as a dependency license: update only if the project regenerates them as part of this change; do not hand-edit 20k-line notices.

## Privacy UI

`PrivacySettings.tsx`:

- Title: **Error reports** (not “Usage analytics”).
- Body must not say “no personal information or presentation content is collected” while we send error strings. Honest copy, English, matching current UI language:

  > We send anonymous error reports (crashes and failed generate, export, stream, or save actions) to our self-hosted PostHog. We do not send presentation content, prompts, chat messages, uploaded files, or API keys. Session recording is off.

- Sub-text: on → “Anonymous error reports are being sent.” / off → “Anonymous error reports are not being sent.”
- Fetch status catch: default **off** (fail-closed), not `setTrackingEnabled(true)`.
- Keep POST `/api/user-config` with `DISABLE_ANONYMOUS_TRACKING`. Do not redesign that route in this spec. If the POST fails, revert the toggle.

Onboarding `FinalStep` tracking toggle, if it still mentions Mixpanel/usage analytics: same fail-closed + copy intent, no Mixpanel beacon.

## `/api/telemetry-status`

Keep `dynamic = "force-dynamic"`. Extend the JSON:

```ts
{
  telemetryEnabled: boolean,
  host?: string,
  key?: string,
}
```

`telemetryEnabled` is the AND of PostHog configured, env not disabling, file not disabling. On file-read failure, ignore the file flag (do not fail-open the whole endpoint); env + PostHog config still apply.

Never return host/key when `telemetryEnabled` is false.

Do not invent `readUserConfig()`. Keep `readUserConfigFile` + `USER_CONFIG_PATH` as today.

## Separate PostHog stack (`deploy/posthog/`)

PostHog lives in **this repo** but is **not** part of the GSlide app compose.

| | GSlide | PostHog |
|---|---|---|
| Files | Root `Dockerfile`, `docker-compose.yml` | `deploy/posthog/` (own compose + README) |
| Command | `docker compose up production` | `docker compose -f deploy/posthog/docker-compose.yml up` (name may match README) |
| Image build | GSlide `npm run build` / FastAPI | Official PostHog images only — **do not** `COPY` PostHog into the GSlide image |
| Coupling | None | None: no `depends_on` GSlide, no sidecar, no shared Compose `service` |

Do **not**:

- Add PostHog/ClickHouse/Kafka services to root `docker-compose.yml`.
- Use Compose `profiles` on the GSlide file so `up` accidentally pulls PostHog.
- Attach PostHog as a sidecar container next to `production` / `development`.
- Share a Docker network **required** for GSlide to boot. They talk over the **host** URL (`http://localhost:8010`) so the browser can reach PostHog.

Use a distinct Compose **project name** (e.g. `gslide-posthog`) so `docker compose down` on GSlide does not tear down PostHog.

Hobby stack is heavy (~8 GB RAM). README must say: GSlide works without it; start PostHog only when you want the error UI.

Local HTTP on port **8010** (avoid GSlide `5001` and SearXNG `8080`). No public domain required. `SITE_URL=http://localhost:8010`. If upstream hobby files assume Caddy + a real domain, bind `web` directly for local use.

**First run:** start PostHog compose → open `http://localhost:8010` → create user + project → paste `phc_…` into GSlide `.env` as `POSTHOG_PROJECT_API_KEY`, set `POSTHOG_HOST=http://localhost:8010`, set `DISABLE_ANONYMOUS_TRACKING=false`, recreate **only** the GSlide container.

Pin or copy only the hobby compose files needed to boot; comment the upstream PostHog revision. Windows Docker Desktop must work (no Linux-only `deploy-hobby` bash as the sole path).

Session replay stays **off** in GSlide `posthog.init` even though the PostHog UI can record sessions.

## Tests

Add `servers/nextjs/tests/posthog-error-reporting.test.mjs` (source assertions, same style as `gslide-ui-kit.test.mjs`):

- `package.json` / lockfile do not list `mixpanel-browser`.
- No file under `servers/nextjs` (except tests, `NOTICE`, and lockfile history if any) contains `d726e8bea8ec147f4c7720060cb2e6d1` or `api-eu.mixpanel.com`.
- `utils/mixpanel.ts` does not exist.
- `utils/posthog.ts` exists and does not import `mixpanel-browser`.
- `utils/analytics.ts` still exports `sanitizeAnalyticsError` and does not init PostHog.
- `telemetry-status/route.ts` uses fail-closed language: missing PostHog config → disabled; does not set enabled on catch.
- `PrivacySettings.tsx` does not claim “No personal information or presentation content is collected”.
- `MixpanelInitializer` is gone; ClientRoot wires PostHog init only.
- Root `docker-compose.yml` does not define PostHog, ClickHouse, or Kafka services and does not `include` `deploy/posthog/`.
- `deploy/posthog/` exists with a compose file and README documenting a **separate** up command.

Manual (not automated in this spec): Network tab has no `api-eu.mixpanel.com`; empty PostHog env → no PostHog capture requests; with `deploy/posthog` up + key, a forced generate failure → one error visible at `http://localhost:8010`.

`npx tsc --noEmit` and `next build` must pass after import removal.

## Out of scope

- Merging PostHog into the GSlide image, sidecar, or root Compose `up`.
- Production Kubernetes / Helm PostHog.
- Baking a project API key into the GSlide image (paste `phc_…` after first PostHog signup).
- Embedding PostHog’s dashboard inside GSlide settings.
- PII redaction of remaining props beyond the forbidden list (there should be no leftover Mixpanel props).
- Renaming historical Mixpanel event names.
- FastAPI-side error tracking.
- Consent banner / cookie CMP (persistence is `localStorage` only).
- Migrating Mixpanel cloud data.

## Risks

- **Dockerfile `NEXT_PUBLIC_` trap:** avoided by serving host/key from telemetry-status.
- **Caught errors invisible:** mitigated by the closed `captureError` list; do not rely on exception autocapture alone.
- **Error messages leaking secrets:** `sanitizeAnalyticsError` truncates; it does not redact tokens. Do not pass raw API-key-bearing strings into `captureError`. If a catch already has a user-facing toast message, send that, not the full axios body.
- **Opt-out POST vs file:** pre-existing `user-config` → FastAPI provider-settings → file mirror. This spec does not rebuild that path; verify the Settings toggle still flips telemetry-status for an admin.
- **Browser vs Docker DNS:** `POSTHOG_HOST` must be `http://localhost:8010` (or LAN/HTTPS), not `http://posthog:8000`. Two Compose projects do not share a required network.
- **Hobby stack weight:** starting GSlide must stay possible on a laptop that is not running ClickHouse.
