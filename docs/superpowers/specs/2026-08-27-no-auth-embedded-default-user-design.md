# No Auth UI + Default-On Single Demo User — Design Spec

**Date:** 2026-08-27
**Status:** Approved for planning
**Depends on:** `docs/superpowers/specs/2026-08-27-no-admin-per-user-keys-design.md` (already shipped on `main`, commit `7cf250b0`)
**Supersedes (UI surface):** The `/auth` page, `AuthGate`, `LogoutButton`, login/register/logout HTTP routes from `docs/superpowers/specs/2026-08-24-multi-user-platform-auth.md` (only the UI-surface parts — the multi-user data ownership posture from that spec remains in force).

## Product goal

Gslide becomes a **miniweb** that ships as one feature inside a larger Gapo web app. The parent Gapo web app handles all user identity (sign-up, sign-in, sign-out). Gslide therefore has **no register / login / logout UI of its own**.

For demo purposes (and as a placeholder until the Gapo parent app handshake is designed), gslide auto-creates a single **demo user** at server startup and treats every incoming request as that user. Real users do not exist yet, but every piece of code that already scopes data by `user_id` continues to scope by `user_id` — `presentations`, `slides`, `assets`, `user_provider_settings`, `app_data/users/<id>/`, and `_backfill_legacy_ownership` all run against the demo user's id.

When the parent Gapo app is ready, only **one function** changes: `resolve_request_principal`. No UI work is repeated, no `owner_id` migration is repeated, no `app_data` path migration is repeated.

## Non-goals

- JWT verification from the parent app (parent app shape is unknown; spec leaves a single, well-marked extension point).
- Iframe embedding, CSP, `X-Frame-Options` framing headers.
- Multi-tenant / workspace scoping.
- Removing `OnboardingMode` / `FinalStep` (already dead code; out of scope).
- `DISABLE_AUTH` mode (already covers single-user for local operators — unchanged).
- Cleanup of stale `isAdmin: false` flags in `app/api/read-file/route.ts` and `app/api/export-presentation/file/route.ts` (cosmetic, leave).
- T6 docs/copy cleanup from `2026-08-27-no-admin-per-user-keys.md` (separate plan, separate scope).

## Decisions locked

| Topic | Choice |
|---|---|
| Auth UI | **Gone.** Delete `/auth` page, `AuthGate`, `LogoutButton`. No register/login/logout UI anywhere. |
| Root landing | `/` redirects straight to `/dashboard` (no intermediate page). |
| Demo user identity | A single, fixed UUID `00000000-0000-0000-0000-000000000001`, username `demo`, random 32-byte password, `auth_version=1`. Seeded once at lifespan if missing. Restart is idempotent. |
| Cookie name | `gslide_session` is still set when a real login happens. Default fallback path does **not** issue a cookie; the principal comes from server-side lookup of the demo user. |
| `resolve_request_principal` order | 1. Existing cookie / `sk-gslide-*` Bearer path (kept for direct curl + programmatic API access during demo). 2. **Default fallback**: return the demo principal. 3. (Future) parent-app header/cookie — single insertion point above #1. |
| First-user bootstrap | `bootstrap_database_user` is repurposed: always upsert the demo user (fixed id, fixed username, random password if newly created). Ignore `AUTH_USERNAME` / `AUTH_PASSWORD` env unless `DEMO_AUTH_FROM_ENV=true` is set (escape hatch for operators who want a different username). |
| `_backfill_legacy_ownership` | Runs once on first successful lookup of the demo user. Assigns all `owner_id IS NULL` rows + the `presentation_custom_themes` KeyValue key to the demo user. |
| Settings page | Stays. Demo user can paste OpenAI / Gemini keys into the per-user overlay just like any user. |
| `CAN_CHANGE_KEYS=false` | Still locks Settings as today; unaffected. |
| `DISABLE_AUTH` | Unchanged local-operator mode. The demo user fallback only applies when auth is **enabled** (i.e., not `DISABLE_AUTH`). |
| `POSTHOG_*` / `DISABLE_ANONYMOUS_TRACKING` | Unchanged. Errors still report to PostHog fail-closed; demo user has no special opt-in. |
| CORS | Unchanged for demo (`NEXT_PUBLIC_URL` origin or `*`). When parent-app embedding is designed, add the parent origin to the same allowlist. |
| Cookie `Domain=` | Not set. Demo is same-origin behind nginx. When parent-app subdomain/iframe shape is decided, revisit. |
| Rollout | One commit on `main`, branch not pushed. No DB migration. |

## Actors

