import React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { LLMConfig } from '@/types/llm_config';
import OpenAICompatibleImageFields from '@/components/OpenAICompatibleImageFields';
import { IMAGE_PROVIDERS } from '@/utils/providerConstants';
import { cn } from '@/lib/utils';
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from './ui/select';

const GPT_IMAGE_1_5_QUALITY_OPTIONS = [
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

const renderQualitySelector = (
    llmConfig: LLMConfig,
    input_field_changed: (value: string, field: string) => void
) => {
    if (llmConfig.IMAGE_PROVIDER === "gpt-image-1.5") {
        return (
            <div className="w-[295px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    GPT Image 1.5 Quality
                </label>
                <Select
                    value={llmConfig.GPT_IMAGE_1_5_QUALITY}
                    onValueChange={(value) => input_field_changed(value, "gpt_image_1_5_quality")}
                >
                    <SelectTrigger className="w-full h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between">
                        <SelectValue placeholder="Select a quality" />
                    </SelectTrigger>
                    <SelectContent>
                        {GPT_IMAGE_1_5_QUALITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    return null;
};

const ImageSelectionConfig = ({
    isImageGenerationDisabled,
    openImageProviderSelect,
    setOpenImageProviderSelect,
    llmConfig,
    input_field_changed,
}: {
    isImageGenerationDisabled: boolean;
    openImageProviderSelect: boolean;
    setOpenImageProviderSelect: (open: boolean) => void;
    llmConfig: LLMConfig;
    input_field_changed: (value: string, field: string) => void;
}) => {
    return (
        <div className="mt-7">
            <div className="p-10 flex justify-between items-center bg-white rounded-[12px]">
                <div>
                    <h4 className="text-xl font-normal text-[#191919]">Image Generation Settings</h4>
                    <p className="mt-2 text-sm max-w-[205px] text-gray-500">
                        Choosing where images come from.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    {!isImageGenerationDisabled && (
                        <>
                            {/* Image Provider Selection */}
                            <div className="my-8">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Select Image Provider
                                </label>
                                <div className="w-full">
                                    <Popover
                                        open={openImageProviderSelect}
                                        onOpenChange={setOpenImageProviderSelect}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openImageProviderSelect}
                                                className="w-[275px] h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between"
                                            >
                                                <div className="flex gap-3 items-center">
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {llmConfig.IMAGE_PROVIDER
                                                            ? IMAGE_PROVIDERS[llmConfig.IMAGE_PROVIDER]
                                                                ?.label || llmConfig.IMAGE_PROVIDER
                                                            : "Select image provider"}
                                                    </span>
                                                </div>
                                                <ChevronsUpDown className="w-4 h-4 text-gray-500" />
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
                                                        {Object.values(IMAGE_PROVIDERS).map(
                                                            (provider, index) => (
                                                                <CommandItem
                                                                    key={index}
                                                                    value={provider.value}
                                                                    onSelect={(value) => {
                                                                        input_field_changed(value, "image_provider");
                                                                        setOpenImageProviderSelect(false);
                                                                    }}
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4",
                                                                            llmConfig.IMAGE_PROVIDER === provider.value
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

                            {renderQualitySelector(llmConfig, input_field_changed)}

                            {/* Dynamic image provider configuration */}
                            {llmConfig.IMAGE_PROVIDER === "openai_compatible" && (
                                <OpenAICompatibleImageFields
                                    layout="stacked"
                                    baseUrl={llmConfig.OPENAI_COMPAT_IMAGE_BASE_URL || ""}
                                    apiKey={llmConfig.OPENAI_COMPAT_IMAGE_API_KEY || ""}
                                    model={llmConfig.OPENAI_COMPAT_IMAGE_MODEL || ""}
                                    onBaseUrlChange={(v) =>
                                        input_field_changed(v, "openai_compat_image_base_url")
                                    }
                                    onApiKeyChange={(v) =>
                                        input_field_changed(v, "openai_compat_image_api_key")
                                    }
                                    onModelChange={(v) =>
                                        input_field_changed(v, "openai_compat_image_model")
                                    }
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageSelectionConfig;
