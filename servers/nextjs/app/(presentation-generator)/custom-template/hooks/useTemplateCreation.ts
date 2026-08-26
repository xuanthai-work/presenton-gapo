import { useState, useCallback, useRef } from "react";
import { notify } from "@/components/ui/sonner";
import { getHeader, getHeaderForFormData } from "@/app/(presentation-generator)/services/api/header";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import {
    TemplateCreationState,
    FontData,
    FontUploadPreviewResponse,
    UploadedFont,
    ProcessedSlide,
    TemplateV2Layout,
    TemplateCreationMetadata,
} from "../types";
import { getApiUrl } from "@/utils/api";
import { captureError } from "@/utils/posthog";

const TEMPLATE_V2_LAYOUT_BATCH_SIZE = 1;
const MAX_PROCESSING_PROGRESS_PERCENT = 95;

type CreatedTemplateV2Layout = { index: number; layout: TemplateV2Layout };
type FailedTemplateV2Layout = { index: number; error: string };
type GoogleFontReplacement = { fontName: string; fontUrl: string };

const initialState: TemplateCreationState = {
    step: 'file-upload',
    isLoading: false,
    error: null,
    fontsData: null,
    previewData: null,
    templateId: null,
    totalSlides: 0,
    currentSlideIndex: 0,
};

