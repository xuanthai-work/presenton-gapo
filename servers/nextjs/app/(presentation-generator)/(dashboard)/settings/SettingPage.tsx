"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { notify } from "@/components/ui/sonner";
import { GSlideButton, GSlideHeader } from "@/components/gslide";
import { RootState } from "@/store/store";
import { useSelector } from "react-redux";
import {
  getLLMConfigValidationError,
  handleSaveLLMConfig,
} from "@/utils/storeHelpers";
import { useRouter, usePathname } from "next/navigation";
import { LLMConfig } from "@/types/llm_config";
import { captureError } from "@/utils/posthog";
import SettingSideBar, { SettingsSection } from "./SettingSideBar";
import TextProvider from "./TextProvider";
import ImageProvider from "./ImageProvider";
import WebSearchProvider from "./WebSearchProvider";
import PrivacySettings from "./PrivacySettings";
import {
  IMAGE_PROVIDERS,
  LLM_PROVIDERS,
  WEB_SEARCH_PROVIDERS,
} from "@/utils/providerConstants";
import LogoutButton from "@/components/Auth/LogoutButton";
import AdminPanel from "../admin/AdminPanel";

// Button state interface
interface ButtonState {
  isLoading: boolean;
  isDisabled: boolean;
  text: string;
  showProgress: boolean;
  progressPercentage?: number;
  status?: string;
}

const SettingsPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedProvider, setSelectedProvider] = useState<SettingsSection>("text-provider");
  const userConfigState = useSelector((state: RootState) => state.userConfig);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(
    userConfigState.llm_config
  );
  const canChangeKeys = userConfigState.can_change_keys;
  const [buttonState, setButtonState] = useState<ButtonState>({
    isLoading: false,
    isDisabled: false,
    text: "Save",
    showProgress: false,
  });

  const handleTextProviderInputChange = useCallback(
    (value: string | boolean, field: string) => {
      setLlmConfig((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  useEffect(() => {
    setLlmConfig(userConfigState.llm_config);
  }, [userConfigState.llm_config]);

  const selectSettingsSection = (section: SettingsSection) => {
    setSelectedProvider(section);
  };

  const handleSaveConfig = async () => {

    const validationError = getLLMConfigValidationError(llmConfig);
    if (validationError) {
      notify.warning("Cannot save settings", validationError);
      if (
        selectedProvider === "image-provider" &&
        ((llmConfig.LLM === "openai" && !String(llmConfig.OPENAI_MODEL || "").trim()))
      ) {
        setSelectedProvider("text-provider");
      }
      return;
    }

    try {
      setButtonState((prev) => ({
        ...prev,
        isLoading: true,
        isDisabled: true,
        text: "Saving...",
      }));
      await handleSaveLLMConfig(llmConfig);
      notify.success(
        "Settings saved",
        "Your configuration was saved successfully."
      );
      setButtonState((prev) => ({
        ...prev,
        isLoading: false,
        isDisabled: false,
        text: "Save",
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while saving.";
      captureError(error, { operation: "save" });
      notify.error("Could not save settings", message);
      setButtonState((prev) => ({
        ...prev,
        isLoading: false,
        isDisabled: false,
        text: "Save",
      }));
    }
  };

  useEffect(() => {
    if (!canChangeKeys) {
      router.push("/dashboard");
    }
  }, [canChangeKeys, router]);

  if (!canChangeKeys) {
    return null;
  }

  const textProviderKey = llmConfig.LLM || "openai";
  const textProviderLabel =
    LLM_PROVIDERS[textProviderKey]?.label || textProviderKey;
  const selectedTextModel =
    textProviderKey === "openai"
        ? llmConfig.OPENAI_MODEL
        : textProviderKey === "google"
          ? llmConfig.GOOGLE_MODEL
          : textProviderKey === "custom"
            ? llmConfig.CUSTOM_MODEL
            : "";
  const textSummary = selectedTextModel
    ? `${textProviderLabel} (${selectedTextModel})`
    : textProviderLabel;

  const imageSummary = llmConfig.DISABLE_IMAGE_GENERATION
      ? "Image generation disabled"
      : llmConfig.IMAGE_PROVIDER
        ? IMAGE_PROVIDERS[llmConfig.IMAGE_PROVIDER]?.label ||
        llmConfig.IMAGE_PROVIDER
        : "No image provider";
  const webSearchProviderKey = (llmConfig.WEB_SEARCH_PROVIDER || "").toLowerCase();
  const webSearchSummary = llmConfig.WEB_GROUNDING
      ? `Web: ${WEB_SEARCH_PROVIDERS[webSearchProviderKey]?.label || "No provider"}`
      : "Web search disabled";


  useEffect(() => {

    if (
      (llmConfig.LLM === "openai" && !llmConfig.OPENAI_MODEL) ||
      (llmConfig.LLM === "google" && !llmConfig.GOOGLE_MODEL) ||
      (llmConfig.LLM === "custom" && !llmConfig.CUSTOM_MODEL)
    ) {
      const currentUrl = window.location.href;

      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        console.log("beforeunload");
        e.preventDefault();
        e.returnValue = "";
      };

      const handleClick = (e: MouseEvent) => {


        const target = e.target as HTMLElement | null;
        const link = target?.closest("a");

        if (!link) return;

        const href = link.getAttribute("href");
        const targetAttr = link.getAttribute("target");

        if (
          href &&
          href !== "#" &&
          !href.startsWith("javascript:") &&
          targetAttr !== "_blank"
        ) {

          // notify.error("Cannot save settings", "Please select a model for the selected provider");
          e.preventDefault();
          window.history.pushState(null, "", pathname);
        }
      };

      const handlePopState = () => {
        console.log("popstate");
        window.history.pushState(null, "", pathname);
      };

      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("popstate", handlePopState);
      document.addEventListener("click", handleClick, true);

      // keep current page in history
      window.history.pushState(null, "", currentUrl);

      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("popstate", handlePopState);
        document.removeEventListener("click", handleClick, true);
      };
    }

  }, [llmConfig, pathname]);



  const showSave = selectedProvider !== "admin";

  return (
    <div className="flex min-h-[100dvh] flex-col font-syne">
      <GSlideHeader
        title="Settings"
        actions={
          <div className="flex items-center gap-2">
            <LogoutButton
              label="Sign out"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--gslide-border)] bg-[var(--gslide-card)] px-5 py-3 text-xs font-semibold text-[var(--gslide-ink)] transition hover:bg-[var(--gslide-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            {showSave ? (
              <GSlideButton
                className="inline-flex items-center"
                onClick={handleSaveConfig}
                disabled={buttonState.isDisabled}
              >
                {buttonState.isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {buttonState.text}
                  </span>
                ) : (
                  buttonState.text
                )}
              </GSlideButton>
            ) : null}
          </div>
        }
      />

      <div className="mx-7 pb-16">
        <SettingSideBar
          selectedProvider={selectedProvider}
          setSelectedProvider={selectSettingsSection}
        />
        <p className="mt-4 text-xs text-[var(--gslide-muted)]">
          {textSummary}, {imageSummary}, {webSearchSummary}
        </p>

        <div className={selectedProvider === "admin" ? "mt-8 w-full" : "mt-8 max-w-3xl"}>
          {selectedProvider === "text-provider" && (
            <TextProvider
              onInputChange={handleTextProviderInputChange}
              llmConfig={llmConfig}
            />
          )}
          {selectedProvider === "image-provider" && (
            <ImageProvider llmConfig={llmConfig} setLlmConfig={setLlmConfig} />
          )}
          {selectedProvider === "web-search-provider" && (
            <WebSearchProvider
              llmConfig={llmConfig}
              setLlmConfig={setLlmConfig}
            />
          )}
          {selectedProvider === "privacy" && <PrivacySettings />}
          {selectedProvider === "admin" && <AdminPanel embedded />}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
