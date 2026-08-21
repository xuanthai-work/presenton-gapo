import os

DEFAULT_PRESENTON_OAUTH_ISSUER = "https://api.presenton.ai"
DEFAULT_PRESENTON_OAUTH_CLIENT_ID = "ptc_presenton_open_source"


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_can_change_keys_env():
    return os.getenv("CAN_CHANGE_KEYS")


def get_database_url_env():
    return os.getenv("DATABASE_URL")


def get_app_data_directory_env():
    return os.getenv("APP_DATA_DIRECTORY")


def get_fastapi_public_base_url() -> str | None:
    """
    Public origin where FastAPI serves /app_data and /static (no trailing slash).

    Uses NEXT_PUBLIC_FAST_API (the value Next.js injects for the UI).
    When unset, callers keep path-only URLs for same-origin / reverse-proxy setups (e.g. Docker).
    """
    v = (os.getenv("NEXT_PUBLIC_FAST_API") or "").strip().rstrip("/")
    return v or None


def get_temp_directory_env():
    return os.getenv("TEMP_DIRECTORY")


def get_user_config_path_env():
    return os.getenv("USER_CONFIG_PATH")


def get_disable_auth_env():
    return os.getenv("DISABLE_AUTH")


def get_presenton_oauth_issuer() -> str:
    return DEFAULT_PRESENTON_OAUTH_ISSUER


def get_presenton_oauth_client_id() -> str:
    return DEFAULT_PRESENTON_OAUTH_CLIENT_ID


def is_disable_auth_enabled():
    return _is_truthy(get_disable_auth_env())


def get_llm_provider_env():
    return os.getenv("LLM")


def get_custom_llm_url_env():
    return os.getenv("CUSTOM_LLM_URL")


def get_openai_api_key_env():
    return os.getenv("OPENAI_API_KEY")


def get_openai_model_env():
    return os.getenv("OPENAI_MODEL")


def get_google_api_key_env():
    return os.getenv("GOOGLE_API_KEY")


def get_google_model_env():
    return os.getenv("GOOGLE_MODEL")


def get_custom_llm_api_key_env():
    return os.getenv("CUSTOM_LLM_API_KEY")


def get_custom_model_env():
    return os.getenv("CUSTOM_MODEL")


def get_disable_image_generation_env():
    return os.getenv("DISABLE_IMAGE_GENERATION")


def is_parallel_image_generation_enabled() -> bool:
    """Whether image provider requests may run concurrently.

    Parallel generation is the existing behavior, so it remains enabled unless
    ENABLE_PARALLEL_IMAGE_GENERATION is explicitly set to a falsey value.
    """
    return _is_truthy(os.getenv("ENABLE_PARALLEL_IMAGE_GENERATION", "true"))


def get_image_provider_env():
    return os.getenv("IMAGE_PROVIDER")


def get_disable_thinking_env():
    return os.getenv("DISABLE_THINKING")


def get_extended_reasoning_env():
    return os.getenv("EXTENDED_REASONING")


def get_web_grounding_env():
    return os.getenv("WEB_GROUNDING")


def get_web_search_provider_env():
    return os.getenv("WEB_SEARCH_PROVIDER")


def get_web_search_max_results_env():
    return os.getenv("WEB_SEARCH_MAX_RESULTS")


def get_tavily_api_key_env():
    return os.getenv("TAVILY_API_KEY")


def get_exa_api_key_env():
    return os.getenv("EXA_API_KEY")


def get_brave_search_api_key_env():
    return os.getenv("BRAVE_SEARCH_API_KEY")


# Gpt Image 1.5 Quality
def get_gpt_image_1_5_quality_env():
    return os.getenv("GPT_IMAGE_1_5_QUALITY")


def get_migrate_database_on_startup_env():
    return os.getenv("MIGRATE_DATABASE_ON_STARTUP")


def get_sentry_dsn_env():
    return os.getenv("SENTRY_DSN")


def get_sentry_traces_sample_rate_env():
    return os.getenv("SENTRY_TRACES_SAMPLE_RATE")


def get_sentry_send_default_pii_env():
    return os.getenv("SENTRY_SEND_DEFAULT_PII")


# OpenAI Compatible Image Provider
def get_openai_compat_image_base_url_env():
    return os.getenv("OPENAI_COMPAT_IMAGE_BASE_URL")


def get_openai_compat_image_api_key_env():
    return os.getenv("OPENAI_COMPAT_IMAGE_API_KEY")


def get_openai_compat_image_model_env():
    return os.getenv("OPENAI_COMPAT_IMAGE_MODEL")