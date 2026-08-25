import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.admin.router import API_V1_ADMIN_ROUTER
from api.v1.auth.config import SESSION_COOKIE_NAME
from api.v1.auth.router import API_V1_AUTH_ROUTER
from api.v1.auth.rate_limit import LOGIN_RATE_LIMITER, login_rate_limit_key
from api.v1.auth.users import PASSWORD_HELPER
from models.sql.access_token import AccessToken
from models.sql.provider_settings import ProviderSettings
from models.sql.user import User
from services.database import get_async_session


def _build_client(tmp_path) -> tuple[TestClient, object]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'auth.db'}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def create_user_table():
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(AccessToken.__table__.create)
            await connection.run_sync(ProviderSettings.__table__.create)

    asyncio.run(create_user_table())

    async def override_session():
        async with session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(API_V1_AUTH_ROUTER)
    app.include_router(API_V1_ADMIN_ROUTER)
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app), engine


def test_login_sets_http_only_jwt_cookie_for_username_only_account(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)

    client, engine = _build_client(tmp_path)
    setup = client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "ADMIN", "password": "secret123"},
    )

    assert setup.status_code == 200
    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is True
    assert payload["authenticated"] is True
    assert payload["username"] == "admin"
    assert "access_token" not in payload
    assert SESSION_COOKIE_NAME in response.cookies
    assert SESSION_COOKIE_NAME == "gslide_session"
    assert response.cookies[SESSION_COOKIE_NAME]
    assert "HttpOnly" in response.headers["set-cookie"]

    asyncio.run(engine.dispose())


def test_admin_access_key_passes_internal_auth_check(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    token_response = client.post("/api/v1/auth/token/create")
    token = token_response.json()["token"]
    assert token.startswith("sk-gslide-")
    client.cookies.clear()

    response = client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert token_response.status_code == 200
    assert response.status_code == 200
    assert response.json()["method"] == "api_key"
    assert response.json()["role"] == "admin"

    asyncio.run(engine.dispose())


def test_legacy_presenton_api_key_still_verifies(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    assert login.status_code == 200

    from sqlalchemy import select

    async def seed_legacy_key():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            admin = (
                await session.execute(select(User).where(User.username == "admin"))
            ).scalar_one()
            session.add(
                AccessToken(token="sk-presenton-legacyfixture", user_id=admin.id)
            )
            await session.commit()

    asyncio.run(seed_legacy_key())
    client.cookies.clear()
    response = client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": "Bearer sk-presenton-legacyfixture"},
    )
    assert response.status_code == 200
    assert response.json()["method"] == "api_key"
    asyncio.run(engine.dispose())


def test_legacy_six_character_password_can_still_log_in(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)

    async def seed_legacy_admin():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            session.add(
                User(
                    username="legacy-admin",
                    hashed_password=PASSWORD_HELPER.hash("123456"),
                    is_active=True,
                    is_verified=True,
                    is_superuser=True,
                    admin_slot="primary",
                )
            )
            await session.commit()

    asyncio.run(seed_legacy_admin())
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "legacy-admin", "password": "123456"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    asyncio.run(engine.dispose())


def test_failed_logins_are_rate_limited(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "rate-admin", "password": "secret123"},
    )
    key = login_rate_limit_key("testclient", "rate-admin")
    asyncio.run(LOGIN_RATE_LIMITER.clear(key))

    try:
        for _ in range(5):
            response = client.post(
                "/api/v1/auth/login",
                json={"username": "rate-admin", "password": "wrong-password"},
            )
            assert response.status_code == 401

        blocked = client.post(
            "/api/v1/auth/login",
            json={"username": "rate-admin", "password": "wrong-password"},
        )
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
    finally:
        asyncio.run(LOGIN_RATE_LIMITER.clear(key))
        asyncio.run(engine.dispose())


def test_database_rejects_a_second_primary_administrator(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "first-admin", "password": "secret123"},
    )

    async def insert_second_admin():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            session.add(
                User(
                    username="second-admin",
                    hashed_password=PASSWORD_HELPER.hash("secret456"),
                    is_active=True,
                    is_verified=True,
                    is_superuser=True,
                    admin_slot="primary",
                )
            )
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return True
        return False

    assert asyncio.run(insert_second_admin()) is True
    asyncio.run(engine.dispose())


def test_admin_provider_settings_omit_presenton_cloud_status(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.setenv("CAN_CHANGE_KEYS", "true")
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )

    response = client.get("/api/v1/admin/provider-settings")

    assert response.status_code == 200
    assert "PRESENTON_CONNECTED" not in response.json()
    assert "PRESENTON_EMAIL" not in response.json()
    asyncio.run(engine.dispose())


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


def test_logout_deletes_gslide_and_legacy_session_cookies(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    response = client.post("/api/v1/auth/logout")
    set_cookies = response.headers.get_list("set-cookie")
    joined = "\n".join(set_cookies)
    assert response.status_code == 200
    assert "gslide_session=" in joined
    assert "presenton_session=" in joined
    asyncio.run(engine.dispose())