function normalizeTemplateMetadata(
    metadata?: TemplateCreationMetadata | null
): TemplateCreationMetadata | null {
    const name = metadata?.name?.trim();
    if (!name) return null;

    const description = metadata?.description?.trim();
    return {
        name,
        ...(description ? { description } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTemplateV2InitId(value: unknown): string | null {
    if (typeof value === "string" && value) {
        return value;
    }
    if (isRecord(value) && typeof value.id === "string" && value.id) {
        return value.id;
    }
    return null;
}

function extractCreatedTemplateV2Layouts(
    value: unknown
): CreatedTemplateV2Layout[] {
    const rawLayouts = isRecord(value) && Array.isArray(value.layouts)
        ? value.layouts
        : [];

    return rawLayouts.flatMap((item) => {
        if (!isRecord(item) || !Number.isInteger(item.index) || !isRecord(item.layout)) {
            return [];
        }
        return [{ index: item.index as number, layout: item.layout as TemplateV2Layout }];
    });
}

function templateV2SlideFromLayout(
    slide: ProcessedSlide,
    layout: TemplateV2Layout,
    templateId: string,
    index: number
): ProcessedSlide {
    const layoutId = typeof layout.id === "string" ? layout.id : null;
    const layoutDescription = typeof layout.description === "string"
        ? layout.description
        : "Generated with Templates V2";

    return {
        ...slide,
        processing: false,
        processed: true,
        error: undefined,
        v2Layout: layout,
        template_v2_id: templateId,
        layout_id: layoutId || `slide_${index + 1}`,
        layout_name: layoutId || `Slide ${index + 1}`,
        layout_description: layoutDescription,
    };
}

function templateV2LayoutBatches(totalSlides: number): number[][] {
    const batches: number[][] = [];
    for (let start = 0; start < totalSlides; start += TEMPLATE_V2_LAYOUT_BATCH_SIZE) {
        const end = Math.min(start + TEMPLATE_V2_LAYOUT_BATCH_SIZE, totalSlides);
        batches.push(Array.from({ length: end - start }, (_, offset) => start + offset));
    }
    return batches;
}

function errorMessageFromUnknown(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export const useTemplateCreation = () => {
    const [state, setState] = useState<TemplateCreationState>(initialState);
    const [uploadedFonts, setUploadedFonts] = useState<UploadedFont[]>([]);
    const [slides, setSlides] = useState<ProcessedSlide[]>([]);
    const templateMetadataRef = useRef<TemplateCreationMetadata | null>(null);

    // Helper to update state partially
    const updateState = useCallback((updates: Partial<TemplateCreationState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // Reset to initial state
    const reset = useCallback(() => {
        setState(initialState);
        setUploadedFonts([]);
        setSlides([]);
        templateMetadataRef.current = null;
    }, []);

    // Step 1: Check fonts in PPTX file
    const checkFonts = useCallback(async (pptxFile: File): Promise<FontData | null> => {
        updateState({ isLoading: true, error: null });

        try {
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            const response = await fetch(getApiUrl(`/api/v1/ppt/fonts/check`), {
                method: "POST",
                headers: getHeaderForFormData(),
                body: formData,
            });

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to check fonts in the presentation"
            );

            updateState({
                fontsData: data,
                step: 'font-check',
                isLoading: false
            });

            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Font check failed";
            updateState({ error: errorMessage, isLoading: false });
            notify.error("Font check failed", errorMessage);
            return null;
        }
    }, [updateState]);


    const uploadFont = useCallback((fontName: string, file: File): string | null => {
        // Check if font is already added
        const existingFont = uploadedFonts.find((f) => f.fontName === fontName);
        if (existingFont) {
            notify.warning("Font already added", `Font "${fontName}" is already in your upload list.`);
            return fontName;
        }

        // Validate file type
        const validExtensions = [".ttf", ".otf", ".woff", ".woff2", ".eot"];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));

        if (!validExtensions.includes(fileExtension)) {
            notify.error("Invalid font file", "Please upload .ttf, .otf, .woff, .woff2, or .eot files.");
            return null;
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            notify.error("File too large", "Font file size must be less than 10MB.");
            return null;
        }

        // Store font locally
        const newFont: UploadedFont = {
            fontName: fontName,
            fontUrl: '', // Will be set after upload
            fontPath: '',
            file: file,
        };

        setUploadedFonts(prev => [...prev, newFont]);
        notify.success("Font added", `Font "${fontName}" was added successfully.`);
        return fontName;
    }, [uploadedFonts]);

    // Remove a font
    const removeFont = useCallback((fontName: string) => {
        setUploadedFonts(prev => prev.filter(font => font.fontName !== fontName));
        notify.info("Font removed", "The font was removed from your upload list.");
    }, []);

    // Get all unsupported fonts that need upload
    const getUnsupportedFonts = useCallback((): string[] => {
        if (!state.fontsData?.unavailable_fonts) {
            return [];
        }
        return state.fontsData.unavailable_fonts
            .map((font) => font.name)
            .filter(
                (fontName) =>
                    !uploadedFonts.some(
                        (uploaded) =>
                            uploaded.fontName === fontName ||
                            uploaded.fontName ===
                                state.fontsData?.unavailable_fonts.find(
                                    (f) => f.name === fontName
                                )?.original_name
                    )
            );
    }, [state.fontsData, uploadedFonts]);

    // Check if all required fonts are uploaded
    const allFontsUploaded = useCallback((): boolean => {
        return getUnsupportedFonts().length === 0;
    }, [getUnsupportedFonts]);

    // Step 2: Upload fonts and get slide preview
    const fontUploadAndPreview = useCallback(async (
        pptxFile: File,
        googleFontReplacementsByOriginalName: Record<string, GoogleFontReplacement> = {}
    ): Promise<FontUploadPreviewResponse | null> => {
        updateState({ isLoading: true, error: null, step: 'font-upload' });

        try {
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            // Add uploaded font files (actual File objects)
            uploadedFonts.forEach(font => {
                formData.append("font_files", font.file);
                formData.append("original_font_names", font.fontName);
            });
            Object.entries(googleFontReplacementsByOriginalName).forEach(
                ([originalFontName, googleFont]) => {
                    formData.append("google_font_original_names", originalFontName);
                    formData.append("google_font_replacement_names", googleFont.fontName);
                    formData.append("google_font_urls", googleFont.fontUrl);
                }
            );

            const response = await fetch(
                getApiUrl(`/api/v1/ppt/template/fonts-upload-and-slides-preview`),
                {
                    method: "POST",
                    headers: getHeaderForFormData(),
                    body: formData,
                }
            );

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to upload fonts and preview slides"
            );

            updateState({
                previewData: data,
                step: 'slides-preview',
                isLoading: false
            });

            notify.success("Document prepared", "Template generation is starting now.");
            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Document preparation failed";
            updateState({ error: errorMessage, isLoading: false });
            captureError(error, { operation: "generate" });
            notify.error("Document preparation failed", errorMessage);
            return null;
        }
    }, [getUnsupportedFonts, uploadedFonts, updateState]);

    const saveTemplateV2Layouts = useCallback(async (
        templateId: string,
        layouts: CreatedTemplateV2Layout[]
    ): Promise<void> => {
        if (layouts.length === 0) return;

        try {
            const response = await fetch(
                getApiUrl(`/api/v1/ppt/template/${encodeURIComponent(templateId)}/layouts`),
                {
                    method: "PATCH",
                    headers: getHeader(),
                    body: JSON.stringify({ layouts }),
                }
            );

            await ApiResponseHandler.handleResponse(
                response,
                "Failed to save generated template layouts"
            );
        } catch (error) {
            captureError(error, { operation: "save" });
            throw error;
        }
    }, []);

    const createTemplateV2Layout = useCallback(async (
        templateId: string,
        index: number
    ): Promise<CreatedTemplateV2Layout> => {
        const response = await fetch(getApiUrl("/api/v1/ppt/template/layouts/create"), {
            method: "POST",
            headers: getHeader(),
            body: JSON.stringify({
                template_id: templateId,
                index,
            }),
        });

        const data = await ApiResponseHandler.handleResponse(
            response,
            `Failed to generate template layout for slide ${index + 1}`
        );
        const layout = extractCreatedTemplateV2Layouts(data)
            .find((item) => item.index === index);
        if (!layout) {
            throw new Error("No generated layout was returned for this slide.");
        }
        return layout;
    }, []);

    const createAndSaveTemplateV2Layouts = useCallback(async (
        templateId: string,
        indices: number[],
        options: {
            onLayoutCreated?: (layout: CreatedTemplateV2Layout) => void;
        } = {}
    ): Promise<{ layouts: CreatedTemplateV2Layout[]; failures: FailedTemplateV2Layout[] }> => {
        const layouts: CreatedTemplateV2Layout[] = [];
        const failures: FailedTemplateV2Layout[] = [];

        for (const index of indices) {
            try {
                const layout = await createTemplateV2Layout(templateId, index);
                options.onLayoutCreated?.(layout);
                layouts.push(layout);
            } catch (error) {
                failures.push({
                    index,
                    error: errorMessageFromUnknown(
                        error,
                        "Template layout generation failed"
                    ),
                });
            }
        }

        if (layouts.length > 0) {
            try {
                await saveTemplateV2Layouts(templateId, layouts);
            } catch (error) {
                const saveError = errorMessageFromUnknown(
                    error,
                    "Failed to save generated template layouts"
                );
                return {
                    layouts: [],
                    failures: [
                        ...failures,
                        ...layouts.map((layout) => ({
                            index: layout.index,
                            error: saveError,
                        })),
                    ],
                };
            }
        }

        return { layouts, failures };
    }, [createTemplateV2Layout, saveTemplateV2Layouts]);

    const generateTemplateV2Blocks = useCallback(async (
        templateId: string
    ): Promise<void> => {
        const response = await fetch(getApiUrl("/api/v1/ppt/template/generate-blocks"), {
            method: "POST",
            headers: getHeader(),
            body: JSON.stringify({
                template_id: templateId,
            }),
        });

        await ApiResponseHandler.handleResponse(
            response,
            "Failed to generate template blocks"
        );
    }, []);

    const generateTemplateV2 = useCallback(async (
        previewData: FontUploadPreviewResponse,
        options: {
            retrySlideIndex?: number;
            metadata?: TemplateCreationMetadata | null;
        } = {}
    ): Promise<string | null> => {
        const metadata = normalizeTemplateMetadata(options.metadata)
            ?? templateMetadataRef.current;
        const initialSlides: ProcessedSlide[] = previewData.slide_image_urls.map(
            (url, index) => ({
                slide_number: index + 1,
                screenshot_url: url,
                processing: true,
                processed: false,
                error: undefined,
            })
        );

        setSlides(initialSlides);
        updateState({
            isLoading: true,
            error: null,
            step: 'template-creation',
            totalSlides: initialSlides.length,
            currentSlideIndex: 0,
        });
        try {
            const initResponse = await fetch(getApiUrl("/api/v1/ppt/template/init"), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify({
                    pptx_url: previewData.modified_pptx_url,
                    slide_image_urls: previewData.slide_image_urls,
                    fonts: previewData.fonts,
                    ...(metadata ? { name: metadata.name } : {}),
                    ...(metadata?.description ? { description: metadata.description } : {}),
                }),
            });

            const initData = await ApiResponseHandler.handleResponse(
                initResponse,
                "Failed to initialize template"
            );
            const templateId = readTemplateV2InitId(initData);
            if (!templateId) {
                throw new Error("Template initialization did not return a template id");
            }

            updateState({
                templateId,
                totalSlides: initialSlides.length,
                currentSlideIndex: 0,
            });

            let generatedSlides = initialSlides;
            const commitSlides = (nextSlides: ProcessedSlide[]) => {
                generatedSlides = nextSlides;
                setSlides(nextSlides);
            };
            const updateGeneratedSlides = (
                updater: (currentSlides: ProcessedSlide[]) => ProcessedSlide[]
            ) => {
                commitSlides(updater(generatedSlides));
            };

            for (const indices of templateV2LayoutBatches(initialSlides.length)) {
                updateState({ currentSlideIndex: indices[0] ?? 0 });
                updateGeneratedSlides((currentSlides) =>
                    currentSlides.map((slide, index) =>
                        indices.includes(index)
                            ? {
                                ...slide,
                                processing: true,
                                processed: false,
                                error: undefined,
                            }
                            : slide
                    )
                );

                const { layouts: createdLayouts, failures } =
                    await createAndSaveTemplateV2Layouts(templateId, indices, {
                        onLayoutCreated: (createdLayout) => {
                            updateGeneratedSlides((currentSlides) =>
                                currentSlides.map((slide, index) =>
                                    index === createdLayout.index
                                        ? templateV2SlideFromLayout(
                                            slide,
                                            createdLayout.layout,
                                            templateId,
                                            index
                                        )
                                        : slide
                                )
                            );
                        },
                    });
                const layoutByIndex = new Map(
                    createdLayouts.map((item) => [item.index, item.layout])
                );
                const failureByIndex = new Map(
                    failures.map((item) => [item.index, item.error])
                );
                failures.forEach((failure) => {
                    captureError(failure.error, { operation: "generate" });
                });
                updateGeneratedSlides((currentSlides) =>
                    currentSlides.map((slide, index) => {
                        if (!indices.includes(index)) return slide;

                        const failure = failureByIndex.get(index);
                        if (failure) {
                            return {
                                ...slide,
                                processing: false,
                                processed: false,
                                error: failure,
                            };
                        }

                        const layout = layoutByIndex.get(index);
                        if (!layout) {
                            return {
                                ...slide,
                                processing: false,
                                processed: false,
                                error: "No generated layout was returned for this slide.",
                            };
                        }
                        return templateV2SlideFromLayout(
                            slide,
                            layout,
                            templateId,
                            index
                        );
                    })
                );
            }

            const failedCount = generatedSlides.filter((slide) => Boolean(slide.error)).length;
            const processedCount = generatedSlides.filter((slide) => slide.processed).length;
            let blocksError: string | null = null;
            if (processedCount > 0) {
                try {
                    await generateTemplateV2Blocks(templateId);
                } catch (error) {
                    blocksError = errorMessageFromUnknown(
                        error,
                        "Failed to generate template blocks"
                    );
                    captureError(error, { operation: "generate" });
                    updateState({ error: blocksError });
                }
            }

            updateState({
                step: 'completed',
                isLoading: false,
            });

            if (failedCount > 0) {
                notify.warning(
                    "Some slides could not be generated",
                    `${processedCount} of ${generatedSlides.length} slides were generated.`
                );
            } else if (blocksError) {
                notify.warning(
                    "Template generated",
                    `Slides were saved, but template blocks were not generated. ${blocksError}`
                );
            } else {
                notify.success(
                    "Template generated",
                    "The template was generated and saved successfully."
                );
            }

            return templateId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Template generation failed";
            updateState({ error: errorMessage, isLoading: false });
            captureError(error, { operation: "generate" });
            setSlides((current) =>
                (current.length ? current : initialSlides).map((slide) => ({
                    ...slide,
                    processing: false,
                    processed: false,
                    error: errorMessage,
                }))
            );
            notify.error("Generation failed", errorMessage);
            return null;
        }
    }, [
        createAndSaveTemplateV2Layouts,
        generateTemplateV2Blocks,
        state.templateId,
        updateState,
    ]);

    // Step 3: Initialize template creation
    const initTemplateCreation = useCallback(async (
        metadata?: TemplateCreationMetadata,
        previewDataOverride?: FontUploadPreviewResponse
    ): Promise<string | null> => {
        const previewData = previewDataOverride ?? state.previewData;
        if (!previewData) {
            notify.error("No preview data", "Prepare the document before continuing.");
            return null;
        }

        const normalizedMetadata = normalizeTemplateMetadata(metadata);
        if (normalizedMetadata) {
            templateMetadataRef.current = normalizedMetadata;
        }

        return generateTemplateV2(previewData, {
            metadata: normalizedMetadata,
        });
    }, [
        generateTemplateV2,
        state.previewData,
    ]);

    // Reconstruct a single slide (no auto-advance)
    const retrySlide = useCallback((slideIndex: number) => {
        if (!state.templateId) {
            notify.error("Template unavailable", "Initialize the template before trying again.");
            return;
        }

        const templateId = state.templateId;
        updateState({ currentSlideIndex: slideIndex });
        setSlides((current) =>
            current.map((slide, index) =>
                index === slideIndex
                    ? {
                        ...slide,
                        processing: true,
                        processed: false,
                        error: undefined,
                    }
                    : slide
            )
        );

        void (async () => {
            try {
                const { layouts: createdLayouts, failures } = await createAndSaveTemplateV2Layouts(
                    templateId,
                    [slideIndex]
                );
                const failure = failures.find((item) => item.index === slideIndex);
                if (failure) {
                    throw new Error(failure.error);
                }
                const layout = createdLayouts.find((item) => item.index === slideIndex)?.layout;
                if (!layout) {
                    throw new Error("No generated layout was returned for this slide.");
                }
                setSlides((current) =>
                    current.map((slide, index) =>
                        index === slideIndex
                            ? templateV2SlideFromLayout(slide, layout, templateId, index)
                            : slide
                    )
                );
                notify.success(
                    "Slide regenerated",
                    `Slide ${slideIndex + 1} was regenerated successfully.`
                );
            } catch (error) {
                const errorMessage = error instanceof Error
                    ? error.message
                    : "Template layout generation failed";
                captureError(error, { operation: "generate" });
                setSlides((current) =>
                    current.map((slide, index) =>
                        index === slideIndex
                            ? {
                                ...slide,
                                processing: false,
                                processed: false,
                                error: errorMessage,
                            }
                            : slide
                    )
                );
                notify.error(`Slide ${slideIndex + 1} failed`, errorMessage);
            }
        })();
    }, [
        createAndSaveTemplateV2Layouts,
        state.templateId,
        updateState,
    ]);

    // Move to font upload step (when font check is done)
    const proceedToFontUpload = useCallback(() => {
        updateState({ step: 'font-upload' });
    }, [updateState]);

    // Calculate progress
    const completedSlides = slides.filter(s => s.processed || s.error).length;
    const progressPercentage = state.totalSlides > 0
        ? Math.min(
            MAX_PROCESSING_PROGRESS_PERCENT,
            Math.round((completedSlides / state.totalSlides) * 100)
        )
        : 0;

    return {
        // State
        state,
        uploadedFonts,
        slides,
        setSlides,

        // Progress
        completedSlides,
        progressPercentage,

        // Font operations
        checkFonts,
        uploadFont,
        removeFont,
        getUnsupportedFonts,
        allFontsUploaded,

        // Template creation operations
        fontUploadAndPreview,
        initTemplateCreation,
        retrySlide,

        // Navigation
        proceedToFontUpload,
        reset,
        updateState,
    };
};
