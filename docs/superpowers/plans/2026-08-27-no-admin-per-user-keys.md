# No Admin + Per-User Provider Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the admin persona and first-run Setup; every signed-in user can save their own LLM/image/search keys, with process env as fallback until they save.

**Architecture:** Drop `is_superuser` / `admin_slot` and the `/api/v1/admin` router. Store overlays in `user_provider_settings`. Load the current user’s JSON into a ContextVar on each authenticated request. Provider `get_*_env()` helpers read overlay then `os.environ`. Next Settings always renders the existing provider UI (today it is admin-only).

**Tech Stack:** FastAPI, SQLAlchemy/SQLModel, Alembic, ContextVar, Next.js App Router, `node --test` contract tests.

**Spec:** `docs/superpowers/specs/2026-08-27-no-admin-per-user-keys-design.md`

## Global Constraints

- Do **not** commit unless the human explicitly asks in this session.
- Do **not** hide Admin UI; delete files, routes, and helpers listed in the spec Cleanup section.
- Do **not** copy env into a user row on register/login. GET returns effective (overlay ∪ env); PUT stores the submitted sanitized body as that user’s overlay.
- Do **not** write user overlays into process env or into singleton `provider_settings` id=1 (except `DISABLE_AUTH` local mode, which keeps singleton + file).
- Do **not** store `AUTH_*` or `DISABLE_ANONYMOUS_TRACKING` in the overlay.
- Do **not** keep `is_superuser` “for FastAPI Users”. Custom `User` + `VersionedJWTStrategy` only.
- Python tests from `servers/fastapi`: `uv run --locked python -m pytest <file> -v`. If the host has `DATABASE_URL` set (Windows pytest footgun), unset it for SQLite tmp tests.
- Next contract tests from `servers/nextjs`: `node --test tests/<file>.test.mjs`.
- Settings form layout/fields/validation copy stay; only who can open them and where keys persist change.

## Out of scope

- Self-service API-key **UI** (HTTP tokens become current-user scoped; no new screen)
- Copying singleton `provider_settings` id=1 into existing users
- Email verification, OAuth, billing
- Per-user PostHog / `DISABLE_ANONYMOUS_TRACKING`

## File map

| File | Role |
|------|------|
| `servers/fastapi/utils/provider_overlay.py` | ContextVar + `overlay_or_env` |
| `servers/fastapi/utils/get_env.py` | Provider getters use overlay |
| `servers/fastapi/models/sql/user_provider_settings.py` | Overlay table |
| `servers/fastapi/models/sql/user.py` | Drop `admin_slot`, `is_superuser` |
| `servers/fastapi/alembic/versions/e5a7c9d1f3b4_user_provider_settings.py` | Create table, drop columns |
| `servers/fastapi/migrations.py` | New `REVISION_HEAD` |
| `servers/fastapi/api/v1/settings/router.py` | `GET/PUT /api/v1/settings/provider` |
| `servers/fastapi/api/v1/auth/router.py` | Register on empty DB; delete setup; drop `role` |
| `servers/fastapi/api/v1/auth/bootstrap.py` | Normal user from env; rename function |
| `servers/fastapi/api/v1/admin/` | **Delete package** |
| `servers/nextjs/app/(presentation-generator)/(dashboard)/admin/` | **Delete** |
| `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/page.tsx` | Always `SettingPage` (not `UserAccountSettings`) |

---

### Task 1: Request-scoped provider overlay

**Files:**
- Create: `servers/fastapi/utils/provider_overlay.py`
- Modify: `servers/fastapi/utils/get_env.py`
- Test: `servers/fastapi/tests/unit/test_provider_overlay.py`

**Interfaces:**
- Consumes: `os.getenv`
- Produces:
  - `get_provider_overlay() -> dict[str, Any] | None`
  - `set_provider_overlay(config: dict[str, Any] | None) -> Token`
  - `reset_provider_overlay(token: Token) -> None`
  - `overlay_or_env(name: str) -> str | None` — overlay value if set and `str(value).strip() != ""`, else `os.getenv(name)`
  - ContextVar name: `gslide_provider_overlay`

