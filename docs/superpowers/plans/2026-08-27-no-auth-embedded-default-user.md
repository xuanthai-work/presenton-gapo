# No Auth UI + Default-On Single Demo User — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all login/register/logout UI from gslide and auto-seed a single demo user at server startup. Every request resolves to the demo user. Data ownership shape (`owner_id`, `app_data/users/<id>/`) is preserved exactly as set up by `2026-08-27-no-admin-per-user-keys`. Single extension point (`resolve_request_principal`) is reserved for the future parent Gapo app handshake.

**Architecture:** Demo user is fixed (`00000000-0000-0000-0000-000000000001`, username `demo`, random password, `auth_version=1`). `resolve_request_principal` keeps cookie + Bearer `sk-gslide-*` paths for direct curl/programmatic access, then falls back to the demo principal. `/auth/login`, `/auth/register`, `/auth/logout` return 410 Gone. Auth UI pages/components deleted. One commit on `main` (not pushed).

**Tech Stack:** FastAPI (Python 3.x, SQLAlchemy async, pytest, pytest-asyncio), Next.js (App Router, TS, node:test), existing per-user overlay (`utils/provider_overlay.py`, `user_provider_settings` table).

**Spec:** `docs/superpowers/specs/2026-08-27-no-auth-embedded-default-user-design.md`

## Global Constraints

- **Demo user identity (locked):** UUID `00000000-0000-0000-0000-000000000001`, username `demo`, random 32-byte password on first create (logged once INFO), `auth_version=1`.
- **`resolve_request_principal` order:** cookie → Bearer `sk-gslide-*`/`sk-presenton-*` → demo fallback. Future parent-app path inserts ABOVE cookie path.
- **Remove:** `app/auth/page.tsx`, `app/auth/` directory, `components/Auth/AuthGate.tsx`, `components/Auth/LogoutButton.tsx`, FastAPI `POST /api/v1/auth/login|register|logout` (return 410 Gone).
- **Keep unchanged:** `OnboardingMode`, `FinalStep`, `_backfill_legacy_ownership` signature, `DISABLE_AUTH` mode, `provider_settings` singleton, cookie name constants, `SessionAuthMiddleware`'s `/app_data/*` gate.
- **No DB migration.** No new env vars added to `.env.example` (the `DEMO_AUTH_FROM_ENV` escape hatch is documented but optional and off by default).
- **Rollout:** 1 commit on `main`, branch not pushed. Out-of-scope WIP (settings/Switch/GSlideHeader) stays untouched.
- **Out of scope:** JWT verifier from parent app, CORS changes, cookie `Domain=`, iframe framing headers, T6 docs/copy cleanup from `no-admin-per-user-keys`.

## File Structure

### Create
- `servers/fastapi/api/v1/auth/demo_user.py` — exports `DEMO_USER_ID`, `DEMO_USERNAME`, `get_demo_principal()`, `resolve_demo_user(session)`.
- `servers/fastapi/tests/unit/test_default_user_principal.py` — principal fallback tests.
- `servers/fastapi/tests/unit/test_demo_user_idempotent.py` — bootstrap idempotency.
- `servers/fastapi/tests/unit/test_auth_endpoints_removed.py` — 410 Gone assertions.
- `servers/nextjs/tests/no-auth-embedded-default-user.test.mjs` — UI deletion + API route-removal assertions.

### Modify
- `servers/fastapi/api/v1/auth/bootstrap.py` — rewrite `bootstrap_database_user` to upsert demo user.
- `servers/fastapi/api/v1/auth/principal.py` — add demo fallback in `resolve_request_principal`.
- `servers/fastapi/api/v1/auth/router.py` — replace `/login`, `/register`, `/logout` with `410 Gone`; keep `/status`, `/verify`.
- `servers/fastapi/api/middlewares.py` — remove `login/logout/register` from `_PUBLIC_AUTH_PATHS` (they 410 now); keep `_PUBLIC_AUTH_PATHS` only for `status`, `verify`.
- `servers/nextjs/app/page.tsx` — redirect `/` → `/dashboard`.
- `servers/nextjs/proxy.ts` — drop `login/logout/register` from `isApiAuthExempt`; gate by demo status (which is now always `authenticated: true`).
- `servers/nextjs/utils/serverAuth.ts` — `requireAppSession()` becomes pass-through.
- `servers/nextjs/utils/auth.ts` — keep `isAuthDisabled` for `DISABLE_AUTH` mode (unchanged).
- `servers/nextjs/lib/server-auth-role.ts` — `requireAuthenticatedApi` becomes pass-through.
- `servers/nextjs/app/api/can-change-keys/route.ts` — returns `{ canChange: canChangeKeysEnv }` unconditionally.
- `servers/nextjs/app/(presentation-generator)/layout.tsx` — drop `await requireAppSession()`.
- `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx` — remove `LogoutButton` import + render; drop `can_change_keys` redirect.
- `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingSideBar.tsx` — keep structure (already has no Sign out section per spec).
- `servers/nextjs/app/api/user-config/route.ts` — drop `requireAuthenticatedApi` calls.

### Delete
- `servers/nextjs/app/auth/page.tsx`
- `servers/nextjs/app/auth/` (empty dir after page removal)
- `servers/nextjs/components/Auth/AuthGate.tsx`
- `servers/nextjs/components/Auth/LogoutButton.tsx`
- `servers/nextjs/components/Auth/` (empty dir)

---

## Task 1: FastAPI — Demo user module + constant

