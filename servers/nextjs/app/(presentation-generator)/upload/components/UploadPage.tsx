/**
 * UploadPage Component
 * 
 * This component handles the presentation generation upload process, allowing users to:
 * - Configure presentation settings (slides, language)
 * - Input prompts
 * - Upload supporting documents
 * 
 * @component
 */

"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { clearOutlines, setPresentationId } from "@/store/slices/presentationGeneration";
import { PromptInput } from "./PromptInput";
import { LanguageType, PresentationConfig, ToneType, VerbosityType } from "../type";
import SupportingDoc from "./SupportingDoc";
import { notify } from "@/components/ui/sonner";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import Wrapper from "@/components/Wrapper";
import { setPptGenUploadState } from "@/store/slices/presentationGenUpload";
import { captureError } from "@/utils/posthog";
import { ConfigurationSelects } from "./ConfigurationSelects";
import { RootState } from "@/store/store";
import CurrentConfig from "./CurrentConfig";
import {
  clampSlideCountValue,
  parseLimitedSlideCount,
} from "@/utils/presentationLimits";
import CommunityReferencePicker from "./CommunityReferencePicker";
import {
  CommunityPresentationApi,
  type CommunityPresentation,
} from "../../services/api/community";

type GenerationMode = "smart" | "standard";

// Types for loading state
interface LoadingState {
  isLoading: boolean;
  message: string;
  duration?: number;
  showProgress?: boolean;
  extra_info?: string;
}

const getDocumentPaths = (files: unknown): string[] => {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .flat()
    .map((file) =>
      file && typeof file === "object" && "file_path" in file
        ? (file as { file_path?: unknown }).file_path
        : null
    )
    .filter((filePath): filePath is string => typeof filePath === "string");
};