Overlay **does** apply to these env names (and their `get_*_env` wrappers): `LLM`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GOOGLE_API_KEY`, `GOOGLE_MODEL`, `CUSTOM_LLM_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_MODEL`, `IMAGE_PROVIDER`, `DISABLE_IMAGE_GENERATION`, `DISABLE_THINKING`, `EXTENDED_REASONING`, `WEB_GROUNDING`, `WEB_SEARCH_PROVIDER`, `WEB_SEARCH_MAX_RESULTS`, `GPT_IMAGE_1_5_QUALITY`, `OPENAI_COMPAT_IMAGE_BASE_URL`, `OPENAI_COMPAT_IMAGE_API_KEY`, `OPENAI_COMPAT_IMAGE_MODEL`.

Overlay **must not** apply to: `CAN_CHANGE_KEYS`, `DATABASE_URL`, `APP_DATA_DIRECTORY`, `DISABLE_AUTH`, `SEARXNG_BASE_URL`, `ENABLE_PARALLEL_IMAGE_GENERATION`, `USER_CONFIG_PATH`.

- [ ] **Step 1: Write the failing test**

```python
import os

from utils.get_env import get_openai_api_key_env, get_can_change_keys_env
from utils.provider_overlay import (
    overlay_or_env,
    reset_provider_overlay,
    set_provider_overlay,
)


def test_overlay_wins_over_process_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-env")
    token = set_provider_overlay({"OPENAI_API_KEY": "sk-user"})
    try:
        assert get_openai_api_key_env() == "sk-user"
        assert overlay_or_env("OPENAI_API_KEY") == "sk-user"
    finally:
        reset_provider_overlay(token)
    assert get_openai_api_key_env() == "sk-env"


def test_blank_overlay_field_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-env")
    token = set_provider_overlay({"OPENAI_API_KEY": "  "})
    try:
        assert get_openai_api_key_env() == "sk-env"
    finally:
        reset_provider_overlay(token)


def test_can_change_keys_ignores_overlay(monkeypatch):
    monkeypatch.setenv("CAN_CHANGE_KEYS", "true")
    token = set_provider_overlay({"CAN_CHANGE_KEYS": "false"})
    try:
        assert get_can_change_keys_env() == "true"
    finally:
        reset_provider_overlay(token)
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `servers/fastapi`):

```bash
uv run --locked python -m pytest tests/unit/test_provider_overlay.py -v
```

Expected: FAIL (`ModuleNotFoundError: utils.provider_overlay` or overlay ignored).

- [ ] **Step 3: Implement**

`utils/provider_overlay.py`: ContextVar default `None`. `overlay_or_env` as specified.

`get_env.py`: each listed provider getter returns `overlay_or_env("NAME")` instead of `os.getenv("NAME")`. Keep `get_can_change_keys_env` as `os.getenv` only.

- [ ] **Step 4: Re-run tests**

Expected: PASS.

- [ ] **Step 5: Commit only if the human asked**

---

### Task 2: Schema — overlay table, drop admin columns

**Files:**
- Create: `servers/fastapi/models/sql/user_provider_settings.py`
- Create: `servers/fastapi/alembic/versions/e5a7c9d1f3b4_user_provider_settings.py`
- Modify: `servers/fastapi/models/sql/user.py` (remove `admin_slot` and `is_superuser` mapped columns)
- Modify: `servers/fastapi/migrations.py` — add `REVISION_USER_PROVIDER_SETTINGS = "e5a7c9d1f3b4"` and set `REVISION_HEAD` to it
- Modify: `servers/fastapi/tests/unit/test_migrations.py` — every assertion that `REVISION_HEAD == REVISION_SMART_MODE_BACKFILL`, `"admin_slot" in user_columns`, `"uq_user_admin_slot" in user_indexes`

**Interfaces:**
- Consumes: Alembic head `d2f4a6b8c0e1`
- Produces: table `user_provider_settings(user_id UUID PK FK user.id ON DELETE CASCADE, config JSON NOT NULL, updated_at DateTime timezone=True NOT NULL)`

SQLModel (match `ProviderSettings` JSON column style):

```python
class UserProviderSettings(SQLModel, table=True):
    __tablename__ = "user_provider_settings"
    user_id: uuid.UUID = Field(sa_column=Column(Uuid, ForeignKey("user.id", ondelete="CASCADE"), primary_key=True))
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(...)
```

Alembic `upgrade`: `create_table` if missing; `batch_alter_table("user")` drop index `uq_user_admin_slot` if present, drop columns `admin_slot` and `is_superuser` if present. `downgrade`: not required for tests (follow other recent migrations).

