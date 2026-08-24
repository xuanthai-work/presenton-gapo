# Multi-user Platform Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable public Sign up / Login / Logout for a multi-user web app where everyone uses the operator’s self-hosted LLM — no per-user API-key onboarding.

**Architecture:** Extend the existing FastAPI username/password + httpOnly JWT cookie auth. Add `POST /api/v1/auth/register` (non-admin users, auto-login). Redesign `AuthGate` into Login + Sign up (+ keep first-admin Setup). Route authenticated users to `/dashboard` in platform mode (`CAN_CHANGE_KEYS=false`), skipping `Home` LLM onboarding. Keep Admin panel and `owner_id` scoping unchanged.

**Tech Stack:** FastAPI + SQLAlchemy/SQLModel (`User`), existing `PASSWORD_HELPER` / JWT cookie strategy, Next.js App Router (`AuthGate`, `ConfigurationInitializer`, dashboard layout).

**Spec:** `docs/superpowers/specs/2026-08-24-multi-user-platform-auth.md`

## Global Constraints

- Do **not** commit unless the human explicitly asks.
- Do **not** implement email verification, password reset, social OAuth, billing, or quotas in this plan.
- Do **not** remove Admin `POST /api/v1/admin/users` — public register is additive.
- Register creates `is_superuser=False` only; first admin remains `/setup` (or env bootstrap).
- Register is rejected with `428` when no users exist yet (`configured=false`); Setup must run first.
- Successful register must set the same session cookie as login (`SESSION_COOKIE_NAME`, httpOnly, lax, path `/`).
- Add `/api/v1/auth/register` to `SessionAuthMiddleware._PUBLIC_AUTH_PATHS`.
- Preserve username rules: `AuthCredentialsRequest` / `USERNAME_PATTERN`, password min length **8** for register (same as setup/admin create).
- Python tests from `servers/fastapi`: `uv run --locked python -m pytest <file> -v`.
- Prod posture documented: `DISABLE_AUTH=false`, platform LLM via admin/runtime config, prefer `CAN_CHANGE_KEYS=false` so end users never hit key wizard.
- UI redesign stays within Auth surfaces this phase; do not redesign Dashboard/Editor.

## Out of scope

- Presenton Cloud device-flow UX changes
- Changing `owner_id` DB schema
- Per-user provider settings
- Mobile-native apps

## File map

| File | Role |
|------|------|
| `servers/fastapi/api/v1/auth/schemas.py` | Add `RegisterCredentialsRequest` (or reuse `AuthCredentialsRequest`) |
| `servers/fastapi/api/v1/auth/router.py` | Add `POST /register`; rate-limit; auto-login cookie |
| `servers/fastapi/api/v1/auth/rate_limit.py` | Reuse `LOGIN_RATE_LIMITER` (or shared helper) for register keys |
| `servers/fastapi/api/middlewares.py` | Public path for `/api/v1/auth/register` |
| `servers/fastapi/tests/integration/test_auth_endpoints.py` | Register happy path, conflict, unconfigured, rate behavior |
| `servers/nextjs/components/Auth/AuthGate.tsx` | Login / Sign up / Setup UI + wire register |
| `servers/nextjs/components/Auth/LogoutButton.tsx` | Keep; ensure dashboard discoverability if missing |
| `servers/nextjs/app/page.tsx` | Still AuthGate vs ConfigurationInitializer+Home |
| `servers/nextjs/app/ConfigurationInitializer.tsx` | Platform mode: authenticated `/` → `/dashboard` |
| `servers/nextjs/app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage.tsx` | Ensure Logout reachable for normal users |
| `.env.example` / short ops note in plan handoff | `DISABLE_AUTH`, `CAN_CHANGE_KEYS` for platform mode |

---

### Task 1: Backend public register endpoint + tests

**Files:**
- Modify: `servers/fastapi/api/v1/auth/schemas.py`
- Modify: `servers/fastapi/api/v1/auth/router.py`
- Modify: `servers/fastapi/api/middlewares.py`
- Modify: `servers/fastapi/tests/integration/test_auth_endpoints.py`

