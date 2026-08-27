# No Admin + Per-User Provider Keys — Design Spec

**Date:** 2026-08-27  
**Status:** Approved for planning  
**Supersedes (auth/LLM posture):** `docs/superpowers/specs/2026-08-24-multi-user-platform-auth.md` — that spec’s admin actor, first-run Setup, `CAN_CHANGE_KEYS=false` platform mode, and “no BYOK” non-goal no longer apply.

## Product goal

Every person who can log in is a **normal user**. There is no administrator account, no first-run “Create admin” screen, and no user-management UI (including the account count).

Anyone signed in can open **Settings** and change LLM / image / search keys the way only admin can today. Keys are **per user**. A user who has never saved Settings uses **process env** (Docker / `.env`, plus the one-time boot merge of the legacy singleton described below).

Presentations, assets, and saved provider keys stay isolated by `user_id`. Settings chrome (Text / Image / Search / Analytics sections) stays the current UI.

## Non-goals

- Email verification, password reset, OAuth
- Billing, quotas, usage dashboards
- Redesign of Settings forms (layout, fields, validation copy stay)
- New API-key management screen (the Admin tab goes away; token HTTP routes become self-scoped — see below)
- Per-user Analytics / PostHog host (`DISABLE_ANONYMOUS_TRACKING`, `POSTHOG_*` stay instance-level)
- Splitting `provider_settings` id=1 rows into each existing user (no copy-on-register)

## Decisions locked

| Topic | Choice |
|---|---|
| Admin role | **Gone.** Delete admin UI, `/api/v1/admin`, setup, and every authorization branch on `is_superuser` / `role === "admin"` / `is_admin`. Do not leave unused helpers, pages, or “always false” context flags. |
| First run | **Register**, not Setup. Empty instance: AuthGate shows Sign in + Create account (default login). No “Create your admin login”. |
| `POST /api/v1/auth/setup` | **Remove.** Callers use `POST /api/v1/auth/register` (allowed when user count is 0). |
| Register on empty DB | **Allowed.** Auto-login cookie (same as today). New rows do not set `admin_slot` (column dropped). |
| Login on empty DB | **428** with copy that the instance has no accounts yet (not “Login setup is required” / `setup_required`). |
| Admin UI / APIs | **Delete, do not hide.** Remove the Settings Admin tab, `AdminPanel.tsx`, `/admin` route (no redirect stub that still ships the page), and `/api/v1/admin/users` create/list/password/delete. No `role === "admin"` CSS/`canChangeKeys` gate that leaves the panel in the bundle unused. |
| Key storage | Table `user_provider_settings` keyed by `user_id`. Not the singleton `provider_settings.id = 1`. |
| Resolve order | **User overlay (non-empty fields) then `os.environ`.** Never the other user’s overlay. Never write one user’s save into process env. |
| First Save | GET returns **effective** (overlay ∪ env) so the form still looks filled from env. PUT persists the submitted provider body as that user’s overlay. Saving therefore snapshots the form; users who never Save keep env-only. |
| Legacy global keys | **Boot only:** lifespan may still merge singleton `provider_settings` / `userConfig.json` into `os.environ` once. **Do not** run `UserConfigEnvUpdateMiddleware` per request. Do not write user overlays back to the singleton or file (except `AUTH_*` recovery fields already in the file). |
| `CAN_CHANGE_KEYS` | Unchanged meaning: `false` locks Settings (403, hide/redirect as today). Default remains not-`false` (editable). **Any authenticated user** may edit when it is allowed — not admin-only. |
| `DISABLE_AUTH` | No user overlay. Settings read/write the **legacy singleton + file + env** (local operator mode). AuthGate still skipped. |
| Env bootstrap | `AUTH_USERNAME` / `AUTH_PASSWORD` create or recover a **normal** user, not superuser / `admin_slot=primary`. |
| API Bearer `sk-gslide-` / `sk-presenton-` | Token must belong to an **active user**. Overlay is that token’s `user_id`. `/api/v1/auth/token/*` is the **current user**, not admin. |
| `role` in `/status` | **Delete the field.** Next stops reading `role`. Authenticated vs not is enough. |
| Asset access | Owner-id only. Delete admin filesystem bypass (`isAdmin` extra roots, `AuthPrincipal.is_admin`, `gslide_current_owner_is_admin`). `DISABLE_AUTH` stays unrestricted local. |
| Schema leftovers | Same Alembic as `user_provider_settings`: **drop `user.admin_slot`**, `uq_user_admin_slot`, and **`user.is_superuser`**. FastAPI Users in this repo already uses a custom `User` + `VersionedJWTStrategy` (not `SQLAlchemyBaseUserTable` / superuser routes). Adapt manager/create/serialize so nothing reads or writes `is_superuser`. Do not keep the column “for the library”. |

## Actors

