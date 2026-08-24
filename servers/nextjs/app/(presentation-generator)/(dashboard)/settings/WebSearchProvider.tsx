"use client";

import React, { useCallback } from "react";
import { Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { LLMConfig } from "@/types/llm_config";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

const WebSearchProvider = ({
  llmConfig,
  setLlmConfig,
}: {
  llmConfig: LLMConfig;
  setLlmConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
}) => {
  const isWebSearchEnabled = !!llmConfig.WEB_GROUNDING;

  const update = useCallback(
    (field: keyof LLMConfig, value: string | boolean) => {
      setLlmConfig((current) => ({ ...current, [field]: value }));
    },
    [setLlmConfig]
  );

  return (
    <div className="space-y-6 rounded-[12px] bg-[#F9F8F8] p-7">
      <div className="mb-4 rounded-[12px] bg-white p-10 pt-5">
        <div className="mb-6 flex justify-end">
          <Switch
            checked={isWebSearchEnabled}
            className="data-[state=checked]:bg-[#4791FF] data-[state=unchecked]:bg-gray-400"
            onCheckedChange={(checked) => {
              trackEvent(MixpanelEvent.Settings_Provider_Selected, {
                section: "web_search_provider",
                enabled: checked,
                provider: checked ? "auto" : "disabled",
              });
              setLlmConfig((current) => ({
                ...current,
                WEB_GROUNDING: checked,
                WEB_SEARCH_PROVIDER: checked
                  ? current.WEB_SEARCH_PROVIDER || "auto"
                  : current.WEB_SEARCH_PROVIDER,
              }));
            }}
          />
        </div>
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:gap-10">
          <div className="max-w-[300px] shrink-0 pb-2 lg:pb-[20px]">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[4px] bg-[#F4F3FF]">
              <Search className="h-7 w-7 text-[#5146E5]" />
            </div>
            <h3 className="py-2.5 text-xl font-normal text-[#191919]">
              Web Search Settings
            </h3>
            <p className="text-sm text-gray-500">
              OpenAI and Google use native search. Custom models use the
              SearXNG sidecar.
            </p>
          </div>
          {isWebSearchEnabled && (
            <div className="w-full max-w-[720px] space-y-4">
              <div className="rounded-lg border border-[#D9D6FE] bg-[#F4F3FF] p-3 text-xs text-[#5146E5]">
                Auto uses model-native web grounding when the LLM is OpenAI or
                Google. Otherwise Presenton queries SearXNG at the URL below
                (Compose default: http://searxng:8080).
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#4C5554]">
                  SearXNG base URL
                </label>
                <input
                  type="url"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 text-sm text-[#191919] outline-none transition-colors focus:border-blue-500"
                  placeholder="http://searxng:8080"
                  value={String(llmConfig.SEARXNG_BASE_URL || "")}
                  onChange={(event) =>
                    update("SEARXNG_BASE_URL", event.target.value)
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#4C5554]">
                  Maximum results
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 text-sm text-[#191919] outline-none transition-colors focus:border-blue-500"
                  value={llmConfig.WEB_SEARCH_MAX_RESULTS || "5"}
                  onChange={(event) =>
                    update("WEB_SEARCH_MAX_RESULTS", event.target.value)
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebSearchProvider;
