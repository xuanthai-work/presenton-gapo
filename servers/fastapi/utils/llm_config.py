from typing import Optional

from fastapi import HTTPException
from llmai.shared import (
    ClientConfig,
    GoogleClientConfig,
    OpenAIApiType,
    OpenAIClientConfig,
)

from enums.llm_provider import LLMProvider
from utils.get_env import (
    get_custom_llm_api_key_env,
    get_custom_llm_url_env,
    get_disable_thinking_env,
    get_google_api_key_env,
    get_openai_api_key_env,
    get_web_grounding_env,
)
from utils.llm_provider import get_llm_provider
from utils.parsers import parse_bool_or_none


def enable_web_grounding() -> bool:
    return parse_bool_or_none(get_web_grounding_env()) or False


def disable_thinking() -> bool:
    return parse_bool_or_none(get_disable_thinking_env()) or False


def get_llm_config(*, use_openai_responses_api: bool = False) -> ClientConfig:
    llm_provider = get_llm_provider()

    match llm_provider:
        case LLMProvider.OPENAI:
            api_key = get_openai_api_key_env()
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI API Key is not set")
            return OpenAIClientConfig(
                api_key=api_key,
                api_type=(
                    OpenAIApiType.RESPONSES
                    if use_openai_responses_api
                    else OpenAIApiType.COMPLETIONS
                ),
            )
        case LLMProvider.GOOGLE:
            api_key = get_google_api_key_env()
            if not api_key:
                raise HTTPException(status_code=400, detail="Google API Key is not set")
            return GoogleClientConfig(api_key=api_key)
        case LLMProvider.CUSTOM:
            base_url = get_custom_llm_url_env()
            if not base_url:
                raise HTTPException(
                    status_code=400,
                    detail="Custom LLM URL is not set",
                )
            return OpenAIClientConfig(
                base_url=base_url,
                api_key=get_custom_llm_api_key_env() or "null",
            )
        case _:
            raise HTTPException(
                status_code=400,
                detail=(
                    "LLM Provider must be either openai, google, or custom"
                ),
            )


def get_extra_body(*, uses_tool_choice: bool = False) -> Optional[dict]:
    llm_provider = get_llm_provider()
    if llm_provider == LLMProvider.CUSTOM and disable_thinking():
        return {"enable_thinking": False}
    return None