**Files:**
- Create: `servers/fastapi/api/v1/auth/demo_user.py`
- Test: `servers/fastapi/tests/unit/test_default_user_principal.py`

**Interfaces:**
- `DEMO_USER_ID: uuid.UUID` — fixed UUID `00000000-0000-0000-0000-000000000001`.
- `DEMO_USERNAME: str` — `"demo"`.
- `async def resolve_demo_user(session: AsyncSession) -> User` — returns the demo `User`, creating it with random password if missing.
- `def get_demo_principal() -> AuthPrincipal` — returns cached `AuthPrincipal(method="default", user_id=DEMO_USER_ID, username=DEMO_USERNAME)`.

- [ ] **Step 1: Write the failing test**

Create `servers/fastapi/tests/unit/test_default_user_principal.py`:

```python
import asyncio
import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.demo_user import (
    DEMO_USER_ID,
    DEMO_USERNAME,
    get_demo_principal,
    resolve_demo_user,
)
from models.sql.access_token import AccessToken
from models.sql.user import User


def _make_engine(database_path):
    return create_async_engine(f"sqlite+aiosqlite:///{database_path}")


async def _bootstrap_schema(engine):
    async with engine.begin() as conn:
        await conn.run_sync(User.__table__.create)
        await conn.run_sync(AccessToken.__table__.create)


@pytest.mark.asyncio
async def test_demo_user_constants_are_locked():
    assert DEMO_USER_ID == uuid.UUID("00000000-0000-0000-0000-000000000001")
    assert DEMO_USERNAME == "demo"


@pytest.mark.asyncio
async def test_resolve_demo_user_seeds_when_missing(tmp_path):
    engine = _make_engine(tmp_path / "demo.db")
    await _bootstrap_schema(engine)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with session_maker() as session:
        user = await resolve_demo_user(session)

    assert user.id == DEMO_USER_ID
    assert user.username == DEMO_USERNAME
    assert user.is_active is True
    assert user.auth_version == 1
    assert user.hashed_password  # non-empty


@pytest.mark.asyncio
async def test_resolve_demo_user_is_idempotent(tmp_path):
    engine = _make_engine(tmp_path / "demo.db")
    await _bootstrap_schema(engine)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with session_maker() as session:
        first = await resolve_demo_user(session)
        first_hash = first.hashed_password
    async with session_maker() as session:
        second = await resolve_demo_user(session)

    assert second.id == first.id
    assert second.hashed_password == first_hash  # not re-randomized


@pytest.mark.asyncio
async def test_get_demo_principal_shape():
    principal = get_demo_principal()
    assert principal.user_id == DEMO_USER_ID
    assert principal.username == DEMO_USERNAME
    assert principal.method == "default"
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd servers/fastapi && pytest tests/unit/test_default_user_principal.py -v`
Expected: collection error or import error (`api.v1.auth.demo_user` does not exist yet).

- [ ] **Step 3: Implement demo_user.py**

Create `servers/fastapi/api/v1/auth/demo_user.py`:

```python
import logging
import secrets
import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.users import PASSWORD_HELPER
from models.sql.user import User


logger = logging.getLogger(__name__)


DEMO_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEMO_USERNAME = "demo"


@dataclass(frozen=True)
class DemoPrincipal:
    user_id: uuid.UUID
    username: str
    method: Literal["default"]


_DEMO_PRINCIPAL = DemoPrincipal(
    user_id=DEMO_USER_ID,
    username=DEMO_USERNAME,
    method="default",
)


def get_demo_principal() -> DemoPrincipal:
    return _DEMO_PRINCIPAL


def _new_random_password() -> str:
    # 32-byte URL-safe token; logged once on first create. Operators can paste it
    # into their curl scripts if they need Bearer-over-password later. For the
    # default-on demo path this is never used by the UI.
    return secrets.token_urlsafe(32)


async def resolve_demo_user(session: AsyncSession) -> User:
    """Return the demo user, creating it on first call.

    Idempotent: a second call returns the same row with the same hashed_password.
    The fixed UUID guarantees no duplicate inserts across restarts.
    """
    existing = await session.get(User, DEMO_USER_ID)
    if existing is not None:
        return existing

    user = User(
        id=DEMO_USER_ID,
        username=DEMO_USERNAME,
        hashed_password=PASSWORD_HELPER.hash(_new_random_password()),
        is_active=True,
        is_verified=True,
        auth_version=1,
    )
    session.add(user)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        # Race: another worker inserted between get() and commit. Re-fetch.
        existing = await session.get(User, DEMO_USER_ID)
        if existing is None:
            raise
        return existing
    await session.refresh(user)
    logger.info(
        "[demo-user] auto-created (id=%s, username=%s)",
        DEMO_USER_ID,
        DEMO_USERNAME,
    )
    return user
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd servers/fastapi && pytest tests/unit/test_default_user_principal.py -v`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/fastapi/api/v1/auth/demo_user.py \
        servers/fastapi/tests/unit/test_default_user_principal.py
git commit -m "feat(fastapi): add demo_user module with fixed UUID + idempotent seed"
```

---

## Task 2: FastAPI — `resolve_request_principal` demo fallback

**Files:**
- Modify: `servers/fastapi/api/v1/auth/principal.py:1-80` (add fallback after cookie/Bearer paths)
- Test: append to `servers/fastapi/tests/unit/test_default_user_principal.py`

**Interfaces:**
- `resolve_request_principal(request, session) -> tuple[AuthPrincipal | None, User | None]` — unchanged signature; new behavior: when both cookie and Bearer paths return `None`, fall back to demo principal.

- [ ] **Step 1: Append failing tests to existing test file**

Append to `servers/fastapi/tests/unit/test_default_user_principal.py`:

```python
from api.v1.auth.demo_user import resolve_demo_user
from api.v1.auth.principal import resolve_request_principal


