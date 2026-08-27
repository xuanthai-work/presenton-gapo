import logging
import os

from sqlalchemy import delete, func, select, update

from api.v1.auth.users import PASSWORD_HELPER
from models.sql.access_token import AccessToken
from models.sql.user import User
from models.sql.async_task import AsyncTaskModel
from models.sql.async_presentation_generation_status import (
    AsyncPresentationGenerationTaskModel,
)
from models.sql.chat_history_message import ChatHistoryMessageModel
from models.sql.image_asset import ImageAsset
from models.sql.key_value import KeyValueSqlModel
from models.sql.presentation import PresentationModel
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.slide import SlideModel
from models.sql.template import TemplateModel
from models.sql.template_create_info import TemplateCreateInfoModel
from models.sql.template_v2 import TemplateV2
from models.sql.webhook_subscription import WebhookSubscription
from services.database import async_session_maker
from api.v1.auth.config import (
    get_legacy_admin_credentials,
    persist_auth_credentials,
)


logger = logging.getLogger(__name__)


def _truthy(value: str | None) -> bool:
    return bool(value and value.strip().lower() in {"1", "true", "yes", "on"})


def _validate_new_environment_password(password: str | None) -> None:
    if password is not None and len(password) < 8:
        raise RuntimeError("AUTH_PASSWORD must be at least 8 characters")


def _validate_new_environment_username(username: str) -> None:
    if username and len(username) < 3:
        raise RuntimeError("AUTH_USERNAME must be at least 3 characters")


async def _find_bootstrap_user(session) -> User | None:
    """Find the user that the legacy/admin bootstrap should recover.

    The migration looks up by ``AUTH_USERNAME`` from the recovery file/env,
    falling back to the first user the database has if any exist.
    """
    env_username = (os.getenv("AUTH_USERNAME") or "").strip()
    if env_username:
        existing = await session.scalar(
            select(User).where(func.lower(User.username) == env_username.casefold())
        )
        if existing is not None:
            return existing
    # No env hint, but if the instance already has an account, take the first
    # one so the bootstrap always operates on a real user row.
    return await session.scalar(select(User).order_by(User.created_at.asc()).limit(1))


async def bootstrap_database_user() -> None:
    """Recover or seed the bootstrap user from env/file without an admin role."""
    async with async_session_maker() as session:
        user = await _find_bootstrap_user(session)
        reset_requested = _truthy(os.getenv("RESET_AUTH"))
        override_requested = _truthy(os.getenv("AUTH_OVERRIDE_FROM_ENV"))
        env_username = (os.getenv("AUTH_USERNAME") or "").strip()
        env_password = os.getenv("AUTH_PASSWORD")
        _validate_new_environment_username(env_username)
        if user is not None:
            if (reset_requested or override_requested) and not env_password:
                raise RuntimeError(
                    "RESET_AUTH and AUTH_OVERRIDE_FROM_ENV require AUTH_PASSWORD so "
                    "account ownership and data can be preserved"
                )
            if (reset_requested or override_requested) and env_password:
                _validate_new_environment_password(env_password)
                if env_username:
                    user.username = env_username
                user.hashed_password = PASSWORD_HELPER.hash(env_password)
                user.auth_version += 1
                await session.execute(
                    delete(AccessToken).where(AccessToken.user_id == user.id)
                )
                await session.flush()
                await session.commit()
                persist_auth_credentials(
                    user.username,
                    user.hashed_password,
                    rotate_secret=True,
                )
                logger.warning(
                    "Recovered bootstrap user credentials from environment."
                )
            else:
                await session.commit()
            await _backfill_legacy_ownership(session, user)
            return

        account_count = int(
            await session.scalar(select(func.count()).select_from(User)) or 0
        )
        if account_count:
            raise RuntimeError(
                "User accounts exist but no bootstrap user can be located"
            )

        legacy_username, legacy_hash = get_legacy_admin_credentials()
        use_environment = reset_requested or override_requested
        username = (
            env_username if use_environment and env_username else legacy_username
        ) or env_username
        if not username:
            return

        if use_environment and env_password:
            _validate_new_environment_password(env_password)
            password_hash = PASSWORD_HELPER.hash(env_password)
        elif legacy_hash:
            password_hash = legacy_hash
        elif env_password:
            _validate_new_environment_password(env_password)
            password_hash = PASSWORD_HELPER.hash(env_password)
        else:
            return

        user = User(
            username=username,
            hashed_password=password_hash,
            is_active=True,
            is_verified=True,
            auth_version=1,
        )
        session.add(user)
        await session.flush()
        await session.commit()
        await session.refresh(user)
        persist_auth_credentials(username, password_hash)
        await _backfill_legacy_ownership(session, user)
        logger.info("Migrated the bootstrap user into the user database.")


async def _backfill_legacy_ownership(session, user: User) -> None:
    owned_models = (
        PresentationModel,
        SlideModel,
        PresentationLayoutCodeModel,
        TemplateModel,
        AsyncTaskModel,
        AsyncPresentationGenerationTaskModel,
        ChatHistoryMessageModel,
        ImageAsset,
        TemplateCreateInfoModel,
        WebhookSubscription,
    )
    for model in owned_models:
        await session.execute(
            update(model)
            .where(model.owner_id.is_(None))
            .values(owner_id=user.id)
        )
    # Built-in templates intentionally remain shared; only custom templates
    # migrate into the bootstrap user's private workspace.
    await session.execute(
        update(TemplateV2)
        .where(TemplateV2.owner_id.is_(None), TemplateV2.is_default.is_(False))
        .values(owner_id=user.id)
    )
    await session.execute(
        update(KeyValueSqlModel)
        .where(KeyValueSqlModel.key == "presentation_custom_themes")
        .values(key=f"presentation_custom_themes:{user.id}")
    )
    await session.commit()