**Interfaces:**
- Consumes: `AuthCredentialsRequest` (or identical register schema), `PASSWORD_HELPER`, `User`, `_account_count`, `_set_login_cookie`, `get_jwt_strategy`, `LOGIN_RATE_LIMITER`, `login_rate_limit_key`, `normalize_username`
- Produces: `POST /api/v1/auth/register` → `201` JSON `{ configured: true, authenticated: true, id, username, role: "user", ... }` + Set-Cookie; errors `428` (not configured), `409` (username taken), `422` (validation), `429` (rate limit)

- [ ] **Step 1: Write failing integration tests**

Add to `servers/fastapi/tests/integration/test_auth_endpoints.py` (reuse `_build_client`):

```python
def test_register_creates_non_admin_user_and_sets_cookie(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    setup = client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    assert setup.status_code == 200

    response = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["authenticated"] is True
    assert payload["username"] == "alice"
    assert payload["role"] == "user"
    assert SESSION_COOKIE_NAME in response.cookies

    status = client.get("/api/v1/auth/status")
    assert status.json()["authenticated"] is True
    assert status.json()["username"] == "alice"
    asyncio.run(engine.dispose())


def test_register_rejected_when_instance_not_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    response = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    assert response.status_code == 428
    asyncio.run(engine.dispose())


def test_register_conflict_on_duplicate_username(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    first = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    client.cookies.clear()
    second = client.post(
        "/api/v1/auth/register",
        json={"username": "ALICE", "password": "otherpass1"},
    )
    assert first.status_code == 201
    assert second.status_code == 409
    asyncio.run(engine.dispose())
```

- [ ] **Step 2: Run tests — expect fail**

Run: `cd servers/fastapi && uv run --locked python -m pytest tests/integration/test_auth_endpoints.py::test_register_creates_non_admin_user_and_sets_cookie tests/integration/test_auth_endpoints.py::test_register_rejected_when_instance_not_configured tests/integration/test_auth_endpoints.py::test_register_conflict_on_duplicate_username -v`

Expected: FAIL (404 / missing route)

- [ ] **Step 3: Implement register + public middleware path**

In `schemas.py`, either export alias:

```python
class RegisterCredentialsRequest(AuthCredentialsRequest):
    """Public self-signup; same validation as setup/admin create."""
```

In `router.py` add endpoint (mirror admin create user + login cookie):

```python
@API_V1_AUTH_ROUTER.post("/register", status_code=201)
async def register(
    body: RegisterCredentialsRequest,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    if is_disable_auth_enabled():
        raise HTTPException(status_code=400, detail="Auth is disabled")
    if not await _account_count(session):
        raise HTTPException(status_code=428, detail="Login setup is required")

    username = normalize_username(body.username)
    rate_limit_key = login_rate_limit_key(_login_client_host(request), username)
    retry_after = await LOGIN_RATE_LIMITER.retry_after(rate_limit_key)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many registration attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if len(username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters")

    exists = await session.scalar(
        select(User.id).where(func.lower(User.username) == username.casefold())
    )
    if exists:
        await LOGIN_RATE_LIMITER.record_failure(rate_limit_key)
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        username=username,
        hashed_password=PASSWORD_HELPER.hash(body.password),
        is_active=True,
        is_verified=True,
        is_superuser=False,
        auth_version=1,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        await LOGIN_RATE_LIMITER.record_failure(rate_limit_key)
        raise HTTPException(status_code=409, detail="Username already exists")
    await session.refresh(user)
    await LOGIN_RATE_LIMITER.clear(rate_limit_key)

    token = await get_jwt_strategy().write_token(user)
    response = JSONResponse(
        status_code=201,
        content={"configured": True, "authenticated": True, **serialize_user(user)},
    )
    _set_login_cookie(response, token, request)
    return response
```

