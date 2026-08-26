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
import {
  SettingsField,
  settingsControlClassName,
  settingsDropdownClassName,
  settingsFormColumnClassName,
} from "./SettingsField";

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
    <div className="space-y-6 rounded-[12px] bg-[#F9F8F8] p-7">
      <div className="mb-4 flex flex-col gap-8 rounded-[12px] bg-white px-6 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <div className="max-w-[280px] shrink-0">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[4px] bg-[var(--gslide-accent-soft)]">
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
          <h3 className="py-2.5 text-xl font-normal text-[#191919]">
            Text Generation Settings
          </h3>
          <p className="text-sm text-gray-500">
            Choosing where text content comes from
          </p>
        </div>
        <div className={settingsFormColumnClassName}>
          <SettingsField label="Select Text Provider">
            <Popover
              open={openProviderSelect}
              onOpenChange={setOpenProviderSelect}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openProviderSelect}
                  className={settingsDropdownClassName}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {selectedProviderMeta?.icon ? (
                      <Image
                        src={selectedProviderMeta.icon}
                        alt=""
                        width={22}
                        height={22}
                        className="h-[22px] w-[22px] rounded-[5px] object-contain"
                      />
                    ) : null}
                    <span className="truncate text-sm font-medium text-gray-900">
                      {llmConfig.LLM
                        ? LLM_PROVIDERS[llmConfig.LLM]?.label || llmConfig.LLM
                        : "Select text provider"}
                    </span>
                  </div>
                  {openProviderSelect ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0"
                align="start"
                style={{ width: "var(--radix-popover-trigger-width)" }}
              >
                <Command>
                  <CommandInput placeholder="Search provider..." />
                  <CommandList>
                    <CommandEmpty>No provider found.</CommandEmpty>
                    <CommandGroup>
                      {Object.values(LLM_PROVIDERS).map((provider, index) => (
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
                          <div className="flex flex-1 flex-col space-y-1">
                            <span className="text-sm font-medium capitalize text-gray-900">
                              {provider.label}
                            </span>
                            <span className="text-xs leading-relaxed text-gray-600">
                              {provider.description}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </SettingsField>

          <SettingsField label={providerApiKeyLabel}>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={currentApiKey}
                onChange={(e) =>
                  onApiKeyChange(selectedProvider, e.target.value)
                }
                className={`${settingsControlClassName} pr-10`}
                placeholder={`Enter your ${providerApiKeyLabel}`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer bg-white px-2 py-1"
              >
                {showApiKey ? (
                  <Eye className="h-4 w-4 text-gray-500" />
                ) : (
                  <EyeOff className="h-4 w-4 text-gray-500" />
                )}
              </button>
            </div>
          </SettingsField>

          {selectedProvider === "custom" && (
            <SettingsField label="OpenAI-compatible URL">
              <input
                type="text"
                value={currentCustomUrl}
                onChange={(e) =>
                  onInputChange(e.target.value, "CUSTOM_LLM_URL")
                }
                className={settingsControlClassName}
                placeholder="https://host.docker.internal:5000/v1"
              />
            </SettingsField>
          )}

          {(currentModel || (modelsChecked && modelOptions.length > 0)) ? (
            <SettingsField label={`Select ${modelLabel} Model`}>
              <Popover
                open={openModelSelect}
                onOpenChange={handleModelSelectOpenChange}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openModelSelect}
                    className={settingsDropdownClassName}
                  >
                    <span className="truncate text-sm font-medium text-gray-900">
                      {(() => {
                        if (!currentModel) return "Select a model";
                        const selectedModel = modelOptions.find(
                          (model) => model.value === currentModel
                        );
                        if (!selectedModel) return currentModel;
                        return selectedModel.label;
                      })()}
                    </span>
                    {openModelSelect ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                    )}
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
                                onInputChange(model.value, currentModelField);
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
                            <span className="text-sm font-medium text-gray-900">
                              {model.label}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </SettingsField>
          ) : null}

          {!currentModel && (!modelsChecked || availableModels.length === 0) && (
            <button
              type="button"
              onClick={fetchAvailableModels}
              disabled={
                modelsLoading ||
                (selectedProvider === "openai" && !currentApiKey) ||
                (selectedProvider === "google" && !currentApiKey) ||
                (selectedProvider === "custom" && !currentCustomUrl)
              }
              className={`w-fit rounded-[48px] border bg-[#EDEEEF] px-3.5 py-2.5 text-xs font-semibold text-[#101323] transition-all duration-200 ${
                modelsLoading
                  ? "cursor-not-allowed border-gray-300 text-gray-500"
                  : "border-[#EDEEEF] hover:bg-[#E8F0FF]/90 focus:ring-2 focus:ring-blue-500/20"
              }`}
            >
              {modelsLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking for models...
                </span>
              ) : (
                "Check models"
              )}
            </button>
          )}
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
