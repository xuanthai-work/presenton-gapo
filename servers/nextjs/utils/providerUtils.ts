import { LLMConfig } from "@/types/llm_config";

/**
 * Updates LLM configuration based on field changes
 */
export const updateLLMConfig = (
  currentConfig: LLMConfig,
  field: string,
  value: string | boolean
): LLMConfig => {
  const fieldMappings: Record<string, keyof LLMConfig> = {
    openai_api_key: "OPENAI_API_KEY",
    openai_model: "OPENAI_MODEL",
    google_api_key: "GOOGLE_API_KEY",
    google_model: "GOOGLE_MODEL",
    custom_llm_url: "CUSTOM_LLM_URL",
    custom_llm_api_key: "CUSTOM_LLM_API_KEY",
    custom_model: "CUSTOM_MODEL",
    image_provider: "IMAGE_PROVIDER",
    disable_image_generation: "DISABLE_IMAGE_GENERATION",
    disable_thinking: "DISABLE_THINKING",
    extended_reasoning: "EXTENDED_REASONING",
    web_grounding: "WEB_GROUNDING",
    web_search_provider: "WEB_SEARCH_PROVIDER",
    web_search_max_results: "WEB_SEARCH_MAX_RESULTS",
    searxng_base_url: "SEARXNG_BASE_URL",
    gpt_image_1_5_quality: "GPT_IMAGE_1_5_QUALITY",
    openai_compat_image_base_url: "OPENAI_COMPAT_IMAGE_BASE_URL",
    openai_compat_image_api_key: "OPENAI_COMPAT_IMAGE_API_KEY",
    openai_compat_image_model: "OPENAI_COMPAT_IMAGE_MODEL",
  };

  const configKey = fieldMappings[field];
  if (configKey) {
    return { ...currentConfig, [configKey]: value };
  }

  return currentConfig;
};

/**
 * Changes the provider and sets appropriate defaults
 */
export const changeProvider = (
  currentConfig: LLMConfig,
  provider: string
): LLMConfig => {
  const newConfig = { ...currentConfig, LLM: provider };

  // Auto Select appropriate image provider based on the text models
  if (provider === "openai") {
    newConfig.IMAGE_PROVIDER = "gpt-image-1.5";
  } else if (provider === "google") {
    newConfig.IMAGE_PROVIDER = "gemini_flash";
  } else {
    newConfig.IMAGE_PROVIDER = "openai_compatible";
  }

  return newConfig;
};