In `middlewares.py`, add `"/api/v1/auth/register"` to `_PUBLIC_AUTH_PATHS`.

- [ ] **Step 4: Run tests — expect pass**

Run: same pytest command as Step 2  
Expected: PASS

Also run: `uv run --locked python -m pytest tests/integration/test_auth_endpoints.py -v`  
Expected: existing login/setup tests still PASS

- [ ] **Step 5: Commit only if human asks** (skip otherwise)

---

### Task 2: AuthGate UI — Login + Sign up + Setup

**Files:**
- Modify: `servers/nextjs/components/Auth/AuthGate.tsx`
- Optionally create: `servers/nextjs/components/Auth/AuthForm.tsx` if `AuthGate.tsx` becomes unwieldy (only split if the file is hard to edit cleanly)

**Interfaces:**
- Consumes: `GET /api/v1/auth/status`, `POST /api/v1/auth/setup`, `POST /api/v1/auth/login`, `POST /api/v1/auth/register` via `getApiUrl`, `credentials: "include"`
- Produces: Modes `setup` | `login` | `register`; on authenticated → `window.location.replace("/")` (existing); Mixpanel events for register start/success/fail if patterns already exist for login

- [ ] **Step 1: Map current AuthGate modes**

Read `AuthGate.tsx`. Today: `isSetupMode = !status.configured` → Create admin; else Sign in. No Sign up.

- [ ] **Step 2: Add UI mode state**

When `status.configured && !status.authenticated`:

- Default view: **Login**
- Toggle / tab: **Create account** → register form (username, password, confirm password)
- Submit register → `POST .../register` → on success rely on cookie + existing redirect-to-`/` effect
- Keep Setup UI unchanged when `!status.configured`

Validation (client): password ≥ 8; confirm matches; username ≥ 3; disable submit while `isSubmitting`.

Error mapping: use `formatFastApiDetail` / existing notify patterns for 409, 428, 429, 401.

- [ ] **Step 3: Wire register submit**

```typescript
const response = await fetch(getApiUrl("/api/v1/auth/register"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ username: username.trim(), password }),
});
```

On `response.ok`: `setStatus` from JSON (`authenticated: true`) so the existing redirect effect runs.  
Do not navigate to onboarding manually.

- [ ] **Step 4: Visual redesign (Auth only)**

Personal-brand Auth screen (not Presenton marketing clone):

- One composition: brand mark + headline + single form card is OK only as the interactive container
- Clear primary CTA: “Sign in” / “Create account” / “Create admin” by mode
- Link/toggle between Login ↔ Create account when configured
- Reuse existing fonts already in app (`font-syne` / project tokens) rather than introducing Inter/Roboto
- Avoid purple-glow generic AI look; pick a direction consistent with your later full redesign (document chosen CSS variables at top of the component or a tiny `auth-theme` className block)

- [ ] **Step 5: Manual check**

1. Empty DB → Setup admin works  
2. Logout → Login works  
3. Create account → lands authenticated  
4. Duplicate username → error toast, stay on form  

- [ ] **Step 6: Commit only if human asks**

---

### Task 3: Platform post-auth routing (skip LLM onboarding)