@pytest.mark.asyncio
async def test_resolve_request_principal_returns_demo_when_no_cookie_no_bearer(tmp_path):
    engine = _make_engine(tmp_path / "demo.db")
    await _bootstrap_schema(engine)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with session_maker() as session:
        await resolve_demo_user(session)

    class _StubRequest:
        cookies: dict = {}
        headers: dict = {}

    async with session_maker() as session:
        principal, user = await resolve_request_principal(_StubRequest(), session)

    assert principal is not None
    assert principal.user_id == DEMO_USER_ID
    assert principal.method == "default"
    assert user is not None
    assert user.username == DEMO_USERNAME


@pytest.mark.asyncio
async def test_resolve_request_principal_demo_seeds_when_db_empty(tmp_path):
    engine = _make_engine(tmp_path / "demo.db")
    await _bootstrap_schema(engine)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    class _StubRequest:
        cookies: dict = {}
        headers: dict = {}

    async with session_maker() as session:
        principal, user = await resolve_request_principal(_StubRequest(), session)

    assert principal is not None
    assert user is not None
    assert user.username == DEMO_USERNAME
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd servers/fastapi && pytest tests/unit/test_default_user_principal.py -v -k "resolve_request_principal"`
Expected: 2 new tests fail (TypeError or "None returned" — fallback not implemented yet).

- [ ] **Step 3: Add demo fallback to `resolve_request_principal`**

Edit `servers/fastapi/api/v1/auth/principal.py`. Replace the final `return None, None` (currently around line 60, after the Bearer branch) with:

```python
    # Future parent Gapo app handshake inserts ABOVE this point.

    # Default-on fallback: the demo user is auto-seeded by bootstrap_database_user
    # in lifespan. resolve_demo_user is idempotent so this is safe to call per request.
    demo_user = await resolve_demo_user(session)
    return (
        AuthPrincipal(
            user_id=demo_user.id,
            username=demo_user.username,
            method="default",
        ),
        demo_user,
    )
```

Add this import at the top of `principal.py` (below existing imports):

```python
from api.v1.auth.demo_user import resolve_demo_user
```

Note: the existing `AuthPrincipal` dataclass declares `method: Literal["jwt", "api_key"]`. We need to extend it to include `"default"`:

Edit `principal.py` line 15 area:

```python
@dataclass(frozen=True)
class AuthPrincipal:
    user_id: uuid.UUID
    username: str
    method: Literal["jwt", "api_key", "default"]
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd servers/fastapi && pytest tests/unit/test_default_user_principal.py -v`
Expected: 6 tests pass (4 from Task 1 + 2 new).

- [ ] **Step 5: Run session_identity tests to verify no regression**

Run: `cd servers/fastapi && pytest tests/unit/test_session_identity.py -v`
Expected: all pass (cookie/Bearer paths unchanged).

- [ ] **Step 6: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/fastapi/api/v1/auth/principal.py \
        servers/fastapi/tests/unit/test_default_user_principal.py
git commit -m "feat(fastapi): resolve_request_principal falls back to demo user"
```

---

## Task 3: FastAPI — Bootstrap uses demo user

**Files:**
- Modify: `servers/fastapi/api/v1/auth/bootstrap.py:65-150` (replace `bootstrap_database_user` body)
- Test: `servers/fastapi/tests/unit/test_demo_user_idempotent.py`

**Interfaces:**
- `bootstrap_database_user()` — unchanged signature; new behavior: always upserts the demo user (`DEMO_USER_ID`, `DEMO_USERNAME`). Calls `_backfill_legacy_ownership` only on first successful seed (track via a check before vs after rowcount).

- [ ] **Step 1: Write the failing test**

Create `servers/fastapi/tests/unit/test_demo_user_idempotent.py`:

