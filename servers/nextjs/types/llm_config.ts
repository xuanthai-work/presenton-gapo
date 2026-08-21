export interface LLMConfig {
  LLM?: string;

  // OpenAI
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;

  // Google
  GOOGLE_API_KEY?: string;
  GOOGLE_MODEL?: string;

  // Custom LLM (OpenAI-compatible self-host)
  CUSTOM_LLM_URL?: string;
  CUSTOM_LLM_API_KEY?: string;
  CUSTOM_MODEL?: string;

  // Image providers
  DISABLE_IMAGE_GENERATION?: boolean;
  IMAGE_PROVIDER?: string;

  // OpenAI-compatible image API
  OPENAI_COMPAT_IMAGE_BASE_URL?: string;
  OPENAI_COMPAT_IMAGE_API_KEY?: string;
  OPENAI_COMPAT_IMAGE_MODEL?: string;

  // GPT Image 1.5 Quality
  GPT_IMAGE_1_5_QUALITY?: string;

  // Other Configs
  DISABLE_THINKING?: boolean;
  EXTENDED_REASONING?: boolean;
  WEB_GROUNDING?: boolean;
  WEB_SEARCH_PROVIDER?: string;
  WEB_SEARCH_MAX_RESULTS?: string;
  TAVILY_API_KEY?: string;
  EXA_API_KEY?: string;
  BRAVE_SEARCH_API_KEY?: string;

  // Only used in UI settings
  USE_CUSTOM_URL?: boolean;

  /** When `"true"`, anonymous analytics (Mixpanel) are off */
  DISABLE_ANONYMOUS_TRACKING?: string;
}