const UploadPage = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

  const [files, setFiles] = useState<File[]>([]);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("standard");
  const [communityReference, setCommunityReference] =
    useState<CommunityPresentation | null>(null);
  const [config, setConfig] = useState<PresentationConfig>({
    slides: null,
    language: LanguageType.Auto,
    prompt: "",
    tone: ToneType.Default,
    verbosity: VerbosityType.Standard,
    instructions: "",
    includeTableOfContents: false,
    includeTitleSlide: false,
    webSearch: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPrompt = params.get("prompt")?.trim();
    const requestedCommunityId = Number(params.get("communityId"));
    let active = true;

    if (params.get("mode") === "smart") {
      setGenerationMode("smart");
    }
    if (requestedPrompt) {
      setConfig((current) => ({ ...current, prompt: requestedPrompt }));
    }
    if (Number.isSafeInteger(requestedCommunityId) && requestedCommunityId > 0) {
      CommunityPresentationApi.getById(requestedCommunityId)
        .then((presentation) => {
          if (!active) return;
          setCommunityReference(presentation);
        })
        .catch((loadError) => {
          if (!active) return;
          notify.error(
            "Could not select the community design",
            loadError instanceof Error ? loadError.message : undefined
          );
        });
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (llmConfig?.WEB_GROUNDING !== undefined) {
      setConfig((current) => ({
        ...current,
        webSearch: !!llmConfig.WEB_GROUNDING,
      }));
    }
  }, [llmConfig?.WEB_GROUNDING]);

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: "",
    duration: 4,
    showProgress: false,
    extra_info: "",
  });

  const handleConfigChange = (key: keyof PresentationConfig, value: unknown) => {
    const nextValue =
      key === "slides" && typeof value === "string"
        ? clampSlideCountValue(value)
        : value;
    setConfig((prev) => ({ ...prev, [key]: nextValue } as PresentationConfig));
  };

  const handleGenerationModeChange = (mode: GenerationMode) => {
    if (mode === generationMode) return;
    setGenerationMode(mode);
  };

  const getGenerationDestination = (presentationId: string) => {
    if (generationMode === "smart") {
      return `/presentation?id=${presentationId}&stream=true&type=smart`;
    }

    const params = new URLSearchParams({ id: presentationId });
    return `/outline?${params.toString()}`;
  };

  const handleCommunityReferenceChange = (
    presentation: CommunityPresentation | null,
  ) => {
    setCommunityReference(presentation);
  };

  /**
   * Validates the current configuration and files
   * @returns boolean indicating if the configuration is valid
   */
  const validateConfiguration = (): boolean => {
    if (!config.language) {
      notify.warning("Language required", "Please select a language.");
      return false;
    }

    if (files.length > 0 && config.language === LanguageType.Auto) {
      notify.warning("Language required", "Please choose a language before processing uploaded documents.");
      return false;
    }

    if (
      !config.prompt.trim() &&
      files.length === 0 &&
      !(generationMode === "smart" && communityReference)
    ) {
      notify.warning(
        "Input required",
        "Provide a prompt, upload a document, or select a community reference."
      );
      return false;
    }
    return true;
  };

  /**
   * Handles the presentation generation process
   */
  const handleGeneratePresentation = async () => {
    if (!validateConfiguration()) return;

    try {
      const hasUploadedAssets = files.length > 0;

      if (hasUploadedAssets) {
        await handleDocumentProcessing();
      } else {
        await handleDirectPresentationGeneration();
      }
    } catch (error) {
      handleGenerationError(error);
    }
  };

  /**
   * Handles document processing
   */
  const handleDocumentProcessing = async () => {
    setLoadingState({
      isLoading: true,
      message: "Processing documents...",
      showProgress: true,
      duration: 90,
      extra_info: files.length > 0 ? "It might take a few minutes for large documents." : "",
    });

    let documents = [];

    if (files.length > 0) {
      const uploadResponse = await PresentationGenerationApi.uploadDoc(files);
      documents = uploadResponse;
    }

    const selectedLanguage = config?.language ?? "";

    const promises: Promise<any>[] = [];

    if (documents.length > 0) {
      promises.push(
        PresentationGenerationApi.decomposeDocuments(
          documents,
          selectedLanguage
        )
      );
    }
    const responses = await Promise.all(promises);
    const documentPaths = getDocumentPaths(responses);

    setLoadingState({
      isLoading: true,
      message:
        generationMode === "smart"
          ? "Starting Smart presentation..."
          : "Generating presentation outline...",
      showProgress: true,
      duration: 40,
      extra_info: "",
    });

    const createResponse = await PresentationGenerationApi.createPresentation({
      content: config?.prompt ?? "",
      version: "v2-standard",
      n_slides: parseLimitedSlideCount(config?.slides),
      file_paths: documentPaths,
      language: selectedLanguage,
      tone: config?.tone,
      verbosity: config?.verbosity,
      instructions: config?.instructions || null,
      include_table_of_contents: !!config?.includeTableOfContents,
      include_title_slide: !!config?.includeTitleSlide,
      web_search: !!config?.webSearch,
      generation_mode: generationMode,
      community_design_ids:
        generationMode === "smart" && communityReference
          ? [communityReference.id]
          : undefined,
    });

    dispatch(setPptGenUploadState({
      config,
      files: responses,
    }));
    dispatch(clearOutlines());
    dispatch(setPresentationId(createResponse.id));
    const destination = getGenerationDestination(createResponse.id);
    router.push(destination);
  };

  /**
   * Handles direct presentation generation without documents
   */
  const handleDirectPresentationGeneration = async () => {
    setLoadingState({
      isLoading: true,
      message:
        generationMode === "smart"
          ? "Starting Smart presentation..."
          : "Preparing outline generation...",
      showProgress: true,
      duration: 30,
    });

    const selectedLanguage = config?.language ?? "";

    // Standard mode continues to outline review; Smart mode streams the deck directly.
    const createResponse = await PresentationGenerationApi.createPresentation({
      content: config?.prompt ?? "",

      n_slides: parseLimitedSlideCount(config?.slides),
      file_paths: [],
      language: selectedLanguage,
      tone: config?.tone,
      verbosity: config?.verbosity,
      instructions: config?.instructions || null,
      include_table_of_contents: !!config?.includeTableOfContents,
      include_title_slide: !!config?.includeTitleSlide,
      web_search: !!config?.webSearch,
      generation_mode: generationMode,
      community_design_ids:
        generationMode === "smart" && communityReference
          ? [communityReference.id]
          : undefined,
    });

    dispatch(setPptGenUploadState({
      config,
      files: [],
    }));
    dispatch(clearOutlines());
    dispatch(setPresentationId(createResponse.id));
    const destination = getGenerationDestination(createResponse.id);
    router.push(destination);
  };

  /**
   * Handles errors during presentation generation
   */
  const handleGenerationError = (error: any) => {
    console.error("Error in upload page", error);
    captureError(error, { operation: "generate" });
    setLoadingState({
      isLoading: false,
      message: "",
      duration: 0,
      showProgress: false,
    });
    notify.error(
      "Generation failed",
      error.message || "Something went wrong while starting your presentation."
    );
  };

  return (
    <Wrapper className="w-full pb-10">
      <OverlayLoader
        show={loadingState.isLoading}
        text={loadingState.message}
        showProgress={loadingState.showProgress}
        duration={loadingState.duration}
        extra_info={loadingState.extra_info}
      />
      <div
        className={`mx-auto max-w-[760px] space-y-[18px] px-4 lg:max-w-[780px] xl:max-w-[900px] min-[1600px]:max-w-[1050px] min-[1920px]:max-w-[1280px] ${
          generationMode === "smart" ? "mb-[75px]" : "mb-8"
        }`}
      >
        <div className="flex min-h-[34px] w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CurrentConfig webSearchEnabled={config.webSearch} />
          </div>
          <ConfigurationSelects
            compact
            mode={generationMode}
            onModeChange={handleGenerationModeChange}
            config={config}
            onConfigChange={handleConfigChange}
          />
        </div>

        <PromptInput
          value={config.prompt}
          variant={generationMode}
          references={
            generationMode === "smart" && communityReference
              ? [{ id: String(communityReference.id), label: communityReference.title || "Community design" }]
              : []
          }
          onRemoveReference={() =>
            handleCommunityReferenceChange(null)
          }
          onChange={(value) => handleConfigChange("prompt", value)}
          onSubmit={handleGeneratePresentation}
          hasAttachments={files.length > 0}
          footer={
            <SupportingDoc
              files={files}
              onFilesChange={setFiles}
              onSubmit={handleGeneratePresentation}
              disabled={loadingState.isLoading}
            />
          }
        />

      </div>

      {generationMode === "smart" && (
        <div className="px-4 sm:px-6">
          <CommunityReferencePicker
            selectedId={communityReference?.id ?? null}
            onSelect={(presentation) =>
              handleCommunityReferenceChange(presentation)
            }
          />
        </div>
      )}
    </Wrapper>
  );
};

export default UploadPage;