| Actor | Capabilities |
|---|---|
| **Anonymous** | Register, log in |
| **User** | Own presentations; Settings Text/Image/Search when `CAN_CHANGE_KEYS` allows; logout |
| **Operator** | Deploy env (`LLM`, `OPENAI_API_KEY`, `CAN_CHANGE_KEYS`, `AUTH_*`, …). No in-app admin persona. |

## Auth flow

```
configured = (User count > 0)

GET /           unauthenticated
  configured=false or true → same AuthGate: Sign in | Create account
  no setup mode, no “Create admin”

POST /api/v1/auth/register
  allowed when configured is false or true
  rate-limit like today
  409 duplicate username
  201 + session cookie

POST /api/v1/auth/login
  428 if count == 0
  else unchanged (401/429)

SessionAuthMiddleware
  428 on protected API when count == 0 (no setup_required flag)
  drop admin_only checks for /api/v1/admin/provider-settings (route goes away)
  drop admin_only for /api/v1/auth/token/ and ppt font POST/DELETE
```

Next `AuthGate`: delete `authMode === "setup"` copy and `/setup` submit. `configured` is only used so login can show 428 vs 401; both modes show the login/register toggle.

`proxy.ts` 428 body: stop advertising `setup_required` as a product concept (same 428 is “no accounts yet” or keep a generic unauthenticated-empty-instance signal without Setup UI).

## Provider config

### Data

New Alembic revision after `d2f4a6b8c0e1`:

- `user_provider_settings`
  - `user_id` UUID PK, FK `user.id` ON DELETE CASCADE
  - `config` JSON not null, default `{}`
  - `updated_at` timestamptz not null

Reuse `sanitize_provider_settings` / `merge_provider_settings` from `services/provider_settings.py`. Overlay **must not** store `AUTH_*` or Cloud status fields. Overlay **must not** store `DISABLE_ANONYMOUS_TRACKING` (Analytics stays instance file/env; Privacy UI keeps using the existing telemetry/`userConfig` path, not the per-user overlay).

### HTTP