**Files:**
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx`
- Modify: `servers/nextjs/app/page.tsx` (only if needed for clarity)
- Modify: `servers/nextjs/components/Home.tsx` (no behavior change required if platform mode never mounts it)

**Interfaces:**
- Consumes: `/api/can-change-keys`, `/api/runtime-config` (existing)
- Produces: When `canChangeKeys === false` and route is `/`, redirect to **`/dashboard`** (not `/upload`)

- [ ] **Step 1: Change platform-mode redirect target**

In `ConfigurationInitializer.tsx`, in the `else` branch (`!canChangeKeys`), replace:

```typescript
router.push('/upload');
```

with:

```typescript
router.push('/dashboard');
```

(and matching `setLoadingToFalseAfterNavigatingTo('/dashboard')`).

When `canChangeKeys === true` (dev/BYOK), keep existing onboarding behavior on `/` so local key setup still works — do not delete `Home` in this task.

- [ ] **Step 2: Confirm `page.tsx` gate**

Unauthenticated → `AuthGate`.  
Authenticated → `ConfigurationInitializer` + children.  
With `CAN_CHANGE_KEYS=false`, authenticated `/` should splash then land on Dashboard.

- [ ] **Step 3: Manual check**

1. Set/simulate `CAN_CHANGE_KEYS=false`  
2. Register or login  
3. Expect Dashboard, **not** PresentonMode / API key wizard  
4. With keys already configured as admin, create presentation still works  

- [ ] **Step 4: Commit only if human asks**

---

### Task 4: Logout discoverability for normal users

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage.tsx` (header area)
- and/or `servers/nextjs/app/(presentation-generator)/(dashboard)/Components/DashboardSidebar.tsx`
- Reuse: `servers/nextjs/components/Auth/LogoutButton.tsx`

**Interfaces:**
- Consumes: `LogoutButton` → `POST /api/v1/auth/logout` → `window.location.replace("/")`
- Produces: Visible Logout control for role `user` without opening Admin-only Settings provider UI

- [ ] **Step 1: Find current logout entry points**

Confirm Logout exists on Settings account view (`UserAccountSettings.tsx`). Regular users may not notice Settings.

- [ ] **Step 2: Add Logout to dashboard chrome**

Prefer sidebar footer (near Help) or dashboard header menu:

```tsx
import LogoutButton from "@/components/Auth/LogoutButton";

// example sidebar footer
<LogoutButton
  label="Log out"
  className="flex flex-col items-center gap-2 text-[11px] text-slate-800"
/>
```

Keep Settings link for account; do not require admin role for logout.

- [ ] **Step 3: Manual check**

Login as non-admin → Log out from Dashboard → AuthGate login shown.

- [ ] **Step 4: Commit only if human asks**

---

### Task 5: Ops defaults note + smoke checklist

**Files:**
- Modify: `.env.example` (if present) — document recommended platform flags
- Optionally one short paragraph in `docs/superpowers/specs/2026-08-24-multi-user-platform-auth.md` under “Deploy posture” if `.env.example` is missing keys

- [ ] **Step 1: Document recommended env**

```bash
DISABLE_AUTH=false
CAN_CHANGE_KEYS=false
# Platform LLM: configure via Admin Settings / deployment env for your self-hosted OpenAI-compatible endpoint
```

- [ ] **Step 2: End-to-end smoke checklist (human or agent)**

1. Fresh DB → Setup admin  
2. Admin configures self-hosted model (Settings/Admin)  
3. Browser private window → Create account `alice`  
4. Alice sees empty Dashboard; creates presentation  
5. Browser private window → Create account `bob`  
6. Bob does not see Alice’s decks  
7. Alice logs out; cannot open Alice presentation URLs while logged out (401/redirect)  
8. Admin still lists users in Admin panel  

- [ ] **Step 3: Commit only if human asks**

---

## Self-review

| Spec requirement | Task |
|------------------|------|
| Public sign up | Task 1–2 |
| Login / Logout | Task 2, 4 (login exists; logout discoverability) |
| Auto-login after register | Task 1 |
| First admin via setup | Task 1–2 (unchanged setup) |
| No end-user LLM onboarding | Task 3 + `CAN_CHANGE_KEYS=false` |
| Land on Dashboard | Task 3 |
| Data isolation via `owner_id` | No schema change; smoke in Task 5 |
| Admin still manages users/providers | Untouched admin routes; smoke Task 5 |

## Follow-ups (separate plans later)

- Rate limits / quotas per user against self-hosted GPU
- Email verification
- Auth UI polish pass as part of full product redesign
- Harden register with CAPTCHA / edge rate limits (nginx)

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-multi-user-platform-auth.md`  
Spec: `docs/superpowers/specs/2026-08-24-multi-user-platform-auth.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
