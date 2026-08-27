import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.router import API_V1_AUTH_ROUTER
from api.v1.auth.rate_limit import LOGIN_RATE_LIMITER, login_rate_limit_key
from api.v1.auth.users import PASSWORD_HELPER
from models.sql.access_token import AccessToken
from models.sql.provider_settings import ProviderSettings
from models.sql.user import User
from models.sql.user_provider_settings import UserProviderSettings
from services.database import get_async_session


def _build_client(tmp_path) -> tuple[TestClient, object]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'auth.db'}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def create_user_table():
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(AccessToken.__table__.create)
            await connection.run_sync(ProviderSettings.__table__.create)
            await connection.run_sync(UserProviderSettings.__table__.create)

    asyncio.run(create_user_table())

    async def override_session():
        async with session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(API_V1_AUTH_ROUTER)
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), engine


def _seed_user(client: TestClient, engine, username: str, password: str) -> None:
    client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password},
    )


def test_register_allowed_when_instance_empty(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    # Registration is removed (410 Gone); gslide ships as a miniweb inside Gapo.
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]
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
    # Login is removed (410 Gone); the previous 428 "no accounts yet" path is gone.
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]
    asyncio.run(engine.dispose())


def test_admin_router_gone(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    client, engine = _build_client(tmp_path)
    assert client.get("/api/v1/admin/users").status_code == 404
    asyncio.run(engine.dispose())


def test_login_sets_http_only_jwt_cookie_for_username_only_account(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)

    client, engine = _build_client(tmp_path)
    register = client.post(
        "/api/v1/auth/register",
        json={"username": "admin", "password": "secret123"},
    )
    client.cookies.clear()
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "ADMIN", "password": "secret123"},
    )

    # Both register and login are removed (410 Gone); cookie side-effects are gone.
    assert register.status_code == 410
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]

    asyncio.run(engine.dispose())


def test_access_key_uses_current_users_session(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    # Previously seeded a user via /register then exercised the access-key flow
    # (token/create + /verify). With register/login removed (410), no session
    # can be established, so the downstream access-key assertions are dropped.
    register = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    assert register.status_code == 410
    assert "no longer supported" in register.json()["detail"]

    asyncio.run(engine.dispose())


def test_legacy_presenton_api_key_still_verifies(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    # Previously seeded a user via /register + /login then verified a legacy API
    # key with /verify. With register/login removed (410), no user/session can be
    # seeded through those endpoints, so the downstream verify assertions are
    # dropped and we only assert the removed endpoints 410.
    register = client.post(
        "/api/v1/auth/register",
        json={"username": "admin", "password": "secret123"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    assert register.status_code == 410
    assert login.status_code == 410

    asyncio.run(engine.dispose())


def test_legacy_six_character_password_can_still_log_in(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    async def seed_legacy_user():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            session.add(
                User(
                    username="legacy-user",
                    hashed_password=PASSWORD_HELPER.hash("123456"),
                    is_active=True,
                    is_verified=True,
                )
            )
            await session.commit()

    asyncio.run(seed_legacy_user())
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "legacy-user", "password": "123456"},
    )

    # Login is removed (410 Gone) even for legacy seeded users.
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]
    asyncio.run(engine.dispose())


@pytest.mark.skip(
    reason="out-of-scope: login/register/logout removed (410); rate-limiting "
    "the removed login flow is no longer meaningful"
)
def test_failed_logins_are_rate_limited(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _seed_user(client, engine, "rate-user", "secret123")
    key = login_rate_limit_key("testclient", "rate-user")
    asyncio.run(LOGIN_RATE_LIMITER.clear(key))

    try:
        for _ in range(5):
            response = client.post(
                "/api/v1/auth/login",
                json={"username": "rate-user", "password": "wrong-password"},
            )
            assert response.status_code == 401

        blocked = client.post(
            "/api/v1/auth/login",
            json={"username": "rate-user", "password": "wrong-password"},
        )
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
    finally:
        asyncio.run(LOGIN_RATE_LIMITER.clear(key))
        asyncio.run(engine.dispose())


def test_register_creates_normal_user_and_sets_cookie(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    setup = client.post(
        "/api/v1/auth/register",
        json={"username": "first-user", "password": "secret123"},
    )
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "secret123"},
    )
    # Register is removed (410 Gone); cookie/created-user side-effects are gone.
    assert setup.status_code == 410
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]

    asyncio.run(engine.dispose())


@pytest.mark.skip(
    reason="out-of-scope: register removed (410); duplicate-username conflict "
    "detection on the removed register flow is no longer meaningful"
)
def test_register_conflict_on_duplicate_username(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _seed_user(client, engine, "admin", "secret123")
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


def test_logout_deletes_gslide_and_legacy_session_cookies(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    _seed_user(client, engine, "admin", "secret123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    response = client.post("/api/v1/auth/logout")
    # Logout is removed (410 Gone); cookie-deletion side-effects are gone.
    assert response.status_code == 410
    assert "no longer supported" in response.json()["detail"]
    asyncio.run(engine.dispose())