Replace admin-gated provider routes with authenticated user routes:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/v1/settings/provider` | Current user’s overlay merged with env (`fill_unset_from_runtime` equivalent using **process env**, not another user’s DB). 401 if unauthenticated (`DISABLE_AUTH`: singleton/file/env). |
| PUT | `/api/v1/settings/provider` | Replace overlay with sanitized body. 403 if `CAN_CHANGE_KEYS=false`. Do not call `update_env_with_user_config()` for that save. |

Delete `/api/v1/admin/provider-settings` and `require_settings_admin` (not a hidden 403 for non-admins). If the `/api/v1/admin` router has no remaining routes, delete the router include.

Next `app/api/user-config/route.ts`: forward to `/api/v1/settings/provider`; `requireAuthenticatedApi` instead of `requireAdminApi`. Same `CAN_CHANGE_KEYS` 403.

Next `app/api/can-change-keys/route.ts`:

```ts
canChange: status.authenticated && canChangeKeys
```

(`DISABLE_AUTH`: treat as authenticated for this flag, same as today when the gate is skipped.)

### Request-scoped resolve

Today `UserConfigEnvUpdateMiddleware` copies the **global** file into `os.environ` on every request. That is unsafe once two users have different keys.

1. Remove per-request global env mutation.
2. After `SessionAuthMiddleware` sets `owner_id`, load that user’s overlay JSON into a ContextVar (e.g. `gslide_provider_overlay`).
3. `utils/get_env.py` provider getters (`get_llm_provider_env`, `get_openai_api_key_env`, `get_google_*`, `get_custom_*`, image/web-search provider keys in the same family) read: overlay field if set and non-empty, else `os.getenv`.
4. Non-provider getters (`DATABASE_URL`, `APP_DATA_DIRECTORY`, `CAN_CHANGE_KEYS`, `DISABLE_AUTH`, …) **only** `os.getenv`.
5. Background jobs / export that already run with an owner id must set the same ContextVar for that owner before calling the LLM.

`get_llm_client()` / `check_llm_and_image_provider_api_or_model_availability()` keep calling `get_*_env()`; they become per-request automatically.

### Isolation test (required)

Two users A and B. A saves `OPENAI_API_KEY=sk-a`, B saves `sk-b` (or B saves nothing). Concurrent generate: A’s client uses `sk-a`, B uses `sk-b` or env. A’s GET settings never returns `sk-b`.

## UI

- **AuthGate:** remove setup headline/description/submit; empty instance uses register.
- **Settings sidebar:** delete the `admin` section from `SECTIONS` (not `hidden` / `role === "admin"`). Default section remains Text.
- **Admin UI files:** delete `AdminPanel.tsx` and `admin/page.tsx`. Do not keep an unlinked page. Keep Save gated only by `can_change_keys`.
- **`requireAdminSession` / `requireAdminApi`:** delete call sites; replace settings forwarding with authenticated-user checks. Delete the helpers if unused.
- **Header / Home:** Settings link already follows `can_change_keys`; after can-change-keys fix, every logged-in user sees it when env allows.
- Copy that says “Ask the administrator…” (`ConfigurationInitializer` and similar) → operator/env wording, not admin.

## Bootstrap and docs

- `bootstrap_database_admin`: create/recover user with `is_superuser=False`, `admin_slot=None`. Do not require a superuser to exist.
- `.env.example`, `README.md`, `setup-presonton.md`: first visit is **register**, not create admin. Drop “platform multi-user = CAN_CHANGE_KEYS=false + admin configures LLM” as the recommended Gapo posture. Optional `AUTH_USERNAME`/`AUTH_PASSWORD` still seed the first **user**.
- `docs/architecture/*` that name `proxy.ts` + admin setup: update in the same change if they would be wrong.

## Error handling

| Case | Response |
|---|---|
| Unauthenticated Settings GET/PUT | 401 |
| `CAN_CHANGE_KEYS=false` | 403, same detail as today |
| Register when `DISABLE_AUTH` | 400 (unchanged) |
| PUT invalid JSON | 400 |
| User deleted (CASCADE) | overlay row gone |

Do not leak another user’s key in 4xx/5xx bodies.

## Testing

FastAPI:

- Register succeeds when user count is 0; creates non-superuser; sets cookie.
- `POST /setup` is gone (404) or test file no longer calls it.
- Login 428 on empty DB without `setup_required: true`.
- `/status` has no `role` field.
- `GET /api/v1/admin/*` is 404 (router gone).
- No `admin_slot` or `is_superuser` column; overlay table exists.
- GET/PUT `/api/v1/settings/provider` as a normal user; 403 for a second user’s id (there is no user-id in the path — prove by two sessions).
- Overlay isolation: monkeypatch/env + two overlays; `get_openai_api_key_env()` inside a context matches the current overlay.
- Bearer token for a non-superuser user is accepted and uses that user’s overlay.
- `test_auth_bootstrap.py`: env bootstrap is a normal user.
- Admin user CRUD tests: replace with 404/removed or delete those cases.
- `test_migrations.py`: new head revision; table `user_provider_settings` exists.

Next:

- Contract: `can-change-keys` does not require `role === "admin"`.
- Contract: AuthGate has no “Create admin” / setup mode.
- Contract: SettingSideBar has no `admin` id.
- `user-config` route does not call `requireAdminApi`.

Manual smoke (fresh DB):

1. Open `/` → Sign in / Create account, **not** Create admin.
2. Register `alice` → dashboard → Settings → keys save → generate uses alice’s key.
3. Incognito register `bob` → Settings empty/env → generate does not use alice’s key; bob cannot see alice’s decks.
4. No Admin tab; no account count.

## Approaches considered

**A — Per-user overlay + env fallback, request ContextVar (chosen)**  
Matches BYOK without copying platform secrets onto every new account. Safe under concurrency.

**B — Copy env into the user row on first login**  
Rejected: every user would persist the operator secret.

**C — Hide Admin UI only, keep singleton keys**  
Rejected: not per-user.

## Cleanup (delete — do not leave dead)

Product code that exists only for admin or setup must go in this change, including tests and docs that describe it.

**Next (delete files / symbols)**

- `app/(presentation-generator)/(dashboard)/admin/` (`AdminPanel.tsx`, `page.tsx`)
- Settings sidebar `admin` section and `SettingPage` AdminPanel import
- `requireAdminSession`, `requireAdminApi` (replace settings with authenticated-user check)
- `utils/settingsAccess.ts` if it only maps admin vs account
- `role` on `ServerAuthStatus` / AuthGate / `serverAuth.ts` / export `isAdmin` / `readable-local-file` admin roots

**FastAPI (delete files / symbols)**

- Package `api/v1/admin/` and router include
- `POST /api/v1/auth/setup` and AuthGate setup mode
- `get_current_admin`, `require_settings_admin`, `require_browser_admin_principal`
- `AuthPrincipal.is_admin`, `set_current_owner_is_admin` / `get_current_owner_is_admin`
- Middleware `admin_only` list (`/api/v1/admin/`, token, font POST gated on admin)
- `User.is_superuser` field, all `is_superuser=True/False` constructors, `serialize_user`/`PublicUser.role`, `AdminCreateUserRequest` / `AdminResetPasswordRequest`
- `persist_admin_credentials` if it only existed to snapshot the bootstrap admin; keep `userConfig.json` `AUTH_*` only if bootstrap recovery still needs it under a non-admin name
- Rename `bootstrap_database_admin` to something that creates a normal user (lookup by username/env, not `is_superuser`)

**Keep (still used)**

- `user` table, session cookie, register/login/logout
- Singleton `provider_settings` + `userConfig.json` for **boot env merge** and `DISABLE_AUTH` local writes
- `is_active` / `is_verified` / `auth_version`
- Token routes, re-scoped to the current user (no new UI)

## Out of scope follow-ups

- Self-service API-key **UI** (HTTP already self-scoped after this change)
- Migrating historical `provider_settings` id=1 into a chosen user