| Actor | Capabilities |
|---|---|
| **Demo user** (current, only) | Owns every row and every disk file under the demo user's id. Can edit Settings when `CAN_CHANGE_KEYS` allows. Has no password UI but a random password exists in DB. |
| **Operator** | Deploys env, edits `LLM` / `OPENAI_API_KEY` / `GEMINI_API_KEY` etc. No in-app admin persona. |
| **Programmatic client** (direct curl, smoke tests, export pipelines) | Can still send `Authorization: Bearer sk-gslide-...` API keys. The principal resolves to that key's owning user — the demo user, unless a real user was created by some out-of-band means. |
| **Parent Gapo app** (future) | Will hand identity to gslide; the single extension point is `resolve_request_principal`. Out of scope to implement now. |

## Auth flow (post-cut)

```
GET /                           anonymous → 302 /dashboard
GET /dashboard                  any principal → 200 (no auth gate)
GET /api/v1/auth/status         any → { authenticated: true, user_id: <demo>, username: "demo" }
POST /api/v1/auth/login         410 Gone (route removed)
POST /api/v1/auth/register      410 Gone (route removed)
POST /api/v1/auth/logout        410 Gone (route removed)
GET  /api/v1/auth/verify        demo user passes → access to /app_data/* private roots
```

Every FastAPI request that currently expects a `Principal`:

```
principal = resolve_request_principal(request)
  1. cookie / Bearer path  → principal if found
  2. demo fallback         → DEMO_PRINCIPAL (cached module-scope)
  3. (future) parent app   → <inserted here>
return principal
```

`SessionAuthMiddleware` still rejects unauthenticated `/app_data/*` and `/api/*` requests **except** when the principal is the demo fallback. Disk isolation under `app_data/users/<demo-uuid>/` keeps every file under the demo user.

## Component changes

### Next.js (servers/nextjs)

| File | Change |
|---|---|
| `app/page.tsx` | Remove the "Sign in" link. Redirect `/` → `/dashboard`. |
| `app/auth/page.tsx` | **Delete.** |
| `app/auth/` | **Delete directory.** |
| `components/Auth/AuthGate.tsx` | **Delete.** |
| `components/Auth/LogoutButton.tsx` | **Delete.** |
| `app/(presentation-generator)/layout.tsx` | Drop `await requireAppSession()`. Layout passes through. |
| `proxy.ts` | Keep `/app_data/*` gate. Drop `/api/*` and `/api/v1/auth/*` special handling. Public paths simplify to `/api/telemetry-status`, `/api/update-svg`, `/api/export-presentation-data/*`. The session-cookie planting branch for `/pdf-maker?exportSession=…` stays. |
| `utils/serverAuth.ts` | `getServerAuthStatus()` returns the demo status from `/api/v1/auth/status`. `requireAppSession()` becomes a no-op pass-through. |
| `utils/auth.ts` | `isAuthDisabled()` becomes a no-op (always true at the call sites, which means "skip the auth gate"); reduce to a single flag read for back-compat. |
| `lib/server-auth-role.ts` | `requireAuthenticatedApi()` becomes a no-op pass-through. `authStatusForRequest()` proxies to the demo status. |
| `app/api/can-change-keys/route.ts` | Returns `{ canChange: true }` unconditionally (or read `CAN_CHANGE_KEYS` env only). Drives the Settings visibility. |
| `app/api/user-config/route.ts` | Forward the demo cookie-less context. `requireAuthenticatedApi` is now a no-op. |
| `app/api/runtime-config/route.ts` | No change to shape, auth gate removed. |
| `app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx` | Remove `<LogoutButton>` import + render (line 222 area). Drop the redirect-to-`/dashboard` when `can_change_keys` is false (now always true). |
| `app/(presentation-generator)/(dashboard)/settings/SettingSideBar.tsx` | No shape change; remove any "Sign out" section. |

### FastAPI (servers/fastapi)