```python
import asyncio
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.bootstrap import bootstrap_database_user
from api.v1.auth.demo_user import DEMO_USER_ID, DEMO_USERNAME
from models.sql.access_token import AccessToken
from models.sql.key_value import KeyValueSqlModel
from models.sql.presentation import PresentationModel
from models.sql.user import User


def _make_engine(database_path):
    return create_async_engine(f"sqlite+aiosqlite:///{database_path}")


async def _bootstrap_schema(engine):
    async with engine.begin() as conn:
        await conn.run_sync(User.__table__.create)
        await conn.run_sync(AccessToken.__table__.create)
        await conn.run_sync(PresentationModel.__table__.create)
        await conn.run_sync(KeyValueSqlModel.__table__.create)


@pytest.mark.asyncio
async def test_bootstrap_creates_demo_user_when_db_empty(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path / "demo.db")
    await _bootstrap_schema(engine)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    # Replace the global session maker used by bootstrap.
    from services import database as database_module

    monkeypatch.setattr(database_module, "async_session_maker", session_maker)
    # Stub out file persistence (avoids touching userConfig.json).
    monkeypatch.setattr(
        "api.v1.auth.bootstrap.persist_auth_credentials",
        lambda username, password_hash: None,
    )
    # Reset env so the legacy AUTH_USERNAME path doesn't interfere.
    monkeypatch.delenv("AUTH_USERNAME", raising=False)
    monkeypatch.delenv("AUTH_PASSWORD", raising=False)

    await bootstrap_database_user()

    async with session_maker() as session:
        user = await session.get(User, DEMO_USER_ID)
    assert user is not None
    assert user.username == DEMO_USERNAME


@pytest.mark.asyncio
async def test_bootstrap_idempotent_on_restart(tmp_path, monkeypatch):
    engine = _make_engine(tmp_path / "demo.db")
    await _bootstrap_schema(engine)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    from services import database as database_module
    monkeypatch.setattr(database_module, "async_session_maker", session_maker)
    monkeypatch.setattr(
        "api.v1.auth.bootstrap.persist_auth_credentials",
        lambda username, password_hash: None,
    )
    monkeypatch.delenv("AUTH_USERNAME", raising=False)
    monkeypatch.delenv("AUTH_PASSWORD", raising=False)

    await bootstrap_database_user()
    async with session_maker() as session:
        first_hash = (await session.get(User, DEMO_USER_ID)).hashed_password

    await bootstrap_database_user()
    async with session_maker() as session:
        user_count = (await session.scalar(
            select(__import__("sqlalchemy").func.count()).select_from(User)
        ))
        second_hash = (await session.get(User, DEMO_USER_ID)).hashed_password

    assert user_count == 1
    assert second_hash == first_hash  # password NOT regenerated
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd servers/fastapi && pytest tests/unit/test_demo_user_idempotent.py -v`
Expected: 2 tests fail (current bootstrap reads `AUTH_USERNAME` from env and returns the wrong user).

- [ ] **Step 3: Rewrite `bootstrap_database_user`**

Replace the body of `bootstrap_database_user` in `servers/fastapi/api/v1/auth/bootstrap.py` (function starts at line 65). New body:

```python
async def bootstrap_database_user() -> None:
    """Upsert the demo user. Idempotent across restarts.

    Honors RESET_AUTH only when DEMO_AUTH_FROM_ENV=true (escape hatch for
    operators who want a non-default username/password sourced from env).
    """
    from api.v1.auth.demo_user import (
        DEMO_USER_ID,
        DEMO_USERNAME,
        resolve_demo_user,
    )

    env_from_file = _truthy(os.getenv("DEMO_AUTH_FROM_ENV"))
    env_username = (os.getenv("DEMO_USERNAME") or "").strip() or DEMO_USERNAME
    env_password = os.getenv("DEMO_PASSWORD")
    reset_requested = _truthy(os.getenv("RESET_AUTH"))
    if env_from_file:
        _validate_new_environment_username(env_username)
        if env_password is not None:
            _validate_new_environment_password(env_password)
        if (reset_requested or env_password is None) and not env_password:
            raise RuntimeError(
                "DEMO_AUTH_FROM_ENV with RESET_AUTH requires DEMO_PASSWORD"
            )

    async with async_session_maker() as session:
        existing = await session.get(User, DEMO_USER_ID)

        if existing is None:
            user = await resolve_demo_user(session)
            password_hash = user.hashed_password
        else:
            user = existing
            password_hash = (
                PASSWORD_HELPER.hash(env_password)
                if env_from_file and env_password is not None
                else user.hashed_password
            )
            if env_from_file and env_password is not None:
                user.hashed_password = password_hash
                user.username = env_username
                await session.commit()
                await session.refresh(user)

        if existing is None:
            await _backfill_legacy_ownership(session, user)
            persist_auth_credentials(user.username, password_hash)
            logger.info(
                "Migrated the demo user into the user database (backfill complete)."
            )
```

Notes:
- Imports for `DEMO_USER_ID`, `DEMO_USERNAME`, `resolve_demo_user` are local to avoid circular import (bootstrap already imports from `auth.users`, which is in the same package).
- `persist_auth_credentials` is called only on first seed (matches old behavior).
- `_backfill_legacy_ownership` runs only when `existing is None` (first seed).
- The `_truthy`, `_validate_new_environment_password`, `_validate_new_environment_username` helpers stay (still used by the env escape hatch).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd servers/fastapi && pytest tests/unit/test_demo_user_idempotent.py -v`
Expected: 2 tests pass.

- [ ] **Step 5: Run auth_bootstrap regression tests**

Run: `cd servers/fastapi && pytest tests/unit/test_auth_bootstrap.py -v`
Expected: existing tests still pass (most target the `RESET_AUTH` env path; that path is preserved for the escape hatch). If any fail because the function no longer reads `AUTH_USERNAME` directly, update the test to either set `DEMO_AUTH_FROM_ENV=true` alongside `DEMO_USERNAME`/`DEMO_PASSWORD`, or mark it as out-of-scope debt.

- [ ] **Step 6: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/fastapi/api/v1/auth/bootstrap.py \
        servers/fastapi/tests/unit/test_demo_user_idempotent.py
git commit -m "feat(fastapi): bootstrap seeds demo user (fixed UUID, idempotent)"
```

---

## Task 4: FastAPI — Remove login/register/logout endpoints (return 410)

**Files:**
- Modify: `servers/fastapi/api/v1/auth/router.py:137-260`
- Test: `servers/fastapi/tests/unit/test_auth_endpoints_removed.py`

**Interfaces:**
- `POST /api/v1/auth/login` → `410 Gone` `{"detail": "Login is no longer supported; gslide now ships as a miniweb inside the parent Gapo app."}`
- `POST /api/v1/auth/register` → `410 Gone` `{"detail": "Registration is no longer supported; gslide now ships as a miniweb inside the parent Gapo app."}`
- `POST /api/v1/auth/logout` → `410 Gone` `{"detail": "Logout is no longer supported; gslide now ships as a miniweb inside the parent Gapo app."}`
- `GET /api/v1/auth/status` and `GET /api/v1/auth/verify` — unchanged.

