import { readUserConfigFile } from "@/lib/user-config-store";
import { LLMConfig } from "@/types/llm_config";
import { normalizeLLMConfig } from "@/utils/storeHelpers";

const USER_CONFIG_ENV_KEYS = [
  "LLM",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "GOOGLE_API_KEY",
  "GOOGLE_MODEL",
  "CUSTOM_LLM_URL",
  "CUSTOM_LLM_API_KEY",
  "CUSTOM_MODEL",
  "IMAGE_PROVIDER",
  "DISABLE_IMAGE_GENERATION",
  "DISABLE_THINKING",
  "EXTENDED_REASONING",
  "WEB_GROUNDING",
  "WEB_SEARCH_PROVIDER",
  "WEB_SEARCH_MAX_RESULTS",
  "OPENAI_COMPAT_IMAGE_BASE_URL",
  "OPENAI_COMPAT_IMAGE_API_KEY",
  "OPENAI_COMPAT_IMAGE_MODEL",
  "GPT_IMAGE_1_5_QUALITY",
  "DISABLE_ANONYMOUS_TRACKING",
  "SEARXNG_BASE_URL",
] as const;

function readEnvUserConfig(): Partial<LLMConfig> {
  const config: Partial<LLMConfig> = {};
  for (const key of USER_CONFIG_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      (config as Record<string, string>)[key] = value;
    }
  }
  return config;
}

/** File values win; environment variables fill unset fields (matches FastAPI). */
export function getEffectiveUserConfig(configPath: string): LLMConfig {
  const fromFile = readUserConfigFile<LLMConfig>(configPath) || {};
  const fromEnv = readEnvUserConfig();
  const merged: Partial<LLMConfig> = { ...fromEnv };

  for (const [key, value] of Object.entries(fromFile)) {
    if (value !== undefined && value !== null && value !== "") {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return normalizeLLMConfig(merged);
}
