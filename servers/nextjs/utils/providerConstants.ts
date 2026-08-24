export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  size: string;
}

export interface ImageProviderOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  requiresApiKey?: boolean;
  apiKeyField?: string;
  apiKeyFieldLabel?: string;
  getApiKeyUrl?: string;
}

export interface LLMProviderOption {
  value: string;
  label: string;
  description?: string;
  model_value?: string;
  model_label?: string;
  url?: string;
  icon?: string;
  getApiKeyUrl?: string;
}

export interface WebSearchProviderOption {
  value: string;
  label: string;
  description: string;
  icon?: string;
  apiKeyField?: string;
  apiKeyLabel?: string;
  urlField?: string;
  urlLabel?: string;
}

export const WEB_SEARCH_PROVIDERS: Record<string, WebSearchProviderOption> = {
  auto: {
    value: "auto",
    label: "Auto",
    description:
      "Use model-native web grounding for OpenAI and Google. Custom models use the SearXNG sidecar.",
    icon: "/providers/model-search.svg",
  },
  searxng: {
    value: "searxng",
    label: "SearXNG",
    description: "Self-hosted SearXNG instance.",
    icon: "/providers/model-search.svg",
    urlField: "SEARXNG_BASE_URL",
    urlLabel: "SearXNG base URL",
  },
};

export const IMAGE_PROVIDERS: Record<string, ImageProviderOption> = {
  "gpt-image-1.5": {
    value: "gpt-image-1.5",
    label: "GPT Image 1.5",
    description: "OpenAI's image generation model",
    icon: "/providers/openai.png",
    requiresApiKey: true,
    apiKeyField: "OPENAI_API_KEY",
    apiKeyFieldLabel: "OpenAI API Key",
    getApiKeyUrl: "https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8",
  },
  gemini_flash: {
    value: "gemini_flash",
    label: "Gemini Flash",
    description: "Google's fast image generation model",
    icon: "/providers/gemini-color.svg",
    requiresApiKey: true,
    apiKeyField: "GOOGLE_API_KEY",
    apiKeyFieldLabel: "Google API Key",
    getApiKeyUrl: "https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724",
  },
  nanobanana_pro: {
    value: "nanobanana_pro",
    label: "NanoBanana Pro",
    description: "Google's advanced image generation model",
    icon: "/providers/gemini-color.svg",
    requiresApiKey: true,
    apiKeyField: "GOOGLE_API_KEY",
    apiKeyFieldLabel: "Google API Key",
    getApiKeyUrl: "https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724",
  },
  openai_compatible: {
    value: "openai_compatible",
    label: "Custom",
    description:
      "OpenAI-compatible /v1/images endpoint (LiteLLM, Azure, vLLM, etc.)",
    icon: "/providers/custom.svg",
    requiresApiKey: false,
    apiKeyField: "OPENAI_COMPAT_IMAGE_BASE_URL",
    apiKeyFieldLabel: "OpenAI-compatible base URL",
  },
};

export const LLM_PROVIDERS: Record<string, LLMProviderOption> = {
  openai: {
    value: "openai",
    label: "OpenAI",
    description: "OpenAI's latest text generation model",
    url: "https://api.openai.com/v1",
    icon: "/providers/openai.png",
    getApiKeyUrl: "https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8",
  },
  google: {
    value: "google",
    label: "Google",
    description: "Google's primary text generation model",
    url: "https://api.google.com/v1",
    icon: "/providers/gemini-color.svg",
    getApiKeyUrl: "https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724",
  },
  custom: {
    value: "custom",
    label: "Custom",
    description: "OpenAI-compatible LLM",
    icon: "/providers/custom.svg",
  },
};

export const GPT_IMAGE_1_5_QUALITY_OPTIONS = [
  {
    label: "Low",
    value: "low",
    description: "Fastest and most cost-effective",
  },
  {
    label: "Medium",
    value: "medium",
    description: "Balanced quality and speed",
  },
  {
    label: "High",
    value: "high",
    description: "Best quality with longer generation time",
  },
];