- [ ] **Step 1: Write the failing test**

Create `servers/fastapi/tests/unit/test_auth_endpoints_removed.py`:

```python
import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.router import API_V1_AUTH_ROUTER
from models.sql.access_token import AccessToken
from models.sql.provider_settings import ProviderSettings
from models.sql.user import User
from models.sql.user_provider_settings import UserProviderSettings


def _make_client(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'auth.db'}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def create_tables():
        async with engine.begin() as conn:
            await conn.run_sync(User.__table__.create)
            await conn.run_sync(AccessToken.__table__.create)
            await conn.run_sync(ProviderSettings.__table__.create)
            await conn.run_sync(UserProviderSettings.__table__.create)

    asyncio.run(create_tables())

    app = FastAPI()
    app.include_router(API_V1_AUTH_ROUTER)
    return TestClient(app)


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/login", {"username": "x", "password": "x12345678"}),
        ("post", "/register", {"username": "x", "password": "x12345678"}),
        ("post", "/logout", {}),
    ],
)
def test_removed_auth_endpoints_return_410(tmp_path, method, path, body):
    client = _make_client(tmp_path)
    response = getattr(client, method)(f"/{path}", json=body)
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]


def test_status_endpoint_still_works(tmp_path):
    client = _make_client(tmp_path)
    response = client.get("/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is True
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd servers/fastapi && pytest tests/unit/test_auth_endpoints_removed.py -v`
Expected: 4 tests fail with 401/422 (current behavior) instead of 410.

- [ ] **Step 3: Replace login/register/logout handlers**

Edit `servers/fastapi/api/v1/auth/router.py`. Replace the bodies of the three handlers (currently at lines 137, 188, 243) with the following:

```python
@API_V1_AUTH_ROUTER.post("/login", status_code=410)
async def login():
    raise HTTPException(
        status_code=410,
        detail="Login is no longer supported; gslide now ships as a miniweb inside the parent Gapo app.",
    )


@API_V1_AUTH_ROUTER.post("/register", status_code=410)
async def register():
    raise HTTPException(
        status_code=410,
        detail="Registration is no longer supported; gslide now ships as a miniweb inside the parent Gapo app.",
    )


@API_V1_AUTH_ROUTER.post("/logout", status_code=410)
async def logout():
    raise HTTPException(
        status_code=410,
        detail="Logout is no longer supported; gslide now ships as a miniweb inside the parent Gapo app.",
    )
```

Remove now-unused imports only if they are not referenced elsewhere in `router.py`. Keep `_set_login_cookie` if `register`/`login` callers use it elsewhere; otherwise remove. Keep `LoginCredentialsRequest`/`RegisterCredentialsRequest` if referenced by other tests; otherwise remove.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd servers/fastapi && pytest tests/unit/test_auth_endpoints_removed.py -v`
Expected: 4 tests pass (3 removed-endpoint + 1 status).

- [ ] **Step 5: Update `tests/integration/test_auth_endpoints.py`**

The integration test currently asserts `/login` returns 200. Update any test that POSTs `/login`, `/register`, or `/logout` to instead assert `410 Gone`. If the test also asserts cookie side-effects, drop those assertions.

Run: `cd servers/fastapi && pytest tests/integration/test_auth_endpoints.py -v`
Expected: all pass after edits (one test at a time).

- [ ] **Step 6: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/fastapi/api/v1/auth/router.py \
        servers/fastapi/tests/unit/test_auth_endpoints_removed.py \
        servers/fastapi/tests/integration/test_auth_endpoints.py
git commit -m "feat(fastapi): login/register/logout return 410 Gone"
```

---

## Task 5: FastAPI — Middleware `_PUBLIC_AUTH_PATHS` keeps login/register/logout

**Files:**
- Modify: `servers/fastapi/api/middlewares.py:42-49`

**Interfaces:**
- `_PUBLIC_AUTH_PATHS` — unchanged from current state. Login/register/logout stay public so the Next.js proxy can route traffic to them (they return 410, but the route must be reachable). Demo fallback path handles all other `/api/*`.

**Note:** The simplest correct state is to leave `_PUBLIC_AUTH_PATHS` as-is. The Next.js proxy still exempts `/api/v1/auth/*` (status, verify, login, register, logout) via `isApiAuthExempt` (Task 12 confirms this). Do not modify `_PUBLIC_AUTH_PATHS` in this plan.

- [ ] **Step 1: No code change**

`_PUBLIC_AUTH_PATHS` stays:

```python
    _PUBLIC_AUTH_PATHS = {
        "/api/v1/auth/status",
        "/api/v1/auth/verify",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/register",
    }
```

- [ ] **Step 2: Run session_auth_middleware tests (sanity)**

Run: `cd servers/fastapi && pytest tests/unit/test_session_auth_middleware.py -v`
Expected: pass (no change to middleware).

- [ ] **Step 3: No commit**

(No commit needed for this task; recorded as a no-op to make the dependency on Task 12 explicit.)

---

## Task 6: Next.js — Root landing redirects to `/dashboard`

**Files:**
- Modify: `servers/nextjs/app/page.tsx` (replace entire file)

**Interfaces:**
- `GET /` → 307 redirect to `/dashboard`.

- [ ] **Step 1: Replace `app/page.tsx`**