- [ ] **Step 1: Write failing migration assertions**

In `test_upgrade_from_baseline_stamp_skips_existing_theme_column` (and any other test that currently expects `admin_slot`):

```python
assert migrations.REVISION_HEAD == migrations.REVISION_USER_PROVIDER_SETTINGS
assert "admin_slot" not in user_columns
assert "is_superuser" not in user_columns
assert "user_provider_settings" in tables
```

Grep `test_migrations.py` for `REVISION_SMART_MODE_BACKFILL`, `admin_slot`, `uq_user_admin_slot` and update every occurrence that describes **head** schema. Do not rewrite historical Alembic files `c9f1a2b3d4e5` / `e1b3c5d7f9a2`.

- [ ] **Step 2: Run**

```bash
uv run --locked python -m pytest tests/unit/test_migrations.py -v
```

Expected: FAIL (`REVISION_USER_PROVIDER_SETTINGS` missing or head still `d2f4`).

- [ ] **Step 3: Implement model + migration + `REVISION_HEAD`**

- [ ] **Step 4: Re-run `test_migrations.py`**

Expected: PASS.

- [ ] **Step 5: Commit only if the human asked**

---

### Task 3: FastAPI auth without admin

**Files:**
- Modify: `servers/fastapi/api/v1/auth/router.py` — delete `setup_credentials`; allow `register` when count is 0; login 428 copy without `setup_required`; `/status` and `/verify` omit `role` and DISABLE_AUTH `"admin"`; `serialize_user` callers must not send `role`
- Modify: `servers/fastapi/api/v1/auth/users.py` — delete `get_current_admin`; `serialize_user` without `role`
- Modify: `servers/fastapi/api/v1/auth/schemas.py` — delete `PublicUser.role`, `AdminCreateUserRequest`, `AdminResetPasswordRequest`
- Modify: `servers/fastapi/api/v1/auth/principal.py` — `AuthPrincipal` without `is_admin`; Bearer: active user only (delete `not user.is_superuser`); delete `require_browser_admin_principal`
- Modify: `servers/fastapi/api/v1/auth/context.py` — delete `*_is_admin` ContextVar and helpers
- Modify: `servers/fastapi/api/v1/auth/assets.py` — `is_app_data_path_authorized(..., user_id)` only; legacy non-`users/` private paths return `False`
- Modify: `servers/fastapi/api/v1/auth/token.py` — `Depends(get_current_user)`; scope tokens to that `user.id`
- Modify: `servers/fastapi/api/v1/auth/bootstrap.py` — rename `bootstrap_database_admin` → `bootstrap_database_user`; find/create by `AUTH_USERNAME`, never `is_superuser` / `admin_slot`; rename `persist_admin_credentials` usage to `persist_auth_credentials` in `config.py` (same AUTH_* file fields)
- Modify: `servers/fastapi/api/v1/auth/config.py` — rename `persist_admin_credentials` → `persist_auth_credentials`; `get_legacy_admin_credentials` may stay as reading AUTH_* from file (or rename to `get_legacy_auth_credentials`)
- Modify: `servers/fastapi/api/middlewares.py` — delete `admin_only` block; delete is_admin context; 428 JSON **without** `setup_required`; still public: status, verify, login, logout, register (no setup)
- Modify: `servers/fastapi/api/lifespan.py` — call renamed bootstrap
- Modify: `servers/fastapi/utils/asset_directory_utils.py` — stop passing `is_admin`
- Delete: `servers/fastapi/api/v1/admin/router.py` (and the `admin` package)
- Modify: `servers/fastapi/api/main.py` — remove admin router include
- Modify: `servers/fastapi/tests/integration/test_auth_endpoints.py` — `_build_client` must not import admin router; create `UserProviderSettings` table; replace every `POST /setup` with `POST /register`; assert no `role` in JSON; add tests below
- Modify: `servers/fastapi/tests/unit/test_auth_bootstrap.py`, `test_owner_isolation.py`, `test_internal_auth_headers.py`, `test_session_identity.py` (`_CURRENT_OWNER_IS_ADMIN` gone), `test_asset_ownership_security.py` (drop `is_admin=True` cases that allowed legacy roots; those paths are denied)

**Interfaces:**
- Consumes: Task 2 `User` without superuser columns
- Produces: `POST /api/v1/auth/register` allowed on empty DB; `POST /api/v1/auth/setup` 404; `serialize_user` → `{id, username, created_at}`

