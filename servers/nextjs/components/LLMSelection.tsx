"use client";
import { useState, useEffect } from "react";
import OpenAIConfig from "./OpenAIConfig";
import GoogleConfig from "./GoogleConfig";
import CustomConfig from "./CustomConfig";
import {
  updateLLMConfig,
  changeProvider as changeProviderUtil,
} from "@/utils/providerUtils";
import { LLMConfig } from "@/types/llm_config";
import ImageSelectionConfig from "./ImageSelectionConfig";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


// Button state interface
interface ButtonState {
  isLoading: boolean;
  isDisabled: boolean;
  text: string;
  showProgress: boolean;
  progressPercentage?: number;
  status?: string;
}

interface LLMProviderSelectionProps {
  initialLLMConfig: LLMConfig;
  onConfigChange: (config: LLMConfig) => void;
  buttonState: ButtonState;
  setButtonState: (
    state: ButtonState | ((prev: ButtonState) => ButtonState)
  ) => void;
}


export default function LLMProviderSelection({
  initialLLMConfig,
  onConfigChange,
  setButtonState,
}: LLMProviderSelectionProps) {
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(initialLLMConfig);
  const [openImageProviderSelect, setOpenImageProviderSelect] = useState(false);
  const isImageGenerationDisabled = llmConfig.DISABLE_IMAGE_GENERATION ?? false;
  useEffect(() => {
    onConfigChange(llmConfig);
  }, [llmConfig]);

  useEffect(() => {
    const needsModelSelection =
      (llmConfig.LLM === "openai" && !llmConfig.OPENAI_MODEL) ||
      (llmConfig.LLM === "google" && !llmConfig.GOOGLE_MODEL) ||
      (llmConfig.LLM === "custom" && !llmConfig.CUSTOM_MODEL);

    const needsProviderApiKey =
      (llmConfig.LLM === "openai" && !llmConfig.OPENAI_API_KEY) ||
      (llmConfig.LLM === "google" && !llmConfig.GOOGLE_API_KEY);

    const needsImageProviderApiKey =
      !llmConfig.DISABLE_IMAGE_GENERATION &&
      ((llmConfig.IMAGE_PROVIDER === "gpt-image-1.5" &&
        !llmConfig.OPENAI_API_KEY) ||
        (llmConfig.IMAGE_PROVIDER === "gemini_flash" &&
          !llmConfig.GOOGLE_API_KEY) ||
        (llmConfig.IMAGE_PROVIDER === "nanobanana_pro" &&
          !llmConfig.GOOGLE_API_KEY));

    const needsApiKey = needsProviderApiKey || needsImageProviderApiKey;

    const needsOpenAICompatImageConfig =
      !llmConfig.DISABLE_IMAGE_GENERATION &&
      llmConfig.IMAGE_PROVIDER === "openai_compatible" &&
      (!llmConfig.OPENAI_COMPAT_IMAGE_BASE_URL?.trim() ||
        !llmConfig.OPENAI_COMPAT_IMAGE_API_KEY?.trim() ||
        !llmConfig.OPENAI_COMPAT_IMAGE_MODEL?.trim());

    setButtonState({
      isLoading: false,
      isDisabled:
        needsModelSelection ||
        needsApiKey ||
        needsOpenAICompatImageConfig,
      text: needsModelSelection
        ? "Please Select a Model"
        : needsApiKey
          ? "Please Enter API Key"
          : needsOpenAICompatImageConfig
            ? "Please Configure Custom Image API"
            : "Save Configuration",
      showProgress: false,
    });
  }, [llmConfig]);

  const input_field_changed = (new_value: string | boolean, field: string) => {
    const updatedConfig = updateLLMConfig(llmConfig, field, new_value);
    setLlmConfig(updatedConfig);
  };

  const handleProviderChange = (provider: string) => {
    const newConfig = changeProviderUtil(llmConfig, provider);
    setLlmConfig(newConfig);
  };

  useEffect(() => {
    setLlmConfig((prevConfig) => {
      const updates: Partial<LLMConfig> = {};

      if (!prevConfig.DISABLE_IMAGE_GENERATION && !prevConfig.IMAGE_PROVIDER) {
        if (prevConfig.LLM === "openai") {
          updates.IMAGE_PROVIDER = "gpt-image-1.5";
        } else if (prevConfig.LLM === "google") {
          updates.IMAGE_PROVIDER = "gemini_flash";
        } else {
          updates.IMAGE_PROVIDER = "openai_compatible";
        }
      }

      if (Object.keys(updates).length === 0) {
        return prevConfig;
      }

      return { ...prevConfig, ...updates };
    });
  }, []);

  useEffect(() => {
    setLlmConfig((prevConfig) => {
      const updates: Partial<LLMConfig> = {};

      if (
        prevConfig.IMAGE_PROVIDER === "gpt-image-1.5" &&
        !prevConfig.GPT_IMAGE_1_5_QUALITY
      ) {
        updates.GPT_IMAGE_1_5_QUALITY = "medium";
      }

      if (Object.keys(updates).length === 0) {
        return prevConfig;
      }

      return { ...prevConfig, ...updates };
    });
  }, [llmConfig.IMAGE_PROVIDER]);



  return (
    <div className="h-full flex flex-col mt-10">
      {/* Provider Selection - Fixed Header */}
      <div className="p-2 rounded-2xl border border-gray-200">
        <Tabs
          value={llmConfig.LLM || "openai"}
          onValueChange={handleProviderChange}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 bg-transparent h-10">
            <TabsTrigger value="openai">OpenAI</TabsTrigger>
            <TabsTrigger value="google">Google</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 pt-0 custom_scrollbar">
        <Tabs
          value={llmConfig.LLM || "openai"}
          onValueChange={handleProviderChange}
          className="w-full"
        >
          {/* OpenAI Content */}
          <TabsContent value="openai" className="mt-6">
            <OpenAIConfig
              llmConfig={llmConfig}
              openaiApiKey={llmConfig.OPENAI_API_KEY || ""}
              openaiModel={llmConfig.OPENAI_MODEL || ""}
              webGrounding={llmConfig.WEB_GROUNDING || false}
              onInputChange={input_field_changed}
            />
          </TabsContent>

          {/* Google Content */}
          <TabsContent value="google" className="mt-6">
            <GoogleConfig
              googleApiKey={llmConfig.GOOGLE_API_KEY || ""}
              googleModel={llmConfig.GOOGLE_MODEL || ""}
              webGrounding={llmConfig.WEB_GROUNDING || false}
              onInputChange={input_field_changed}
            />
          </TabsContent>

          {/* Custom Content */}
          <TabsContent value="custom" className="mt-6">
            <CustomConfig
              customLlmUrl={llmConfig.CUSTOM_LLM_URL || ""}
              customLlmApiKey={llmConfig.CUSTOM_LLM_API_KEY || ""}
              customModel={llmConfig.CUSTOM_MODEL || ""}
              disableThinking={llmConfig.DISABLE_THINKING || false}
              onInputChange={input_field_changed}
            />
          </TabsContent>
        </Tabs>

        {/* Image Generation Toggle */}
        <ImageSelectionConfig
          isImageGenerationDisabled={isImageGenerationDisabled}
          openImageProviderSelect={openImageProviderSelect}
          setOpenImageProviderSelect={setOpenImageProviderSelect}
          llmConfig={llmConfig}
          input_field_changed={input_field_changed}
        />
      </div>
    </div>
  );
}