import { setLLMConfig } from "@/store/slices/userConfig";
import { store } from "@/store/store";
import { LLMConfig } from "@/types/llm_config";

function isProvided(value: unknown): boolean {
  return value !== "" && value !== null && value !== undefined;
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export const normalizeLLMConfig = (llmConfig: LLMConfig): LLMConfig => {
  const normalizedConfig: LLMConfig = { ...llmConfig };

  if (!normalizedConfig.LLM) {
    normalizedConfig.LLM = "openai";
  }

  const parsedDisableImageGeneration = parseOptionalBool(
    (normalizedConfig as Record<string, unknown>).DISABLE_IMAGE_GENERATION
  );
  if (parsedDisableImageGeneration !== undefined) {
    normalizedConfig.DISABLE_IMAGE_GENERATION = parsedDisableImageGeneration;
  }
  const parsedWebGrounding = parseOptionalBool(
    (normalizedConfig as Record<string, unknown>).WEB_GROUNDING
  );
  if (parsedWebGrounding !== undefined) {
    normalizedConfig.WEB_GROUNDING = parsedWebGrounding;
  }

  if (normalizedConfig.WEB_GROUNDING) {
    const provider = String(normalizedConfig.WEB_SEARCH_PROVIDER || "auto")
      .trim()
      .toLowerCase();
    normalizedConfig.WEB_SEARCH_PROVIDER =
      provider === "native" || provider === "searxng" ? provider : "auto";
  }

  return normalizedConfig;
};

/**
 * Returns a user-facing validation message, or null when the config is valid.
 */
export const getLLMConfigValidationError = (
  inputConfig: LLMConfig
): string | null => {
  const llmConfig = normalizeLLMConfig(inputConfig);

  if (!llmConfig.LLM) {
    return "Select a text provider.";
  }

  const llm = llmConfig.LLM;

  if (!llmConfig.DISABLE_IMAGE_GENERATION && !llmConfig.IMAGE_PROVIDER) {
    return "Select an image provider, or turn off image generation.";
  }

  if (llm === "openai") {
    if (!isProvided(llmConfig.OPENAI_API_KEY)) {
      return "OpenAI API key is required.";
    }
    if (!isProvided(llmConfig.OPENAI_MODEL)) {
      return 'Text provider (OpenAI): choose a chat model on the Text Provider tab—use "Check models" after your API key, then pick a model. The model under Image Provider → Custom is only for image generation.';
    }
  } else if (llm === "google") {
    if (!isProvided(llmConfig.GOOGLE_API_KEY)) {
      return "Google API key is required.";
    }
    if (!isProvided(llmConfig.GOOGLE_MODEL)) {
      return 'No Google model selected. Use "Check models" after entering your API key, then choose a model.';
    }
  } else if (llm === "custom") {
    if (!isProvided(llmConfig.CUSTOM_LLM_URL)) {
      return "Enter your custom LLM endpoint URL (OpenAI-compatible).";
    }
    if (!isProvided(llmConfig.CUSTOM_MODEL)) {
      return 'No model selected for your custom endpoint. Use "Check models" after entering the URL, then choose a model.';
    }
  } else {
    return "Unsupported or unknown text provider.";
  }

  if (!llmConfig.DISABLE_IMAGE_GENERATION) {
    switch (llmConfig.IMAGE_PROVIDER) {
      case "gpt-image-1.5":
        if (!isProvided(llmConfig.OPENAI_API_KEY)) {
          return "OpenAI API key is required for GPT Image 1.5.";
        }
        break;
      case "gemini_flash":
        if (!isProvided(llmConfig.GOOGLE_API_KEY)) {
          return "Google API key is required for Gemini Flash image generation.";
        }
        break;
      case "nanobanana_pro":
        if (!isProvided(llmConfig.GOOGLE_API_KEY)) {
          return "Google API key is required for NanoBanana Pro.";
        }
        break;
      case "openai_compatible":
        if (
          !isProvided(llmConfig.OPENAI_COMPAT_IMAGE_BASE_URL?.trim()) ||
          !isProvided(llmConfig.OPENAI_COMPAT_IMAGE_API_KEY?.trim()) ||
          !isProvided(llmConfig.OPENAI_COMPAT_IMAGE_MODEL?.trim())
        ) {
          return "OpenAI-compatible image API requires base URL, API key, and model.";
        }
        break;
      default:
        return "Select a valid image provider.";
    }
  }

  if (llmConfig.WEB_GROUNDING) {
    const provider = llmConfig.WEB_SEARCH_PROVIDER || "auto";
    if (!["auto", "native", "searxng"].includes(provider)) {
      return "Select a valid web search provider, or turn off web search.";
    }
  }

  return null;
};

export const handleSaveLLMConfig = async (llmConfig: LLMConfig) => {
  const normalizedConfig = normalizeLLMConfig(llmConfig);
  const validationError = getLLMConfigValidationError(normalizedConfig);
  if (validationError) {
    throw new Error(validationError);
  }

  const response = await fetch("/api/user-config", {
    method: "POST",
    body: JSON.stringify(normalizedConfig),
  });
  if (!response.ok) {
    throw new Error(`Unable to save user configuration (${response.status})`);
  }

  store.dispatch(setLLMConfig(normalizedConfig));
};

export const hasValidLLMConfig = (llmConfig: LLMConfig) =>
  getLLMConfigValidationError(llmConfig) === null;