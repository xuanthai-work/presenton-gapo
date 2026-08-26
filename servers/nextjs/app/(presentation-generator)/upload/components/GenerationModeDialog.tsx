"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

export type GenerationMode = "standard" | "smart";

type GenerationModeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: GenerationMode) => void;
};

type ModeCard = {
  id: GenerationMode;
  label: string;
  caption: string;
  description: string;
  media: string;
};

const MODE_CARDS: ModeCard[] = [
  {
    id: "standard",
    label: "Standard",
    caption: "Fixed layout",
    description:
      "A rigid, predefined layout with fixed structure, ensuring consistency, clarity, and predictable results.",
    media: "/Standard.mp4",
  },
  {
    id: "smart",
    label: "Smart",
    caption: "Flexible layout",
    description:
      "A smart adaptive layout with flexible structure, balancing consistency and content.",
    media: "/Smart.mp4",
  },
];

export default function GenerationModeDialog({
  open,
  onOpenChange,
  onSelect,
}: GenerationModeDialogProps) {
  const selectMode = (mode: GenerationMode) => {
    onSelect(mode);
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[2px]" />
        <div
          className="p-2"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <DialogPrimitive.Content
            className="relative overflow-y-auto rounded-[24px] border border-[#EDEEEF] bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:rounded-[40px]"
            style={{
              width: "calc(100% - 1rem)",
              maxWidth: "850px",
              maxHeight: "calc(100dvh - 1rem)",
              pointerEvents: "auto",
            }}
          >
            <DialogPrimitive.Description className="sr-only">
              Choose Standard mode for fixed layouts or Smart mode for adaptive
              layouts.
            </DialogPrimitive.Description>
            <div className="sticky top-0 z-10 border-b border-[#EDEEEF] bg-[#F9FAFB] px-4 py-4 sm:px-8">
              <DialogPrimitive.Title className="text-xl font-medium tracking-[-0.2px] text-[#808080]">
                Select Mode
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="absolute right-4 top-5 sm:right-8">
                <X className="h-5 w-5 text-[#808080]" />
              </DialogPrimitive.Close>
            </div>

            <div className="p-3 sm:p-5">
              <div
                role="radiogroup"
                aria-label="Generation mode"
                className="grid grid-cols-1 gap-5 md:grid-cols-2"
              >
                {MODE_CARDS.map((card) => (
                  <ModeCardView
                    key={card.id}
                    card={card}
                    onSelect={selectMode}
                  />
                ))}
              </div>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ModeCardView({
  card,
  onSelect,
}: {
  card: ModeCard;
  onSelect: (mode: GenerationMode) => void;
}) {
  const isSmart = card.id === "smart";

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("[data-radix-dialog-close]")
    ) {
      return;
    }
    onSelect(card.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(card.id);
    }
  };

  return (
    <div
      role="radio"
      aria-checked={false}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group relative cursor-pointer overflow-hidden rounded-[20px] border border-[var(--gslide-border)] bg-white outline-none transition-transform duration-200 ease-out hover:-translate-y-[2px] hover:border-[var(--gslide-accent)] focus-visible:-translate-y-[2px] focus-visible:border-[var(--gslide-accent)] focus-visible:ring-2 focus-visible:ring-[var(--gslide-accent)] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-t-[20px] bg-[#F6F6F9]">
          <video
            src={card.media}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-[var(--gslide-accent)] px-3 py-1 font-syne text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)]"
        >
          {card.label}
        </span>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--gslide-border)] bg-white/95 px-2.5 py-1 font-syne text-[10px] font-semibold uppercase tracking-[0.14em] text-[#344054] backdrop-blur"
        >
          {card.caption}
        </span>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--gslide-border)] bg-white/95 text-[var(--gslide-accent)] opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>

        {isSmart ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-t-[20px] opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{
              background:
                "linear-gradient(180deg, rgba(213,202,252,0) 60%, rgba(253,228,194,0.18) 100%)",
            }}
          />
        ) : null}
      </div>

      <div className="px-4 pb-5 pt-4">
        <p className="font-syne text-[15px] font-semibold text-[#101323]">
          {card.label}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#5A6472]">
          {card.description}
        </p>
      </div>
    </div>
  );
}