| File | Change |
|---|---|
| `api/v1/auth/router.py` | Remove `POST /login`, `POST /register`, `POST /logout`. Keep `GET /status` (returns demo user) and `GET /verify` (used by nginx `auth_request`). Remove `_set_login_cookie` if no other route uses it. Return `410 Gone` for removed routes for any leftover clients. |
| `api/v1/auth/principal.py` | `resolve_request_principal` gains the demo-fallback branch (returns `DEMO_PRINCIPAL` cached at module scope). Cookie/Bearer path is preserved. |
| `api/v1/auth/context.py` | `get_current_owner_id` returns demo user id when no real owner is set in ContextVar (defensive, not the primary path). |
| `api/v1/auth/users.py` | `serialize_user` returns demo user shape. `VersionedJWTStrategy` and `read_user_from_cookie` stay (still used by the cookie path). |
| `api/v1/auth/config.py` | `SESSION_COOKIE_NAME` and `LEGACY_SESSION_COOKIE_NAME` constants stay. `persist_auth_credentials` stays for boot. |
| `api/v1/auth/token.py` | No change. Bearer path continues to resolve. |
| `api/v1/auth/bootstrap.py` | `bootstrap_database_user` is rewritten to upsert the **demo user** with fixed id `00000000-0000-0000-0000-000000000001`, username `demo`, random 32-byte password (only set on first create — subsequent restarts do not overwrite), `auth_version=1`. Triggers `_backfill_legacy_ownership(demo_user)` once after the user is confirmed present. Optional `DEMO_AUTH_FROM_ENV=true` reads `DEMO_USERNAME` (default `demo`) and `DEMO_PASSWORD` (default: random + log). Honors `RESET_AUTH` as today to reset. |
| `api/lifespan.py` | `bootstrap_database_user` call site stays. The function name is preserved (callers don't change); only its body changes. |
| `api/middlewares.py` | `SessionAuthMiddleware.dispatch` reads the principal via `resolve_request_principal`, then loads the demo user's overlay into `gslide_provider_overlay`. The 401-rejection path for `/app_data/*` stays: demo principal passes. |
| `api/main.py` | No CORS / router changes. |
| `api/v1/settings/router.py` | No change. Settings endpoints continue to operate against the demo user's `user_provider_settings` row. |

### Tests

**Update (existing):**

- `tests/unit/test_auth_endpoints.py` — replace login/register/logout tests with "endpoint returns 410 Gone" assertions.
- `tests/unit/test_auth_bootstrap.py` — assert the demo user is seeded with the fixed UUID, and that `_backfill_legacy_ownership` runs once.
- `tests/unit/test_session_identity.py` — assert `resolve_request_principal` returns the demo principal when no cookie/Bearer is present.
- `tests/unit/test_internal_auth_headers.py` — assert `getFastApiAuthHeaders` is no longer called from the user-config path.
- `tests/unit/test_owner_isolation.py` — owner-isolation tests still pass: the demo user owns every row.

**Add (new):**

- `tests/unit/test_default_user_principal.py` — `resolve_request_principal` without cookie/Bearer returns the demo principal; with a valid Bearer `sk-gslide-...` of the demo user returns the same principal.
- `tests/unit/test_demo_user_idempotent.py` — calling `bootstrap_database_user` twice does not create a second user; `user_count` stays at 1; `_backfill_legacy_ownership` runs at most once.
- `tests/unit/test_auth_endpoints_removed.py` — `/auth/login`, `/auth/register`, `/auth/logout` return 410.

**Out of scope (do not touch):** the 9 currently-failing env/pre-existing tests from `2026-08-27-no-admin-per-user-keys` T3. They are pre-existing debt, not introduced by this spec.

## Data ownership (unchanged from `no-admin-per-user-keys`)

All user-scoped tables already have `owner_id` and `app_data/.../users/<id>/`. The demo user owns everything. Schema:

- `presentation`, `slide`, `presentation_layout_code`, `template`, `template_create_info`, `chat_history_message`, `imageasset`, `async_task`, `async_presentation_generation_task`, `template_v2` (built-ins stay shared), `webhook_subscription` — all have `owner_id` (FK CASCADE to `user.id`).
- `keyvalue` — `presentation_custom_themes` key is suffixed to `presentation_custom_themes:{demo_user_id}` on first backfill.
- `font_upload` — global, unchanged.
- `provider_settings` (singleton, id=1) — used only in `DISABLE_AUTH` mode; untouched here.

## Operator log output (demo user creation)

When the demo user is freshly created at lifespan, log a single INFO line:

```
[demo-user] auto-created (id=00000000-0000-0000-0000-000000000001, username=demo, password=<random 32-byte base64>)
```

The password is logged once, then never again. Operators who need to avoid the log can set `DEMO_AUTH_FROM_ENV=true` and supply `DEMO_USERNAME` / `DEMO_PASSWORD` in env.

## Failure modes

| Failure | Behavior |
|---|---|
| DB unreachable at bootstrap | Server fails to start (today's behavior; unchanged). |
| Existing user present, no demo user | We do not delete existing users. The demo user is created alongside. `_backfill_legacy_ownership` only acts on rows with `owner_id IS NULL` — pre-existing owned rows are untouched. |
| Existing demo user, different password in env | Env password is ignored on subsequent boots (random password stays). Operator must use `RESET_AUTH=true` to re-sync. |
| `DISABLE_AUTH=true` | Demo fallback does not run. Existing single-operator mode handles it. |
| Real user is later created (programmatic / future parent-app path) | `_backfill_legacy_ownership` does not re-run. New users start with no owned rows. Their first action creates rows with their own `owner_id`. The demo user's data is untouched. |

## Out-of-scope follow-ups (recorded for the parent-app integration spec)

- Parent Gapo app identity handshake (header / cookie / JWT).
- Cookie `Domain=` if parent app uses a subdomain.
- CORS allowlist update for the parent app origin.
- Iframe framing headers (CSP `frame-ancestors`, `X-Frame-Options`) if the parent app embeds gslide as an iframe.
- Settings page visibility when the parent app centralizes LLM keys.