- [ ] **Step 1: Write / rewrite failing tests first** in `test_auth_endpoints.py`

```python
def test_register_allowed_when_instance_empty(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["configured"] is True
    assert payload["authenticated"] is True
    assert payload["username"] == "alice"
    assert "role" not in payload
    assert SESSION_COOKIE_NAME in response.cookies
    asyncio.run(engine.dispose())


def test_setup_endpoint_removed(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    client, engine = _build_client(tmp_path)
    response = client.post(
        "/api/v1/auth/setup",
        json={"username": "alice", "password": "secret123"},
    )
    assert response.status_code == 404
    asyncio.run(engine.dispose())


def test_login_on_empty_db_is_428_without_setup_flag(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    client, engine = _build_client(tmp_path)
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "secret123"},
    )
    assert response.status_code == 428
    body = response.json()
    assert "setup_required" not in body
    asyncio.run(engine.dispose())


def test_admin_router_gone(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    client, engine = _build_client(tmp_path)
    assert client.get("/api/v1/admin/users").status_code == 404
    asyncio.run(engine.dispose())
```

Replace existing tests that seed via `/setup` with `/register`. Token/Bearer tests must register a user then create a token as that user (after Task 3 token routes use `get_current_user`). If token tests still need the token router, include it via `API_V1_AUTH_ROUTER` (already includes `TOKEN_ROUTER`).

- [ ] **Step 2: Run**

```bash
uv run --locked python -m pytest tests/integration/test_auth_endpoints.py tests/unit/test_auth_bootstrap.py tests/unit/test_session_identity.py tests/unit/test_asset_ownership_security.py -v
```

Expected: FAIL (setup still 200, `is_superuser` on User, admin router present).

- [ ] **Step 3: Implement deletions and register-on-empty**

`register`: delete the `if not await _account_count(session): raise 428` block.

User constructors: drop `is_superuser=...` and `admin_slot=...`.

`is_app_data_path_authorized`: remove `is_admin` kwarg; last line of legacy root → `return False`.

- [ ] **Step 4: Re-run the pytest command in Step 2**

Expected: PASS. Also run `tests/unit/test_internal_auth_headers.py` `tests/unit/test_owner_isolation.py`.

- [ ] **Step 5: Commit only if the human asked**

---

### Task 4: Per-user settings HTTP + middleware overlay

**Files:**
- Create: `servers/fastapi/api/v1/settings/router.py` (`API_V1_SETTINGS_ROUTER`, prefix `/api/v1/settings`)
- Modify: `servers/fastapi/api/main.py` — include settings router
- Modify: `servers/fastapi/services/provider_settings.py` — add `async def get_user_provider_overlay(session, user_id) -> dict` and `async def save_user_provider_overlay(session, user_id, incoming) -> dict` using `sanitize_provider_settings` / `merge_provider_settings`; **strip** `DISABLE_ANONYMOUS_TRACKING` from overlay; GET effective = `fill_unset_from_runtime(overlay)` (uses process env / `get_user_config()`, not another user)
- Modify: `servers/fastapi/api/middlewares.py` — delete `UserConfigEnvUpdateMiddleware` class **or** make `dispatch` a no-op pass-through; in `SessionAuthMiddleware` after `set_current_owner_id`, load overlay row and `set_provider_overlay(config)`; reset in `finally`
- Modify: `servers/fastapi/api/main.py` (or wherever middleware is added) — if `UserConfigEnvUpdateMiddleware` is registered, remove the registration so it cannot mutate env per request
- Keep: lifespan `update_env_with_user_config()` **once** at boot when `CAN_CHANGE_KEYS != "false"` (legacy singleton → env)
- `DISABLE_AUTH`: settings GET/PUT use existing singleton `get_provider_settings` / `save_provider_settings` (no overlay row)
- Test: `servers/fastapi/tests/unit/test_user_provider_settings.py` and extend `test_auth_endpoints.py` (include settings router + overlay table in `_build_client`)

**Interfaces:**
- Consumes: Task 1 overlay ContextVar; Task 2 `UserProviderSettings`; Task 3 `get_current_user` / DISABLE_AUTH
- Produces:
  - `GET /api/v1/settings/provider` → sanitized effective dict, 401 if auth on and no user
  - `PUT /api/v1/settings/provider` → persist overlay, 403 if `CAN_CHANGE_KEYS == "false"`, **must not** call `update_env_with_user_config()`