Replace the entire content of `servers/nextjs/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function LandingPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Run no-admin-per-user-keys regression test (sanity)**

Run: `cd servers/nextjs && node --test tests/no-admin-per-user-keys.test.mjs`
Expected: pass (the spec did not assert on `/`'s shape, so existing assertions still hold).

- [ ] **Step 3: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/nextjs/app/page.tsx
git commit -m "feat(nextjs): root / redirects to /dashboard"
```

---

## Task 7: Next.js — Delete `/auth` page + AuthGate + LogoutButton

**Files:**
- Delete: `servers/nextjs/app/auth/page.tsx`, `servers/nextjs/app/auth/` (dir), `servers/nextjs/components/Auth/AuthGate.tsx`, `servers/nextjs/components/Auth/LogoutButton.tsx`, `servers/nextjs/components/Auth/` (dir)
- Verify: any remaining imports of `@/components/Auth/AuthGate` or `@/components/Auth/LogoutButton`

- [ ] **Step 1: Grep for any remaining references to deleted files**

Run: `cd D:/work/Gapo/presenton && grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' -E "@/components/Auth|components/Auth|AuthGate|LogoutButton" servers/nextjs/app servers/nextjs/components servers/nextjs/lib servers/nextjs/utils servers/nextjs/tests`

Expected output before deletion:
- `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx` references `LogoutButton`.

If other references appear, remove them as part of this task. (The `SettingPage.tsx` removal is Task 10.)

- [ ] **Step 2: Remove the AuthGate import + render from `SettingPage.tsx`**

In `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx`:

- Delete line `import LogoutButton from "@/components/Auth/LogoutButton";`
- Delete the `<div className="flex items-center gap-2">` block (lines 218-242 area) that renders `<LogoutButton ...>...</LogoutButton>`. Replace with:

```tsx
        actions={
          <GSlideButton
            className="inline-flex items-center"
            onClick={handleSaveConfig}
            disabled={buttonState.isDisabled}
          >
            {buttonState.isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {buttonState.text}
              </span>
            ) : (
              buttonState.text
            )}
          </GSlideButton>
        }
```

- [ ] **Step 3: Delete the auth files**

Run:

```bash
cd D:/work/Gapo/presenton
rm servers/nextjs/app/auth/page.tsx
rmdir servers/nextjs/app/auth
rm servers/nextjs/components/Auth/AuthGate.tsx
rm servers/nextjs/components/Auth/LogoutButton.tsx
rmdir servers/nextjs/components/Auth
```

- [ ] **Step 4: Re-run grep to confirm no stragglers**

Run: `cd D:/work/Gapo/presenton && grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' -E "@/components/Auth|components/Auth|AuthGate|LogoutButton" servers/nextjs/app servers/nextjs/components servers/nextjs/lib servers/nextjs/utils servers/nextjs/tests`
Expected: zero matches.

- [ ] **Step 5: Type-check**

Run: `cd servers/nextjs && npx tsc --noEmit`
Expected: exit 0. (If a TypeScript error remains from a missed import, fix the importer.)

- [ ] **Step 6: Commit**

```bash
cd D:/work/Gapo/presenton
git add -A servers/nextjs/app servers/nextjs/components servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx
git commit -m "refactor(nextjs): remove /auth page, AuthGate, LogoutButton"
```

---

## Task 8: Next.js — Layout drops `requireAppSession`

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/layout.tsx`

**Interfaces:**
- Layout no longer awaits `requireAppSession()`; renders children unconditionally.

- [ ] **Step 1: Edit layout**

Edit `servers/nextjs/app/(presentation-generator)/layout.tsx`. Find the line `await requireAppSession()` (or its equivalent). Remove the call. The function may become `async function Layout({ children }) { return <>{children}</>; }` or stay non-async depending on existing siblings.

If other gating logic remains (e.g., `ConfigurationInitializer`), keep it. The change is only to drop the auth-gate.

- [ ] **Step 2: Type-check**

Run: `cd servers/nextjs && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/nextjs/app/\(presentation-generator\)/layout.tsx
git commit -m "refactor(nextjs): layout no longer awaits requireAppSession"
```

---

## Task 9: Next.js — serverAuth + server-auth-role become pass-throughs

**Files:**
- Modify: `servers/nextjs/utils/serverAuth.ts`
- Modify: `servers/nextjs/lib/server-auth-role.ts`

**Interfaces:**
- `getServerAuthStatus()` — returns `{ configured: true, authenticated: true, username: "demo", user_id: "<DEMO_UUID>", available: true }` without a network call when not `DISABLE_AUTH`. Keeps the network fallback for forward compat.
- `requireAppSession()` — becomes a no-op.
- `authStatusForRequest(request)` — same shape as today but always returns authenticated (so callers behave identically).
- `requireAuthenticatedApi(request)` — always returns `null` (no denial).

- [ ] **Step 1: Edit `utils/serverAuth.ts`**

Replace the `getServerAuthStatus` function body (lines 36-69 area) so that when `isAuthDisabled()` is false, it short-circuits to:

```typescript
    return {
      configured: true,
      authenticated: true,
      username: "demo",
      user_id: "00000000-0000-0000-0000-000000000001",
      available: true,
    };
```

Replace `requireAppSession()` body to be `return;`.

- [ ] **Step 2: Edit `lib/server-auth-role.ts`**

Replace `authStatusForRequest(request)` body so that when not in `DISABLE_AUTH` mode, it returns:

```typescript
    return {
      configured: true,
      authenticated: true,
      username: "demo",
      user_id: "00000000-0000-0000-0000-000000000001",
    };
