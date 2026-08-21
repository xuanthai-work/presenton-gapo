import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LLMConfig } from "@/types/llm_config";
import { getApiErrorMessage, getApiUrl } from "@/utils/api";
import { LLM_PROVIDERS } from "@/utils/providerConstants";
import {
  Check,
  Loader2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { notify } from "@/components/ui/sonner";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import Image from "next/image";

interface OpenAIConfigProps {
  onInputChange: (value: string | boolean, field: string) => void;
  llmConfig: LLMConfig;
}

interface ModelOption {
  value: string;
  label: string;
  size?: string;
  tested?: boolean;
}

const TextProvider = ({ onInputChange, llmConfig }: OpenAIConfigProps) => {
  const [openProviderSelect, setOpenProviderSelect] = useState(false);
  const [openModelSelect, setOpenModelSelect] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsChecked, setModelsChecked] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const selectedProvider = (llmConfig.LLM ||
    "openai") as keyof typeof LLM_PROVIDERS;
  const selectedProviderMeta = LLM_PROVIDERS[selectedProvider];
  const currentModelField = useMemo(() => {
    switch (selectedProvider) {
      case "openai":
        return "OPENAI_MODEL";
      case "google":
        return "GOOGLE_MODEL";
      case "custom":
        return "CUSTOM_MODEL";
      default:
        return "";
    }
  }, [selectedProvider]);

  const currentApiKeyField = useMemo(() => {
    switch (selectedProvider) {
      case "openai":
        return "OPENAI_API_KEY";
      case "google":
        return "GOOGLE_API_KEY";
      case "custom":
        return "CUSTOM_LLM_API_KEY";
      default:
        return "";
    }
  }, [selectedProvider]);

  const currentModel = currentModelField
    ? ((llmConfig as Record<string, unknown>)[currentModelField] as string) ||
      ""
    : "";
  const currentApiKey = currentApiKeyField
    ? ((llmConfig as Record<string, unknown>)[currentApiKeyField] as string) ||
      ""
    : "";
  const currentCustomUrl = llmConfig.CUSTOM_LLM_URL || "";
  const modelLabel = selectedProviderMeta?.label || selectedProvider;
  const modelOptions = useMemo(() => {
    if (!currentModel) return availableModels;

    return [
      {
        value: currentModel,
        label: currentModel,
      },
      ...availableModels.filter((model) => model.value !== currentModel),
    ];
  }, [availableModels, currentModel]);
  const providerApiKeyLabel =
    selectedProvider === "custom"
      ? "Custom LLM API Key"
      : `${selectedProvider} API Key`;

  useEffect(() => {
    setAvailableModels([]);
    setModelsChecked(false);
  }, [
    selectedProvider,
    currentApiKey,
    currentCustomUrl,
    currentModelField,
    onInputChange,
  ]);

  const onApiKeyChange = (llm: keyof typeof LLM_PROVIDERS, value: string) => {
    const keyField =
      llm === "openai"
        ? "OPENAI_API_KEY"
        : llm === "google"
        ? "GOOGLE_API_KEY"
        : llm === "custom"
        ? "CUSTOM_LLM_API_KEY"
        : "";
    if (keyField) {
      onInputChange(value, keyField);
    }
  };

  const fetchAvailableModels = async () => {
    if (modelsLoading) return;
    if (selectedProvider === "openai" && !currentApiKey) return;
    if (selectedProvider === "google" && !currentApiKey) return;
    if (selectedProvider === "custom" && !currentCustomUrl) return;

    setModelsLoading(true);
    try {
      let response: Response;
      if (selectedProvider === "google") {
        response = await fetch(
          getApiUrl("/api/v1/ppt/google/models/available"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              api_key: currentApiKey,
            }),
          }
        );
      } else {
        const openAiCompatibleUrl =
          selectedProvider === "custom"
            ? currentCustomUrl
            : selectedProviderMeta?.url || "";
        response = await fetch(
          getApiUrl("/api/v1/ppt/openai/models/available"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: openAiCompatibleUrl,
              api_key: currentApiKey,
            }),
          }
        );
      }

      if (response.ok) {
        const data = await response.json();
        const normalizedModels: ModelOption[] = Array.isArray(data)
            ? data
                .filter((model): model is string => typeof model === "string")
                .map((model) => ({
                  value: model,
                  label: model,
                }))
            : [];

        setAvailableModels(normalizedModels);
        setModelsChecked(true);

        if (normalizedModels.length > 0 && currentModelField) {
          const modelValues = normalizedModels.map((model) => model.value);
          if (currentModel && modelValues.includes(currentModel)) {
            onInputChange(currentModel, currentModelField);
            return;
          }

          const preferredDefault =
            selectedProvider === "openai"
              ? "gpt-4.1"
              : selectedProvider === "google"
              ? "models/gemini-2.5-flash"
              : modelValues[0];

          const nextModel = modelValues.includes(preferredDefault)
            ? preferredDefault
            : modelValues[0];
          onInputChange(nextModel, currentModelField);
        }
      } else {
        const message = await getApiErrorMessage(
          response,
          `The server could not list ${modelLabel} models. Check your API key or endpoint and try again.`
        );
        console.error("Failed to fetch models");
        setAvailableModels([]);
        setModelsChecked(true);
        notify.error("Could not load models", message);
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      notify.error(
        "Could not load models",
        error instanceof Error
          ? error.message
          : "Something went wrong while contacting the provider. Check your network and try again."
      );
      setAvailableModels([]);
      setModelsChecked(true);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleModelSelectOpenChange = (isOpen: boolean) => {
    setOpenModelSelect(isOpen);
    if (isOpen) {
      fetchAvailableModels();
    }
  };

  return (
    <div className="space-y-6 bg-[#F9F8F8] p-7 rounded-[12px] ">
      {/* API Key Input */}
      <div className="mb-4 flex flex-col gap-8 rounded-[12px] bg-white pt-5 pb-10 px-10 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="max-w-[290px] shrink-0 ">
          <div
            className="w-[60px] h-[60px] rounded-[4px] flex items-center justify-center"
            style={{ backgroundColor: "#4C55541A" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M15.9459 5.31543V26.5767"
                stroke="#4C5554"
                strokeWidth="1.59459"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.31531 9.30192V6.64426C5.31531 6.29183 5.45531 5.95384 5.70451 5.70463C5.95372 5.45543 6.29171 5.31543 6.64414 5.31543H25.2477C25.6002 5.31543 25.9382 5.45543 26.1874 5.70463C26.4366 5.95384 26.5766 6.29183 26.5766 6.64426V9.30192"
                stroke="#4C5554"
                strokeWidth="1.59459"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M11.9594 26.5762H19.9324"
                stroke="#4C5554"
                strokeWidth="1.59459"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 className="text-xl font-normal text-[#191919] py-2.5">
            Text Generation Settings
          </h3>
          <p className=" text-sm  text-gray-500">
            Choosing where text content comes from
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-stretch justify-end gap-4 sm:items-end">
          <div
            className={`flex w-full min-w-0 flex-wrap gap-4 sm:justify-end items-start`}
          >
            <div
              className={`relative shrink-0 w-[262px]`}
            >
              <div className="flex flex-col justify-start ">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Text Provider
                </label>
                <Popover
                  open={openProviderSelect}
                  onOpenChange={setOpenProviderSelect}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openProviderSelect}
                      className="w-[222px] h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between"
                    >
                      <div className="flex gap-3 items-center">
                        {selectedProviderMeta?.icon ? (
                          <Image
                            src={selectedProviderMeta.icon}
                            alt=""
                            width={22}
                            height={22}
                            className="h-[22px] w-[22px] rounded-[5px] object-contain"
                          />
                        ) : null}
                        <span className="text-sm font-medium text-gray-900">
                          {llmConfig.LLM
                            ? LLM_PROVIDERS[llmConfig.LLM]?.label ||
                              llmConfig.LLM
                            : "Select text provider"}
                        </span>
                      </div>
                      {openProviderSelect ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0"
                    align="start"
                    style={{ width: "300px" }}
                  >
                    <Command>
                      <CommandInput placeholder="Search provider..." />
                      <CommandList>
                        <CommandEmpty>No provider found.</CommandEmpty>
                        <CommandGroup>
                          {Object.values(LLM_PROVIDERS).map(
                            (provider, index) => (
                              <CommandItem
                                key={index}
                                value={provider.value}
                                onSelect={(value) => {
                                  trackEvent(MixpanelEvent.Settings_Provider_Selected, {
                                    section: "text_provider",
                                    provider: value,
                                  });
                                  onInputChange(value, "LLM");
                                  setOpenProviderSelect(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    llmConfig.LLM === provider.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex gap-3 items-center">
                                  <div className="flex flex-col space-y-1 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium text-gray-900 capitalize">
                                        {provider.label}
                                      </span>
                                    </div>
                                    <span className="text-xs text-gray-600 leading-relaxed">
                                      {provider.description}
                                    </span>
                                  </div>
                                </div>
                              </CommandItem>
                            )
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div
              className={`relative flex min-w-0 flex-col justify-end items-end w-[282px] shrink-0 max-w-full`}
            >
              <div className="flex flex-col justify-start w-full ">
                <>
                  <label className="block text-sm font-medium capitalize text-gray-700 mb-2">
                    {providerApiKeyLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={currentApiKey}
                      onChange={(e) =>
                        onApiKeyChange(selectedProvider, e.target.value)
                      }
                      className="w-full px-2 py-3 outline-none border  border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                      placeholder={`Enter your ${providerApiKeyLabel}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white px-2 py-1 cursor-pointer"
                    >
                      {showApiKey ? (
                        <Eye className="w-4 h-4 text-gray-500" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>
                </>
                {selectedProvider === "custom" && (
                  <input
                    type="text"
                    value={currentCustomUrl}
                    onChange={(e) =>
                      onInputChange(e.target.value, "CUSTOM_LLM_URL")
                    }
                    className="w-full mt-2 px-2 py-3 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                    placeholder="OpenAI-compatible URL"
                  />
                )}
              </div>
              {!currentModel &&
                (!modelsChecked ||
                  availableModels.length === 0) && (
                  <button
                    onClick={fetchAvailableModels}
                    disabled={
                      modelsLoading ||
                      (selectedProvider === "openai" && !currentApiKey) ||
                      (selectedProvider === "google" && !currentApiKey) ||
                      (selectedProvider === "custom" && !currentCustomUrl)
                    }
                    className={`mt-4 py-2.5 bg-[#EDEEEF] px-3.5 w-fit  rounded-[48px] text-xs font-semibold text-[#101323] transition-all duration-200 border ${
                      modelsLoading
                        ? " border-gray-300 cursor-not-allowed text-gray-500"
                        : " border-[#EDEEEF] text-[#101323] hover:bg-[#E8F0FF]/90 focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  >
                    {modelsLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking for models...
                      </span>
                    ) : (
                      "Check models"
                    )}
                  </button>
                )}
            </div>
          </div>
          {/* Model Selection - only show if models are available */}
          {(currentModel || (modelsChecked && modelOptions.length > 0)) ? (
            <div className="w-[262px]">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {`Select ${modelLabel} Model`}
                </label>
                <div className="w-full">
                  <Popover
                    open={openModelSelect}
                    onOpenChange={handleModelSelectOpenChange}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openModelSelect}
                        className="w-full h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between"
                      >
                        <span className="text-sm truncate font-medium text-gray-900">
                          {(() => {
                            if (!currentModel) return "Select a model";
                            const selectedModel = modelOptions.find(
                              (model) => model.value === currentModel
                            );
                            if (!selectedModel) return currentModel;
                            return selectedModel.label;
                          })()}
                        </span>

                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0"
                      align="start"
                      style={{ width: "var(--radix-popover-trigger-width)" }}
                    >
                      <Command>
                        <CommandInput placeholder="Search models..." />
                        <CommandList>
                          <CommandEmpty>No model found.</CommandEmpty>
                          <CommandGroup>
                            {modelsLoading ? (
                              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600">
                                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                                Fetching models...
                              </div>
                            ) : null}
                            {modelOptions.map((model) => (
                              <CommandItem
                                key={model.value}
                                value={model.value}
                                onSelect={() => {
                                  if (currentModelField) {
                                    trackEvent(MixpanelEvent.Settings_Model_Selected, {
                                      provider: selectedProvider,
                                      model: model.value,
                                    });
                                    onInputChange(
                                      model.value,
                                      currentModelField
                                    );
                                  }
                                  setOpenModelSelect(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    currentModel === model.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex gap-3 items-center">
                                  <div className="flex flex-col space-y-1 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium text-gray-900">
                                        {model.label}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {/* Show message if no models found */}
      {modelsChecked && availableModels.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            No models found. Please make sure your provider credentials are
            valid and the selected provider is reachable.
          </p>
        </div>
      )}

      {/* <div className="bg-white flex justify-between items-center p-10 rounded-[12px]">
                <div className=' max-w-[290px]'>

                    <h4 className="text-xl font-normal text-[#191919]">Advanced</h4>
                    <p className="mt-2.5 text-sm  text-gray-500">
                        Configure advanced AI features.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-[222px]">
                        <div className="flex items-center  mb-4 gap-2.5 ">
                            <Switch
                                checked={!!llmConfig.WEB_GROUNDING}
                                onCheckedChange={(checked) => onInputChange(checked, "WEB_GROUNDING")}
                            />
                            <label className="text-sm font-medium text-gray-700">
                                Enable Web Grounding
                            </label>
                        </div>
                    </div>
                </div>
            </div> */}
    </div>
  );
};

export default TextProvider;