Example PUT handler (auth enabled):

```python
@API_V1_SETTINGS_ROUTER.put("/provider")
async def update_provider(
    config: dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, Any]:
    if get_can_change_keys_env() == "false":
        raise HTTPException(status_code=403, detail="You are not allowed to access this resource")
    return await save_user_provider_overlay(session, user.id, config)
```

When `is_disable_auth_enabled()`, skip `get_current_user` and call singleton save/get.

Isolation unit test (no HTTP):

```python
def test_two_overlays_do_not_leak(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-env")
    token_a = set_provider_overlay({"OPENAI_API_KEY": "sk-a"})
    try:
        assert get_openai_api_key_env() == "sk-a"
    finally:
        reset_provider_overlay(token_a)
    token_b = set_provider_overlay({})
    try:
        assert get_openai_api_key_env() == "sk-env"
    finally:
        reset_provider_overlay(token_b)
```

HTTP isolation: register alice, PUT `{LLM, OPENAI_API_KEY: sk-a}`; register bob (second client); GET as bob must not contain `sk-a`. Use two `TestClient` cookies.

- [ ] **Step 1: Write failing tests** (`test_user_provider_settings.py` + auth integration GET/PUT)

- [ ] **Step 2: Run pytest on those files — expect FAIL (404 on `/api/v1/settings/provider`)**

- [ ] **Step 3: Implement router, overlay load in middleware, remove per-request env middleware**

Grep `UserConfigEnvUpdateMiddleware` and remove add_middleware.

- [ ] **Step 4: Re-run tests — expect PASS**

Also run `tests/unit/test_provider_settings.py` so singleton DISABLE_AUTH path still works.

- [ ] **Step 5: Commit only if the human asked**

---

### Task 5: Next — AuthGate, Settings for every user, delete Admin

**Files:**
- Modify: `servers/nextjs/components/Auth/AuthGate.tsx` — delete `setup` mode (`Create your admin login`, `Create admin`, `/api/v1/auth/setup`). Empty instance uses login/register toggle like today when `configured=true`.
- Modify: `servers/nextjs/proxy.ts` — 428 body without `setup_required` if present
- Modify: `servers/nextjs/app/api/can-change-keys/route.ts` — `canChange: (isAuthDisabled() || status.authenticated) && canChangeKeys` (import `isAuthDisabled` from `@/utils/auth`). **Delete** `status.role === "admin"`.
- Modify: `servers/nextjs/app/api/user-config/route.ts` — replace `requireAdminApi` with authenticated check (`authStatusForRequest`: 401 if not `isAuthDisabled()` and not `authenticated`); forward to `/api/v1/settings/provider`
- Modify: `servers/nextjs/lib/server-auth-role.ts` — delete `requireAdminApi`; delete `role` from `ServerAuthStatus` if unused
- Modify: `servers/nextjs/utils/serverAuth.ts` — delete `role`, `requireAdminSession`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/page.tsx` — **always** render `SettingPage` (this is what currently hides provider settings from non-admins)
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingSideBar.tsx` — delete `admin` section
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx` — delete AdminPanel import/render; `showSave` always true for provider sections
- Delete: `servers/nextjs/app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx`
- Delete: `servers/nextjs/app/(presentation-generator)/(dashboard)/admin/page.tsx`
- Delete: `servers/nextjs/utils/settingsAccess.ts` if unused
- Delete: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/UserAccountSettings.tsx` if `page.tsx` no longer imports it (`SettingPage` already has Sign out)
- Modify: `servers/nextjs/lib/readable-local-file.ts` — drop `isAdmin` / `legacyAdminRoots`
- Modify: `servers/nextjs/app/api/read-file/route.ts` and `app/api/export-presentation/file/route.ts` — stop passing `isAdmin`
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx` — replace administrator copy with operator/env wording
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs` — drop AdminPanel / UserAccountSettings path assertions if those files are gone
- Create: `servers/nextjs/tests/no-admin-per-user-keys.test.mjs`

**Interfaces:**
- Consumes: Task 4 `/api/v1/settings/provider`
- Produces: any authenticated user with `CAN_CHANGE_KEYS !== "false"` sees provider Settings

Contract test file:

```javascript
test("AuthGate has no admin setup mode", async () => {
  const source = await readNext("components/Auth/AuthGate.tsx");
  assert.doesNotMatch(source, /Create your admin login/);
  assert.doesNotMatch(source, /\/api\/v1\/auth\/setup/);
  assert.match(source, /\/api\/v1\/auth\/register/);
});

test("can-change-keys is authenticated not admin", async () => {
  const source = await readNext("app/api/can-change-keys/route.ts");
  assert.match(source, /status\.authenticated/);
  assert.doesNotMatch(source, /role === ["']admin["']/);
});

test("settings page is not admin-gated", async () => {
  const page = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/page.tsx",
  );
  assert.match(page, /SettingPage/);
  assert.doesNotMatch(page, /getSettingsView/);
  assert.doesNotMatch(page, /UserAccountSettings/);
});

test("admin UI and requireAdmin helpers are gone", async () => {
  await assert.rejects(
    () => access(path.join(nextRoot, "app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx")),
    (e) => e && e.code === "ENOENT",
  );
  const userConfig = await readNext("app/api/user-config/route.ts");
  assert.match(userConfig, /\/api\/v1\/settings\/provider/);
  assert.doesNotMatch(userConfig, /requireAdminApi/);
  const sidebar = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/SettingSideBar.tsx",
  );
  assert.doesNotMatch(sidebar, /id: "admin"/);
});
```

- [ ] **Step 1: Write `tests/no-admin-per-user-keys.test.mjs` and run**

```bash
node --test tests/no-admin-per-user-keys.test.mjs
```

Working directory: `servers/nextjs`. Expected: FAIL.

- [ ] **Step 2: Implement UI/API deletions and `settings/page.tsx` always `SettingPage`**

- [ ] **Step 3: Re-run contract test + `node --test tests/gslide-ui-kit.test.mjs tests/posthog-error-reporting.test.mjs`**

Expected: PASS.

- [ ] **Step 4: Commit only if the human asked**

---

### Task 6: Docs and copy

**Files:**
- Modify: `.env.example` — first visit is register; remove “Platform multi-user = CAN_CHANGE_KEYS=false + admin configures LLM” as recommended Gapo posture; `AUTH_USERNAME`/`AUTH_PASSWORD` seed a normal user
- Modify: `README.md`, `setup-presonton.md` — no “tạo tài khoản admin”
- Modify: `docs/architecture/00-overview.md`, `02-level-servers.md`, `03-level-fastapi.md`, `04-level-nextjs.md` only where they still say admin setup / `proxy.ts` + first admin
- Modify: `docs/superpowers/specs/2026-08-24-multi-user-platform-auth.md` — add a one-line banner at top: **Superseded for admin/BYOK by `2026-08-27-no-admin-per-user-keys-design.md`** (do not rewrite the whole old spec)

- [ ] **Step 1: Grep the repo for user-facing admin-setup strings**

```bash
rg -n "Create admin|tài khoản admin|is_superuser|AdminPanel|/api/v1/admin" --glob '!**/alembic/versions/**' --glob '!**/.next/**'
```

Fix remaining product docs and code hits. Historical Alembic SQL is allowed to still mention `is_superuser`.

- [ ] **Step 2: Manual smoke (when stack is up)**

1. Fresh-ish auth: `/` shows Sign in / Create account, not Create admin.
2. Register alice → Settings (Text/Image/Search) → save keys.
3. Incognito bob → Settings does not show alice’s key; dashboards isolated.
4. No Admin tab; `/admin` 404.

- [ ] **Step 3: Commit only if the human asked**

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Register on empty; delete setup UI/API | 3, 5 |
| Drop `is_superuser` / `admin_slot` | 2, 3 |
| Delete `/api/v1/admin` and Admin UI | 3, 5 |
| `user_provider_settings` + GET/PUT `/settings/provider` | 2, 4 |
| Overlay then env; no per-request `os.environ` mutation | 1, 4 |
| Boot singleton → env once | 4 (keep lifespan) |
| `CAN_CHANGE_KEYS` any authenticated user | 4, 5 (`can-change-keys` + `settings/page.tsx`) |
| `DISABLE_AUTH` singleton | 4 |
| Tokens current-user; Bearer without superuser | 3 |
| Delete `role` / `is_admin` | 3, 5 |
| Docs | 6 |
| Isolation test | 1, 4 |