```

Replace `requireAuthenticatedApi(request)` body to `return null;`.

- [ ] **Step 3: Type-check**

Run: `cd servers/nextjs && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/nextjs/utils/serverAuth.ts servers/nextjs/lib/server-auth-role.ts
git commit -m "refactor(nextjs): serverAuth helpers return demo status, gates pass through"
```

---

## Task 10: Next.js — `/api/can-change-keys` always allows

**Files:**
- Modify: `servers/nextjs/app/api/can-change-keys/route.ts`

**Interfaces:**
- `GET /api/can-change-keys` → `{ canChange: <CAN_CHANGE_KEYS !== "false"> }`. No auth call.

- [ ] **Step 1: Replace file**

Replace the entire content of `servers/nextjs/app/api/can-change-keys/route.ts` with:

```typescript
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const canChangeKeys = process.env.CAN_CHANGE_KEYS !== "false";

export async function GET() {
  return NextResponse.json({ canChange: canChangeKeys });
}
```

- [ ] **Step 2: Drop the `can_change_keys` redirect in `SettingPage.tsx`**

In `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx`:

- Find the `useEffect` + early return block (lines 119-127 area) and delete it:

```tsx
  useEffect(() => {
    if (!canChangeKeys) {
      router.push("/dashboard");
    }
  }, [canChangeKeys, router]);

  if (!canChangeKeys) {
    return null;
  }
```

- If the `canChangeKeys` state was loaded via `useState`, remove the state + the `useEffect` that fetches it (search for `canChangeKeys` in the file). Replace any reference to `canChangeKeys` with `const canChangeKeys = true;` if still needed, or remove if no longer used.

- Remove `useRouter` import if no longer used elsewhere in the file. Verify with `grep -n useRouter servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx`.

- [ ] **Step 3: Type-check**

Run: `cd servers/nextjs && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/nextjs/app/api/can-change-keys/route.ts \
        servers/nextjs/app/\(presentation-generator\)/\(dashboard\)/settings/SettingPage.tsx
