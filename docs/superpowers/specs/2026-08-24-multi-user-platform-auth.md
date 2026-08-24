# Multi-user Platform Auth — Design Spec

**Date:** 2026-08-24  
**Status:** Approved direction (brainstorming)

## Product goal

Ship a multi-user web app where anyone can register and use presentations.  
LLM inference runs on **platform self-hosted models** configured by the operator/admin. End users never enter API keys or pick providers.

## Non-goals (this phase)

- Email verification / password reset
- Social OAuth (Google, etc.)
- Per-user LLM keys (BYOK)
- Billing, quotas, usage dashboards (follow-up)
- Full visual redesign of Dashboard / Editor
- Changing Presenton Cloud OAuth (unused for end users in this model)

## Actors

| Actor | Capabilities |
|-------|----------------|
| **Anonymous** | Sign up, Log in |
| **User** | Create/edit own presentations, log out; no provider Settings |
| **Admin** | Everything users can + Admin panel (users, API keys) + configure platform LLM |
| **Operator** | Deploy with `DISABLE_AUTH=false`, platform LLM env / admin Settings, `CAN_CHANGE_KEYS` policy |

## Auth model

- Keep existing username + password, JWT httpOnly cookie, `owner_id` row scoping.
- Keep one-time **`POST /api/v1/auth/setup`** for the first admin (or env bootstrap).
- Add public **`POST /api/v1/auth/register`**: creates `is_superuser=False` users (same shape as admin-created users).
- Register is allowed only when the instance is already configured (`User` count > 0).
- Successful register **auto-logs in** (same cookie as login).
- Rate-limit register failures/attempts similarly to login.
- Keep Admin `POST /api/v1/admin/users` for ops; public register is the primary path.

## Platform LLM model

- End-user flow must **not** use `/` LLM onboarding (`Home` / `PresentonMode`).
- Prod posture: `CAN_CHANGE_KEYS=false` (or equivalent) so `ConfigurationInitializer` loads `/api/runtime-config` and skips key wizard.
- Provider configuration remains admin-only (`/api/v1/admin/provider-settings`).
- After auth, default landing is **`/dashboard`** (not `/upload`, not `/` onboarding).

## UX surfaces (phase 1)

1. **Auth gate on `/`** when unauthenticated: Login + Sign up (toggle or tabs), plus first-run Setup when `configured=false`.
2. **Logout** reachable from account/settings (existing) and visible from dashboard chrome.
3. Authenticated visit to `/` redirects to `/dashboard` in platform mode.

## Success criteria

- New visitor can Sign up → land on Dashboard → create a presentation owned by their `user_id`.
- Second user cannot see the first user’s presentations.
- Regular user never sees LLM key onboarding.
- Admin can still configure providers and manage users.
- Existing login/logout/setup/admin create-user tests remain green; new register tests cover happy path + conflicts + unconfigured instance.

## Deploy posture

Recommended env for platform multi-user mode (see `.env.example` → **Platform multi-user mode**):

```bash
DISABLE_AUTH=false
CAN_CHANGE_KEYS=false
# Platform LLM: configure via Admin Settings / deployment env for your self-hosted OpenAI-compatible endpoint
```

With `CAN_CHANGE_KEYS=false`, end users skip the LLM key wizard; the operator or admin sets provider credentials via Admin Settings and/or deployment env (`LLM=custom`, `CUSTOM_LLM_URL`, etc.).

### End-to-end smoke checklist

Run manually after deploy (fresh DB or wiped `app_data`):

1. Fresh DB → complete first-run **Setup admin**
2. Admin configures self-hosted model (Admin → provider settings)
3. Private/incognito window → **Sign up** as `alice`
4. Alice lands on empty Dashboard; creates a presentation
5. Second private window → **Sign up** as `bob`
6. Bob's Dashboard does **not** list Alice's decks
7. Alice **logs out**; direct URL to Alice's presentation returns 401 or redirects to login
8. Admin panel still lists both users (and provider config remains editable)

Automated register/auth integration tests cover API-level behavior; this checklist validates browser UX and cross-user isolation.
