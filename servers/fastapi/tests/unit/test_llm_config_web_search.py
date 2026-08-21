from llmai.shared import OpenAIApiType, OpenAIClientConfig

from utils.llm_config import get_extra_body, get_llm_config


def test_openai_uses_responses_api_only_for_native_web_search(monkeypatch):
    monkeypatch.setenv("LLM", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    regular_config = get_llm_config()
    search_config = get_llm_config(use_openai_responses_api=True)

    assert regular_config.api_type == OpenAIApiType.COMPLETIONS
    assert search_config.api_type == OpenAIApiType.RESPONSES


def test_custom_provider_uses_openai_client_config(monkeypatch):
    monkeypatch.setenv("LLM", "custom")
    monkeypatch.setenv("CUSTOM_LLM_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("CUSTOM_LLM_API_KEY", "custom-key")

    config = get_llm_config()

    assert isinstance(config, OpenAIClientConfig)


def test_custom_disable_thinking_uses_legacy_payload(monkeypatch):
    monkeypatch.setenv("LLM", "custom")
    monkeypatch.setenv("DISABLE_THINKING", "true")

    extra_body = get_extra_body()

    assert extra_body == {"enable_thinking": False}