git commit -m "refactor(nextjs): can-change-keys returns env flag; drop redirect in Settings"
```

---

## Task 11: Next.js — `/api/user-config` drops auth gate

**Files:**
- Modify: `servers/nextjs/app/api/user-config/route.ts`

**Interfaces:**
- `GET /api/user-config` and `POST /api/user-config` — drop `requireAuthenticatedApi` calls. Forward directly to FastAPI. Keep `CAN_CHANGE_KEYS` checks.

- [ ] **Step 1: Remove `requireAuthenticatedApi` calls**

In `servers/nextjs/app/api/user-config/route.ts`:

- Delete the line `import { requireAuthenticatedApi } from "@/lib/server-auth-role";`
- Delete the lines `const denied = await requireAuthenticatedApi(request);` and `if (denied) return denied;` in both `GET` and `POST`.

- [ ] **Step 2: Type-check**

Run: `cd servers/nextjs && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd D:/work/Gapo/presenton
git add servers/nextjs/app/api/user-config/route.ts
git commit -m "refactor(nextjs): user-config route drops auth gate"
```

---

## Task 12: Next.js — proxy.ts unchanged (sanity check only)

**Files:**
- Read-only: `servers/nextjs/proxy.ts`

**Interfaces:**
- `isApiAuthExempt(pathname)` already exempts `/api/v1/auth/*` (status, verify, login, register, logout). No change.
- `getAuthStatus(request)` now hits FastAPI `/api/v1/auth/status`, which (after this plan) returns `{authenticated: true, ...}` via Task 9 →  the proxy's final check at lines 161-170 short-circuits on `authStatus.authenticated === true`. Browser traffic for `/api/*` flows through to FastAPI; FastAPI middleware resolves the demo principal (Task 2).

- [ ] **Step 1: Confirm `isApiAuthExempt` exempts the auth prefix**

Run: `cd D:/work/Gapo/presenton && grep -n "isApiAuthExempt\|/api/v1/auth" servers/nextjs/proxy.ts`
Expected: matches show `pathname.startsWith("/api/v1/auth/")` in `isApiAuthExempt`.

- [ ] **Step 2: Confirm no proxy.ts change is needed**

If grep output shows `/api/v1/auth/` exempt, no edit required.

- [ ] **Step 3: No commit**

(No commit; recorded as a sanity check.)

---

## Task 13: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Run all FastAPI tests**

Run: `cd servers/fastapi && pytest tests/ -v --tb=short`
Expected: the new tests (`test_default_user_principal`, `test_demo_user_idempotent`, `test_auth_endpoints_removed`) pass. The 9 pre-existing failing tests from the prior plan remain failing (out of scope).

- [ ] **Step 2: Add a Next.js source-inspection test**

Create `servers/nextjs/tests/no-auth-embedded-default-user.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(nextRoot, "..", "..");

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

test("/auth page is deleted", async () => {
  await assert.rejects(readNext("app/auth/page.tsx"));
});

test("AuthGate and LogoutButton are deleted", async () => {
  await assert.rejects(readNext("components/Auth/AuthGate.tsx"));
  await assert.rejects(readNext("components/Auth/LogoutButton.tsx"));
});

test("root / redirects to /dashboard", async () => {
  const source = await readNext("app/page.tsx");
  assert.match(source, /redirect\(["']\/dashboard["']\)/);
});

test("SettingPage no longer imports LogoutButton", async () => {
  const source = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx"
  );
  assert.doesNotMatch(source, /LogoutButton/);
});

test("proxy still exempts /api/v1/auth/* paths", async () => {
  const source = await readNext("proxy.ts");
  assert.match(source, /\/api\/v1\/auth\//);
});

test("can-change-keys always reflects env flag", async () => {
  const source = await readNext("app/api/can-change-keys/route.ts");
  assert.match(source, /canChangeKeys\s*=\s*process\.env\.CAN_CHANGE_KEYS/);
  assert.doesNotMatch(source, /authStatusForRequest/);
});

test(".env.example is not modified (no DEMO_* added)", async () => {
  const env = await readFile(path.join(repoRoot, ".env.example"), "utf8");
  assert.doesNotMatch(env, /DEMO_USERNAME/);
});
```

Run: `cd servers/nextjs && node --test tests/no-auth-embedded-default-user.test.mjs`
Expected: 7 tests pass.

- [ ] **Step 3: Run all Next.js tests**

Run: `cd servers/nextjs && node --test tests/`
Expected: all pass.

- [ ] **Step 4: Type-check Next.js**

Run: `cd servers/nextjs && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Build Next.js**

Run: `cd servers/nextjs && npx next build`
Expected: exit 0.

- [ ] **Step 6: Commit the Next.js test**

```bash
cd D:/work/Gapo/presenton
git add servers/nextjs/tests/no-auth-embedded-default-user.test.mjs
git commit -m "test(nextjs): add no-auth-embedded-default-user source-inspection tests"
```

---

## Task 14: Final summary + hand-off

**Files:** none modified.

- [ ] **Step 1: Confirm all changes are committed**

Run: `cd D:/work/Gapo/presenton && git status --short`
Expected: clean working tree (except pre-existing WIP for settings/Switch/GSlideHeader that is out of scope).

- [ ] **Step 2: Confirm branch is `main` and not pushed**

Run: `cd D:/work/Gapo/presenton && git rev-parse --abbrev-ref HEAD && git status -sb`
Expected: `main` with `ahead of origin/main` (not pushed).

- [ ] **Step 3: Manual smoke (operator-driven)**

If Docker is available: `docker compose up production --build`, open `http://localhost:5001/`, confirm:
- `/` redirects to `/dashboard`.
- `/dashboard` renders without auth UI.
- `/settings` shows provider config form (no Sign out button).
- Creating a presentation writes a row under the demo user.
- One-time log line `[demo-user] auto-created (id=...)` appears in FastAPI logs on first boot.

If Docker is not available: skip. The test suite + tsc + next build is the verification gate.

- [ ] **Step 4: Write final summary**

Report to the user:
- ~10 commits, branch `main` not pushed.
- Verification: pytest pass (except 9 pre-existing env failures), node:test pass, tsc exit 0, next build exit 0.
- Demo user auto-seeds at startup; password is logged once on first create.
- Single extension point (`resolve_request_principal`) for the future parent Gapo app handshake.
- Out-of-scope follow-ups: parent-app JWT verifier, CORS allowlist, cookie `Domain=`, iframe framing headers, T6 docs cleanup.

---

## Self-Review (run by the planner, not the executor)

1. **Spec coverage:**
   - Auth UI removal (Spec B1) → Tasks 6, 7, 8.
   - Identity resolution (B2) → Tasks 1, 2.
   - Settings + provider keys (B3) → Tasks 9, 10, 11.
   - Data ownership unchanged (B4) → no task needed (correct).
   - Bootstrap (B5) → Task 3.
   - CORS + cookie (B6) → out of scope, recorded.
   - Tests (B7) → Tasks 1, 2, 3, 4, 13.
   - Out of scope (B8) → none of the listed items have tasks.

2. **Placeholder scan:** No "TBD", "TODO", "implement later" in the plan. The only references to out-of-scope items are explicit "out of scope" labels.

3. **Type consistency:**
   - `AuthPrincipal.method` is extended to `"default"` in Task 2 (line: `Literal["jwt", "api_key", "default"]`). All callers either don't care about the literal (just check `principal is not None`) or will now accept `"default"`.
   - `DemoPrincipal` and `AuthPrincipal` are kept as separate dataclasses — Task 1 defines `DemoPrincipal`, Task 2 returns `AuthPrincipal(method="default")`. The middleware (`middlewares.py:99-101`) reads `principal.method == "api_key"`, which still works (it's `"default"` not `"api_key"`).
   - `resolve_demo_user(session)` returns a `User`; `resolve_request_principal` returns the principal + user. The `User` object is compatible with `request.state.current_user` usage in middleware.

4. **Dependency cycle check:** `demo_user.py` imports `PASSWORD_HELPER` from `auth.users` (no cycle). `principal.py` imports `demo_user.py` (no cycle — `demo_user.py` does not import `principal.py`). `bootstrap.py` imports `demo_user.py` locally inside the function (avoids any chance of cycle).

5. **Task 5 collapsed into no-op (recorded as sanity check):** The earlier draft had Task 5 remove `login/logout/register` from `_PUBLIC_AUTH_PATHS` and Task 12 revert it. After closer reading, the simplest correct state is to leave `_PUBLIC_AUTH_PATHS` unchanged — the Next.js proxy already exempts `/api/v1/auth/*`, and the FastAPI middleware lets those routes through. Task 5 is now a no-op sanity check; Task 12 is also a no-op sanity check. This avoids the messy commit-amends-later pattern.

No issues requiring task rewrites. Plan is executable as-is.
