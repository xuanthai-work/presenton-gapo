import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { ArrowUpRight, Check, ChevronLeft, ChevronUp, Eye, EyeOff, Info, Loader2, Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { GPT_IMAGE_1_5_QUALITY_OPTIONS, IMAGE_PROVIDERS, LLM_PROVIDERS, WEB_SEARCH_PROVIDERS } from '@/utils/providerConstants';
import { cn } from '@/lib/utils';
import { LLMConfig } from '@/types/llm_config';
import { RootState } from '@/store/store';
import { useSelector } from 'react-redux';
import { notify } from '@/components/ui/sonner';
import ToolTip from '../ToolTip';
import { Switch } from '../ui/switch';
import { Select, SelectItem, SelectContent, SelectValue, SelectTrigger } from '../ui/select';
import { MixpanelEvent, trackEvent } from '@/utils/mixpanel';
import { usePathname } from 'next/navigation';
import { getLLMConfigValidationError, handleSaveLLMConfig } from '@/utils/storeHelpers';
import { getApiErrorMessage, getApiUrl } from '@/utils/api';
import OpenAICompatibleImageFields from '@/components/OpenAICompatibleImageFields';

const TEXT_PROVIDERS = Object.values(LLM_PROVIDERS).filter(
    (provider) => ['openai', 'google', 'custom'].includes(provider.value)
);
const TEXT_PROVIDER_VALUES = new Set(TEXT_PROVIDERS.map((provider) => provider.value));

const WEB_SEARCH_PROVIDER_OPTIONS = [
    WEB_SEARCH_PROVIDERS.auto,
    WEB_SEARCH_PROVIDERS.tavily,
    WEB_SEARCH_PROVIDERS.exa,
    WEB_SEARCH_PROVIDERS.brave,
];

const PresentonMode = ({
    providerStep,
    setStep,
    setProviderStep,
}: {
    providerStep: number,
    setStep: (step: number) => void,
    setProviderStep: (step: number) => void,
}) => {
    const pathname = usePathname();
    const userConfigState = useSelector((state: RootState) => state.userConfig);
    const [openProviderSelect, setOpenProviderSelect] = useState(false);

    const [showApiKey, setShowApiKey] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [openModelSelect, setOpenModelSelect] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsChecked, setModelsChecked] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [llmConfig, setLlmConfig] = useState<LLMConfig>(
        userConfigState.llm_config
    );
    const llmConfigRef = useRef(llmConfig);
    const isActiveTextProvider = TEXT_PROVIDER_VALUES.has(llmConfig.LLM || "");

    const handleProviderChange = (provider: string) => {
        trackEvent(MixpanelEvent.Onboarding_Text_Provider_Selected, {
            provider,
            provider_label: LLM_PROVIDERS[provider]?.label || provider,
            selection_source: "provider_control",
        });
        setLlmConfig(prev => ({
            ...prev,
            LLM: provider,
        }));
        setOpenProviderSelect(false);
        setAvailableModels([]);
        setModelsChecked(false);
        if (currentModelField) {
            setLlmConfig(prev => ({
                ...prev,
                [currentModelField]: ''
            }));
        }
    };

    const currentModelField = useMemo(() => {
        switch (llmConfig.LLM) {
            case 'openai':
                return 'OPENAI_MODEL';
            case 'google':
                return 'GOOGLE_MODEL';
            case 'custom':
                return 'CUSTOM_MODEL';
            default:
                return '';
        }
    }, [llmConfig.LLM]);
    const currentApiKeyField = useMemo(() => {
        switch (llmConfig.LLM) {
            case 'openai':
                return 'OPENAI_API_KEY';
            case 'google':
                return 'GOOGLE_API_KEY';
            case 'custom':
                return 'CUSTOM_LLM_API_KEY';
            default:
                return '';
        }
    }, [llmConfig.LLM]);



    const getFieldValue = (field?: string) => {
        if (!field) return "";
        return (llmConfig as Record<string, string | undefined>)[field] || "";
    };

    const currentApiKey = currentApiKeyField ? ((llmConfig as Record<string, unknown>)[currentApiKeyField] as string || '') : '';
    const currentModel = currentModelField ? ((llmConfig as Record<string, unknown>)[currentModelField] as string || '') : '';
    const providerApiKeyLabel =
        llmConfig.LLM === 'custom'
            ? 'Custom LLM API Key'
            : `${llmConfig.LLM} API Key`;

    const getSelectedTextModel = (config: LLMConfig): string => {
        switch (config.LLM) {
            case 'openai':
                return config.OPENAI_MODEL || '';
            case 'google':
                return config.GOOGLE_MODEL || '';
            case 'custom':
                return config.CUSTOM_MODEL || '';
            default:
                return '';
        }
    };

    const getSelectedImageQuality = (config: LLMConfig): string => {
        if (config.IMAGE_PROVIDER === 'gpt-image-1.5') return config.GPT_IMAGE_1_5_QUALITY || '';
        return '';
    };

    const fetchAvailableModels = async () => {
        if (llmConfig.LLM === 'openai' && !currentApiKey) return;
        if (llmConfig.LLM === 'google' && !currentApiKey) return;
        if (llmConfig.LLM === 'custom' && !llmConfig.CUSTOM_LLM_URL) return;
        setModelsLoading(true);
        try {
            let response: Response;
            if (llmConfig.LLM === 'google') {
                response = await fetch(getApiUrl('/api/v1/ppt/google/models/available'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        api_key: currentApiKey
                    }),
                });
            } else {
                const openAiCompatibleUrl =
                    llmConfig.LLM === 'custom'
                        ? llmConfig.CUSTOM_LLM_URL
                        : LLM_PROVIDERS[llmConfig.LLM!]?.url || '';
                response = await fetch(getApiUrl('/api/v1/ppt/openai/models/available'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        url: openAiCompatibleUrl,
                        api_key: currentApiKey
                    }),
                });
            }

            if (response.ok) {
                const data = await response.json();
                const normalizedModels: string[] = Array.isArray(data) ? data : [];

                setAvailableModels(normalizedModels);
                setModelsChecked(true);

                if (normalizedModels.length > 0 && currentModelField) {
                    if (llmConfig[currentModelField] && normalizedModels.includes(llmConfig[currentModelField])) {
                        setLlmConfig(prev => ({
                            ...prev,
                            [currentModelField]: llmConfig[currentModelField]
                        }));
                        return;
                    }

                    const preferredDefault =
                        llmConfig.LLM === 'openai'
                            ? 'gpt-4.1'
                            : llmConfig.LLM === 'google'
                                ? 'models/gemini-2.5-flash'
                                : normalizedModels[0];

                    const nextModel = normalizedModels.includes(preferredDefault) ? preferredDefault : normalizedModels[0];
                    setLlmConfig(prev => ({
                        ...prev,
                        [currentModelField]: nextModel
                    }));
                }
            } else {
                const message = await getApiErrorMessage(
                    response,
                    `The server could not list ${LLM_PROVIDERS[llmConfig.LLM!]?.label} models. Check your API key or endpoint and try again.`
                );
                console.error('Failed to fetch models');
                setAvailableModels([]);
                setModelsChecked(true);
                notify.error("Could not load models", message);
            }
        } catch (error) {
            console.error('Error fetching models:', error);
            notify.error(
                "Could not load models",
                error instanceof Error
                    ? error.message
                    : "The server could not list models. Check your API key or endpoint and try again."
            );
            setAvailableModels([]);
            setModelsChecked(true);
        } finally {
            setModelsLoading(false);
        }
    };

    const renderQualitySelector = (llmConfig: LLMConfig) => {
        if (llmConfig.IMAGE_PROVIDER === "gpt-image-1.5") {
            return (
                <div className="w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        GPT Image 1.5 Quality
                    </label>
                    <div className="">
                        <Select
                            value={llmConfig.GPT_IMAGE_1_5_QUALITY || 'low'}
                            onValueChange={(value) => {
                                trackEvent(MixpanelEvent.Onboarding_Image_Quality_Selected, {
                                    image_provider: "gpt-image-1.5",
                                    quality: value,
                                });
                                setLlmConfig((prev) => ({
                                    ...prev,
                                    GPT_IMAGE_1_5_QUALITY: value
                                }));
                            }}
                        >
                            <SelectTrigger

                                className="w-full h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between">
                                <SelectValue placeholder="Select a quality" />
                            </SelectTrigger>
                            <SelectContent>
                                {GPT_IMAGE_1_5_QUALITY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                    </div>
                </div>
            );
        }

        return null;
    };

    const renderSelectedImageProviderConfig = () => {
        if (!llmConfig.IMAGE_PROVIDER || !IMAGE_PROVIDERS[llmConfig.IMAGE_PROVIDER]) return null;

        const provider = IMAGE_PROVIDERS[llmConfig.IMAGE_PROVIDER];

        return (
            <div className="col-span-full rounded-[10px] border border-[#EDEEEF] bg-[#FBFBFD] p-4 shadow-[0_12px_28px_rgba(16,19,35,0.04)]">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-[#191919]">{provider.label} setup</p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                            Configure the selected image provider before continuing.
                        </p>
                    </div>
                    {provider.getApiKeyUrl && (
                        <a
                            href={provider.getApiKeyUrl}
                            target="_blank"
                            className="flex shrink-0 items-center gap-1 rounded-full border border-[#EDEEEF] bg-white px-3 py-1.5 text-xs font-medium text-[#666666] transition-colors hover:border-[#D9D6FE] hover:text-[#7A5AF8]"
                        >
                            Get API Key <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                    )}
                </div>

                <div className="space-y-4">
                    {provider.value === "openai_compatible" ? (
                        <OpenAICompatibleImageFields
                            layout="stacked"
                            baseUrl={llmConfig.OPENAI_COMPAT_IMAGE_BASE_URL || ""}
                            apiKey={llmConfig.OPENAI_COMPAT_IMAGE_API_KEY || ""}
                            model={llmConfig.OPENAI_COMPAT_IMAGE_MODEL || ""}
                            onBaseUrlChange={(v) =>
                                setLlmConfig((prev) => ({
                                    ...prev,
                                    OPENAI_COMPAT_IMAGE_BASE_URL: v,
                                }))
                            }
                            onApiKeyChange={(v) =>
                                setLlmConfig((prev) => ({
                                    ...prev,
                                    OPENAI_COMPAT_IMAGE_API_KEY: v,
                                }))
                            }
                            onModelChange={(v) =>
                                setLlmConfig((prev) => ({
                                    ...prev,
                                    OPENAI_COMPAT_IMAGE_MODEL: v,
                                }))
                            }
                        />
                    ) : (
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                {provider.apiKeyFieldLabel}
                            </label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? "text" : "password"}
                                    placeholder={`Enter your ${provider.apiKeyFieldLabel}`}
                                    className="h-12 w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 outline-none transition-colors focus:border-[#7A5AF8] focus:ring-2 focus:ring-[#7A5AF8]/20"
                                    value={getFieldValue(provider.apiKeyField)}
                                    onChange={(e) => {
                                        setLlmConfig((prev) => ({
                                            ...prev,
                                            [provider.apiKeyField as keyof LLMConfig]: e.target.value
                                        }));
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey((prev) => !prev)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer bg-white px-2 py-1"
                                >
                                    {showApiKey ? <Eye className="h-4 w-4 text-gray-500" /> : <EyeOff className="h-4 w-4 text-gray-500" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {renderQualitySelector(llmConfig)}
                </div>
            </div>
        );
    };

    const handleSaveConfig = async () => {
        try {
            const validationError = getLLMConfigValidationError(llmConfig);
            if (validationError) {
                trackEvent(MixpanelEvent.Onboarding_Validation_Failed, {
                    step_name: "web_search",
                    web_search_enabled: !!llmConfig.WEB_GROUNDING,
                    web_search_provider: llmConfig.WEB_SEARCH_PROVIDER || "auto",
                    validation_error: validationError,
                });
                notify.warning("Cannot save yet", validationError);
                return;
            }
            setSavingConfig(true);

            await handleSaveLLMConfig(llmConfig);
            trackEvent(MixpanelEvent.Onboarding_Configuration_Saved, {
                text_provider: llmConfig.LLM || "",
                image_generation_enabled: !llmConfig.DISABLE_IMAGE_GENERATION,
                image_step_skipped: !!llmConfig.DISABLE_IMAGE_GENERATION,
                image_provider: llmConfig.DISABLE_IMAGE_GENERATION ? "disabled" : llmConfig.IMAGE_PROVIDER || "",
                web_search_enabled: !!llmConfig.WEB_GROUNDING,
                web_search_step_skipped: !llmConfig.WEB_GROUNDING,
                web_search_provider: llmConfig.WEB_GROUNDING ? llmConfig.WEB_SEARCH_PROVIDER || "auto" : "disabled",
            });

            const textProvider = llmConfig.LLM || '';
            const textModel = getSelectedTextModel(llmConfig);
            const imageGenerationEnabled = !llmConfig.DISABLE_IMAGE_GENERATION;
            const imageProvider = imageGenerationEnabled ? (llmConfig.IMAGE_PROVIDER || '') : 'disabled';

            trackEvent(MixpanelEvent.Onboarding_Providers_Models_Selected, {
                pathname,
                text_provider: textProvider,
                text_provider_label: LLM_PROVIDERS[textProvider]?.label || textProvider || '',
                text_model: textModel,
                image_generation_enabled: imageGenerationEnabled,
                image_step_skipped: !imageGenerationEnabled,
                image_provider: imageProvider,
                image_provider_label: imageGenerationEnabled
                    ? (IMAGE_PROVIDERS[imageProvider]?.label || imageProvider || '')
                    : 'Image generation disabled',
                image_quality: imageGenerationEnabled ? getSelectedImageQuality(llmConfig) : '',
                web_search_enabled: !!llmConfig.WEB_GROUNDING,
                web_search_step_skipped: !llmConfig.WEB_GROUNDING,
                web_search_provider: llmConfig.WEB_GROUNDING ? (llmConfig.WEB_SEARCH_PROVIDER || "auto") : "disabled",
            });

            notify.success("Configuration saved", "Your configuration was saved successfully.");
            trackEvent(MixpanelEvent.Onboarding_Step_Continued, {
                from_step: "web_search",
                to_step: "finish",
                web_search_enabled: !!llmConfig.WEB_GROUNDING,
                web_search_step_skipped: !llmConfig.WEB_GROUNDING,
                web_search_provider: llmConfig.WEB_GROUNDING ? llmConfig.WEB_SEARCH_PROVIDER || "auto" : "disabled",
            });
            setStep(3)
            // router.push("/upload");
        } catch (error) {
            notify.error("Could not save configuration", error instanceof Error ? error.message : "Failed to save configuration");

        }
        finally {
            setSavingConfig(false);
        }
    };

    const validateTextProvider = async () => {
        const validationError = getLLMConfigValidationError({
            ...llmConfig,
            DISABLE_IMAGE_GENERATION: true,
            WEB_GROUNDING: false,
        });
        if (validationError) {
            trackEvent(MixpanelEvent.Onboarding_Validation_Failed, {
                step_name: "text_provider",
                provider: llmConfig.LLM || "",
                validation_error: validationError,
            });
            notify.warning("Cannot continue yet", validationError);
            return false;
        }
        return true;
    };

    const handleContinue = async () => {
        if (providerStep === 1) {
            if (await validateTextProvider()) {
                trackEvent(MixpanelEvent.Onboarding_Step_Continued, {
                    from_step: "text_provider",
                    to_step: "image_provider",
                    provider: llmConfig.LLM || "",
                });
                setProviderStep(2);
            }
            return;
        }
        if (providerStep === 2) {
            const validationError = getLLMConfigValidationError({ ...llmConfig, WEB_GROUNDING: false });
            if (validationError) {
                trackEvent(MixpanelEvent.Onboarding_Validation_Failed, {
                    step_name: "image_provider",
                    image_generation_enabled: !llmConfig.DISABLE_IMAGE_GENERATION,
                    image_step_skipped: !!llmConfig.DISABLE_IMAGE_GENERATION,
                    image_provider: llmConfig.IMAGE_PROVIDER || "",
                    validation_error: validationError,
                });
                notify.warning("Cannot continue yet", validationError);
                return;
            }
            trackEvent(MixpanelEvent.Onboarding_Step_Continued, {
                from_step: "image_provider",
                to_step: "web_search",
                image_generation_enabled: !llmConfig.DISABLE_IMAGE_GENERATION,
                image_step_skipped: !!llmConfig.DISABLE_IMAGE_GENERATION,
                image_provider: llmConfig.DISABLE_IMAGE_GENERATION ? "disabled" : llmConfig.IMAGE_PROVIDER || "",
            });
            setProviderStep(3);
            return;
        }
        await handleSaveConfig();
    };

    const handleBack = () => {
        trackEvent(MixpanelEvent.Onboarding_Back_Clicked, {
            from_step: providerStep === 1 ? "text_provider" : providerStep === 2 ? "image_provider" : "web_search",
            to_step: providerStep === 1 ? "text_provider" : providerStep === 2 ? "text_provider" : "image_provider",
            source: "footer_button",
        });
        if (providerStep > 1) {
            setProviderStep(providerStep - 1);
        }
    };

    const selectedWebProvider = WEB_SEARCH_PROVIDER_OPTIONS.find(
        (provider) => provider.value === llmConfig.WEB_SEARCH_PROVIDER
    );

    const renderSelectedWebSearchProviderConfig = () => {
        if (!selectedWebProvider) return null;

        return (
            <div className="col-span-full rounded-[10px] border border-[#EDEEEF] bg-[#FBFBFD] p-4 shadow-[0_12px_28px_rgba(16,19,35,0.04)]">
                <div className="mb-4">
                    <p className="text-sm font-semibold text-[#191919]">{selectedWebProvider.label} setup</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                        {selectedWebProvider.description}
                    </p>
                </div>

                <div className="space-y-4">
                    {selectedWebProvider.value === "auto" && (
                        <div className="rounded-lg border border-[#D9D6FE] bg-[#F4F3FF] p-3 text-xs leading-5 text-[#5146E5]">
                            Presenton will use model-native web grounding when available. If the selected text model does not support it, web search stays off until you choose an external provider.
                        </div>
                    )}

                    {selectedWebProvider.urlField && (
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                {selectedWebProvider.urlLabel}
                            </label>
                            <input
                                type="url"
                                value={getFieldValue(selectedWebProvider.urlField)}
                                onChange={(event) => setLlmConfig(prev => ({ ...prev, [selectedWebProvider.urlField!]: event.target.value }))}
                                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition-colors focus:border-[#7A5AF8] focus:ring-2 focus:ring-[#7A5AF8]/20"
                                placeholder="https://search.example.com"
                            />
                        </div>
                    )}

                    {selectedWebProvider.apiKeyField && (
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                {selectedWebProvider.apiKeyLabel}
                            </label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? "text" : "password"}
                                    value={getFieldValue(selectedWebProvider.apiKeyField)}
                                    onChange={(event) => setLlmConfig(prev => ({ ...prev, [selectedWebProvider.apiKeyField!]: event.target.value }))}
                                    className="h-12 w-full rounded-lg border border-gray-300 px-4 pr-12 outline-none transition-colors focus:border-[#7A5AF8] focus:ring-2 focus:ring-[#7A5AF8]/20"
                                    placeholder={`Enter your ${selectedWebProvider.apiKeyLabel}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(prev => !prev)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer bg-white px-2 py-1"
                                >
                                    {showApiKey ? <Eye className="h-4 w-4 text-gray-500" /> : <EyeOff className="h-4 w-4 text-gray-500" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {selectedWebProvider.value !== "auto" && (
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                Maximum results
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={llmConfig.WEB_SEARCH_MAX_RESULTS || "5"}
                                onChange={(event) => setLlmConfig(prev => ({ ...prev, WEB_SEARCH_MAX_RESULTS: event.target.value }))}
                                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition-colors focus:border-[#7A5AF8] focus:ring-2 focus:ring-[#7A5AF8]/20"
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    useEffect(() => {
        llmConfigRef.current = llmConfig;
    }, [llmConfig]);

    useEffect(() => {
        const config = llmConfigRef.current;
        const stepName =
            providerStep === 1
                ? "text_provider"
                : providerStep === 2
                    ? "image_provider"
                    : "web_search";
        const stepProps =
            providerStep === 1
                ? {
                    provider: config.LLM || "",
                }
                : providerStep === 2
                    ? {
                        image_generation_enabled: !config.DISABLE_IMAGE_GENERATION,
                        image_step_skipped: !!config.DISABLE_IMAGE_GENERATION,
                        image_provider: config.DISABLE_IMAGE_GENERATION ? "disabled" : config.IMAGE_PROVIDER || "",
                    }
                    : {
                        web_search_enabled: !!config.WEB_GROUNDING,
                        web_search_step_skipped: !config.WEB_GROUNDING,
                        web_search_provider: config.WEB_GROUNDING ? config.WEB_SEARCH_PROVIDER || "auto" : "disabled",
                    };

        trackEvent(MixpanelEvent.Onboarding_Step_Viewed, {
            step_name: stepName,
            step_number: providerStep,
            ...stepProps,
        });
    }, [providerStep]);

    const imageProviderRows = Object.values(IMAGE_PROVIDERS).reduce(
        (rows, provider, index) => {
            if (index % 3 === 0) rows.push([]);
            rows[rows.length - 1].push(provider);
            return rows;
        },
        [] as Array<Array<(typeof IMAGE_PROVIDERS)[keyof typeof IMAGE_PROVIDERS]>>
    );

    const webSearchProviderRows = WEB_SEARCH_PROVIDER_OPTIONS.reduce(
        (rows, provider, index) => {
            if (index % 3 === 0) rows.push([]);
            rows[rows.length - 1].push(provider);
            return rows;
        },
        [] as Array<Array<(typeof WEB_SEARCH_PROVIDER_OPTIONS)[number]>>
    );

    return (
        <div className='w-full max-w-[660px] font-syne pb-10'>
            <p className='px-2.5 py-0.5 w-fit text-[#7A5AF8] rounded-[50px]  border border-[#EDEEEF] text-[10px] font-medium mb-5 font-syne'>PRESENTON</p>
            <div className=''>

                <h2 className='mb-4 text-black text-[26px] font-normal font-unbounded '>
                    {providerStep === 1 ? "Choose how you want to create" : providerStep === 2 ? "Choose your image provider" : "Configure web search"}
                </h2>
                <p className='text-[#000000CC] text-xl font-normal font-syne'>
                    {providerStep === 1
                        ? "Use your Presenton account, or configure your own AI providers."
                        : providerStep === 2
                            ? "Choose how Presenton creates visuals, or continue without image generation."
                            : "Add current web context to presentations, or continue with web search disabled."}
                </p>
            </div>

            <div className={cn(
                'flex items-center gap-2 bg-[#F0F3F9B2] rounded-[8px] px-6 py-2.5',
                providerStep === 1 ? 'mb-6' : 'my-[54px]'
            )}>
                <Info className='w-4 h-4 shrink-0 fill-[#003399] stroke-white' />
                <p className='text-sm text-[#5F6062] font-medium'>Your own provider keys and local generation setup stay on this machine.</p>
            </div>

            {providerStep === 1 && <>
            {/* Text Provider */}
            <div className='p-3 border border-[#EDEEEF] rounded-[11px] bg-white '>
                <div className="flex items-center gap-[24.3px]  mb-[42px]">
                    <div className='w-[74px] h-[74px] rounded-[4px] pt-[16.8px] pr-[17.15px] pb-[17.2px] pl-[16.85px] flex items-center justify-center'
                        style={{ backgroundColor: '#4C55541A' }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none">
                            <path d="M20 6.6665V33.3332" stroke="#4C5554" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6.66666 11.6665V8.33317C6.66666 7.89114 6.84225 7.46722 7.15481 7.15466C7.46737 6.8421 7.8913 6.6665 8.33332 6.6665H31.6667C32.1087 6.6665 32.5326 6.8421 32.8452 7.15466C33.1577 7.46722 33.3333 7.89114 33.3333 8.33317V11.6665" stroke="#4C5554" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M15 33.3335H25" stroke="#4C5554" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className='w-full'>

                        <h3 className="text-xl font-normal text-[#191919] pb-1.5">Text Generation Settings</h3>
                        <p className=" text-sm  text-gray-500">
                            Choosing where text content comes from
                        </p>
                    </div>
                </div>
                <div className="flex w-full max-w-[300px] flex-col items-start gap-4">
                    <div className="flex w-full flex-col justify-start">

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
                                    className="flex h-12 w-full px-4 py-4 outline-none border border-[#E8E8E9] rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between"
                                >
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-medium text-gray-900">
                                            {llmConfig.LLM && TEXT_PROVIDER_VALUES.has(llmConfig.LLM)
                                                ? LLM_PROVIDERS[llmConfig.LLM]
                                                    ?.label || llmConfig.LLM
                                                : "Select text provider"}
                                        </span>
                                    </div>
                                    <ChevronUp className="w-4 h-4 text-gray-500" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="p-0 w-full "
                                align="end"

                            >
                                <Command>
                                    <CommandInput placeholder="Search provider..." />
                                    <CommandList className='hide-scrollbar'>
                                        <CommandEmpty>No provider found.</CommandEmpty>
                                        <CommandGroup >
                                            {TEXT_PROVIDERS.map(
                                                (provider, index) => (
                                                    <CommandItem
                                                        key={index}
                                                        value={provider.value}
                                                        onSelect={() => handleProviderChange(provider.value)}
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
                {isActiveTextProvider && (
                <div className="mt-6 flex w-full max-w-[300px] flex-col items-start gap-4">
                    <div className="relative flex w-full flex-col justify-end items-start">
                        <div className="flex flex-col justify-start w-full ">
                            <>
                                <div className='flex items-center justify-between mb-2'>

                                    <label className="block text-sm font-medium capitalize text-gray-700 ">
                                        {providerApiKeyLabel}
                                    </label>
                                    {llmConfig.LLM && LLM_PROVIDERS[llmConfig.LLM!]?.getApiKeyUrl && <a href={LLM_PROVIDERS[llmConfig.LLM!]?.getApiKeyUrl || ""} target='_blank' className='text-[#666666] text-xs font-normal flex items-center gap-1'>Get API Key <ArrowUpRight className='w-3.5 h-3.5' /></a>}
                                </div>

                                <div className="relative">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={currentApiKey}
                                        onChange={(e) => setLlmConfig(prev => ({
                                            ...prev,
                                            [currentApiKeyField]: e.target.value
                                        }))}
                                        className="w-full px-2 py-3 outline-none border  border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                        placeholder={`Enter your ${providerApiKeyLabel}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey((prev) => !prev)}
                                        className='absolute right-2 top-1/2 -translate-y-1/2 bg-white px-2 py-1 cursor-pointer'
                                    >
                                        {showApiKey ? <Eye className='w-4 h-4 text-gray-500' /> : <EyeOff className='w-4 h-4 text-gray-500' />}
                                    </button>
                                </div>
                            </>
                            {llmConfig.LLM === 'custom' && (
                                <input
                                    type="text"
                                    value={llmConfig.CUSTOM_LLM_URL}
                                    onChange={(e) => setLlmConfig(prev => ({
                                        ...prev,
                                        CUSTOM_LLM_URL: e.target.value
                                    }))}
                                    className="w-full mt-2 px-2 py-3 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                                    placeholder="OpenAI-compatible URL"
                                />
                            )}
                        </div>


                        {(!modelsChecked || availableModels.length === 0) && (

                            <button
                                onClick={fetchAvailableModels}
                                disabled={
                                    modelsLoading ||
                                    (llmConfig.LLM === 'openai' && !currentApiKey) ||
                                    (llmConfig.LLM === 'google' && !currentApiKey) ||
                                    (llmConfig.LLM === 'custom' && !llmConfig.CUSTOM_LLM_URL)
                                }
                                className={`mt-4 py-2.5 bg-[#EDEEEF] disabled:opacity-50 disabled:cursor-not-allowed px-3.5 w-full  rounded-[48px] text-xs font-semibold text-[#101323] transition-all duration-200 border ${modelsLoading
                                    ? " border-gray-300 cursor-not-allowed text-gray-500"
                                    : " border-[#EDEEEF] text-[#101323] hover:bg-[#EDEEEF]/90 focus:ring-2 focus:ring-blue-500/20"
                                    }`}
                            >
                                {modelsLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Checking for models...
                                    </span>
                                ) : (
                                    "Validate & Load Models"
                                )}
                            </button>
                        )}
                    </div>

                </div>
                )}
                <div className="mt-4 flex w-full max-w-[222px] items-start gap-4">


                    {/* Model Selection - only show if models are available */}
                    {isActiveTextProvider && modelsChecked && availableModels.length > 0 && (
                        <div className="w-full">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {`Select ${LLM_PROVIDERS[llmConfig.LLM!]?.label} Model`}
                                </label>
                                <div className="w-full">
                                    <Popover
                                        open={openModelSelect}
                                        onOpenChange={setOpenModelSelect}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openModelSelect}
                                                className="w-full h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between"
                                            >
                                                <span className="text-sm truncate font-medium text-gray-900">
                                                    {
                                                        currentModel
                                                            ? availableModels.find(model => model === currentModel) || currentModel
                                                            :
                                                            "Select a model"
                                                    }
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
                                                        {availableModels.map((model, index) => (
                                                            <CommandItem
                                                                key={index}
                                                                value={model}
                                                                onSelect={(value) => {
                                                                    if (currentModelField) {
                                                                        trackEvent(MixpanelEvent.Onboarding_Text_Model_Selected, {
                                                                            provider: llmConfig.LLM || "",
                                                                            model: value,
                                                                        });
                                                                        setLlmConfig(prev => ({
                                                                            ...prev,
                                                                            [currentModelField]: value
                                                                        }));
                                                                    }
                                                                    setOpenModelSelect(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        currentModel === model
                                                                            ? "opacity-100"
                                                                            : "opacity-0"
                                                                    )}
                                                                />
                                                                <div className="flex gap-3 items-center">
                                                                    <div className="flex flex-col space-y-1 flex-1">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="text-sm font-medium text-gray-900">
                                                                                {model}
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
                    )}
                </div>
            </div>
            </>}
            {providerStep === 2 && <>
            {/* Image Provider */}
            <div className={`p-3 border border-[#EDEEEF] rounded-[11px] relative mt-5 bg-white ${llmConfig.DISABLE_IMAGE_GENERATION ? "bg-[#F9FAFB]" : ""}`}>
                <ToolTip content="Enable/Disable Image Generation" className='flex justify-end items-center absolute top-3 right-3'>
                    <div className='flex justify-end items-center'>
                        <Switch
                            checked={!llmConfig.DISABLE_IMAGE_GENERATION}
                            className='data-[state=checked]:bg-[#4791FF] h-[22px] w-[36px] data-[state=unchecked]:bg-[#E2E0E1]'
                            onCheckedChange={(checked) => {
                                trackEvent(MixpanelEvent.Onboarding_Image_Generation_Toggled, {
                                    enabled: checked,
                                    image_step_skipped: !checked,
                                });
                                setLlmConfig(prev => ({
                                    ...prev,
                                    DISABLE_IMAGE_GENERATION: !checked
                                }));
                            }}
                        />
                    </div>

                </ToolTip>
                <div className={` flex items-center gap-6 ${llmConfig.DISABLE_IMAGE_GENERATION ? "" : "mb-[42px]"}`}>
                    <div className='w-[74px] h-[74px] px-[13.5px] py-[14.2px] rounded-[4px] flex items-center justify-center'
                        style={{ backgroundColor: '#F4F3FF' }}
                    >
                        <img src="/image-markup.svg" className='w-full h-full object-cover' alt='image-markup' />
                    </div>
                    <div>

                        <h3 className="text-xl font-normal text-[#191919] ">Image Generation Settings</h3>
                        <p className=" text-sm  text-gray-500">
                            Choosing where images come from
                        </p>
                    </div>
                </div>
                {!llmConfig.DISABLE_IMAGE_GENERATION && (
                    <div className='flex flex-col gap-4'>
                        {/* Image Provider Selection */}
                        <div className="w-full">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Image Provider
                            </label>
                            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                                {imageProviderRows.map((row, rowIndex) => (
                                    <React.Fragment key={`image-provider-row-${rowIndex}`}>
                                        {row.map((provider) => (
                                            <button
                                                type="button"
                                                key={provider.value}
                                                onClick={() => {
                                                    trackEvent(MixpanelEvent.Onboarding_Image_Provider_Selected, {
                                                        image_provider: provider.value,
                                                        image_provider_label: provider.label,
                                                    });
                                                    setLlmConfig(prev => ({ ...prev, IMAGE_PROVIDER: provider.value }));
                                                }}
                                                className={cn(
                                                    "group flex min-h-24 flex-col items-center justify-center gap-2 rounded-[10px] border p-3 text-center transition-all hover:border-[#D9D6FE] hover:bg-[#F7F6F9]",
                                                    llmConfig.IMAGE_PROVIDER === provider.value
                                                        ? "border-[#7A5AF8] bg-[#F4F3FF] shadow-[0_10px_24px_rgba(122,90,248,0.12)]"
                                                        : "border-[#EDEEEF] bg-white"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "flex h-10 w-10 items-center justify-center rounded-lg border bg-white transition-colors",
                                                        llmConfig.IMAGE_PROVIDER === provider.value
                                                            ? "border-[#D9D6FE]"
                                                            : "border-[#EDEEEF] group-hover:border-[#D9D6FE]"
                                                    )}
                                                >
                                                    {provider.icon
                                                        ? <img src={provider.icon} alt="" className="h-7 w-7 object-contain" />
                                                        : <span className="text-sm font-semibold">{provider.label.slice(0, 1)}</span>}
                                                </span>
                                                <span className="text-xs font-semibold text-[#191919]">{provider.label}</span>
                                            </button>
                                        ))}
                                        {row.some((provider) => provider.value === llmConfig.IMAGE_PROVIDER) && renderSelectedImageProviderConfig()}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </>}

            {providerStep === 3 && (
                <div className={`relative rounded-[11px] border border-[#EDEEEF] p-3 ${llmConfig.WEB_GROUNDING ? "bg-white" : "bg-[#F9FAFB]"}`}>
                    <ToolTip content="Enable/Disable Web Search" className='absolute right-3 top-3 flex items-center justify-end'>
                        <div className='flex items-center justify-end'>
                            <Switch
                                checked={!!llmConfig.WEB_GROUNDING}
                                className='data-[state=checked]:bg-[#4791FF] h-[22px] w-[36px] data-[state=unchecked]:bg-[#E2E0E1]'
                                onCheckedChange={(checked) => {
                                    trackEvent(MixpanelEvent.Onboarding_Web_Search_Toggled, {
                                        enabled: checked,
                                        web_search_step_skipped: !checked,
                                    });
                                    setLlmConfig(prev => ({
                                        ...prev,
                                        WEB_GROUNDING: checked,
                                    }));
                                }}
                            />
                        </div>
                    </ToolTip>
                    <div className="mb-[42px] flex items-center gap-6">
                        <div className='flex h-[74px] w-[74px] items-center justify-center rounded-[4px] bg-[#F4F3FF]'>
                            <Search className="h-9 w-9 text-[#5146E5]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-normal text-[#191919]">Web Search Settings</h3>
                            <p className="text-sm text-gray-500">Bring current information into generated presentations</p>
                        </div>
                    </div>
                    {llmConfig.WEB_GROUNDING && <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Select Web Search Provider</label>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {webSearchProviderRows.map((row, rowIndex) => (
                                        <React.Fragment key={`web-search-provider-row-${rowIndex}`}>
                                            {row.map((provider) => (
                                                <button
                                                    type="button"
                                                    key={provider.value}
                                                    onClick={() => {
                                                        trackEvent(MixpanelEvent.Onboarding_Web_Search_Provider_Selected, {
                                                            web_search_provider: provider.value,
                                                            web_search_provider_label: provider.label,
                                                        });
                                                        setLlmConfig(prev => ({
                                                            ...prev,
                                                            WEB_GROUNDING: true,
                                                            WEB_SEARCH_PROVIDER: provider.value,
                                                        }));
                                                    }}
                                                    className={cn(
                                                        "group flex min-h-32 flex-col items-center justify-center gap-2 rounded-[10px] border p-3 text-center transition-all hover:border-[#D9D6FE] hover:bg-[#F7F6F9]",
                                                        selectedWebProvider?.value === provider.value
                                                            ? "border-[#7A5AF8] bg-[#F4F3FF] shadow-[0_10px_24px_rgba(122,90,248,0.12)]"
                                                            : "border-[#EDEEEF] bg-white"
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "flex h-10 w-10 items-center justify-center rounded-lg border bg-white transition-colors",
                                                            selectedWebProvider?.value === provider.value
                                                                ? "border-[#D9D6FE]"
                                                                : "border-[#EDEEEF] group-hover:border-[#D9D6FE]"
                                                        )}
                                                    >
                                                        {provider.icon && <img src={provider.icon} alt="" className="h-7 w-7 object-contain" />}
                                                    </span>
                                                    <span className="text-xs font-semibold text-[#191919]">{provider.label}</span>
                                                    <span className="line-clamp-2 text-[10px] leading-4 text-gray-500">{provider.description}</span>
                                                </button>
                                            ))}
                                            {row.some((provider) => provider.value === selectedWebProvider?.value) && renderSelectedWebSearchProviderConfig()}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>}
                </div>
            )}

            <div className='fixed bottom-16 mr-8  max-w-[1440px]  right-16 flex justify-end items-center gap-2.5 '>
                {providerStep > 1 && (
                    <button
                        onClick={handleBack}
                        className='border border-[#EDEEEF] rounded-[53px] px-4 py-1 h-[36px]'>
                        <ChevronLeft className='w-4 h-4 text-gray-500' />
                    </button>
                )}
                <button

                    disabled={savingConfig}
                    onClick={handleContinue}
                    className='border font-syne border-[#EDEEEF] bg-[#7C51F8]  rounded-[58px] px-5 py-2.5 text-white text-xs  font-semibold'>
                    {providerStep === 1
                        ? "Continue to image provider"
                        : providerStep === 2
                            ? llmConfig.DISABLE_IMAGE_GENERATION ? "Disable image generation & Continue" : "Continue to web search"
                            : llmConfig.WEB_GROUNDING ? "Save & Finish" : "Disable web search & Finish"}
                </button>
            </div>
        </div>
    )
}

export default PresentonMode
