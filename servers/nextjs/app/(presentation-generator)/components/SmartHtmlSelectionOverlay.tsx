import { Sparkles } from "lucide-react";

export type SmartSelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export default function SmartHtmlSelectionOverlay({
  hoverRect,
  selectionRect,
}: {
  hoverRect: SmartSelectionRect | null;
  selectionRect: SmartSelectionRect | null;
}) {
  return (
    <>
      {hoverRect && (
        <div
          aria-hidden="true"
          data-smart-selection-overlay="hover"
          className="pointer-events-none fixed z-[80] rounded-[8px] border-2 border-dotted border-[#1D6FE8]"
          style={{
            ...hoverRect,
            backgroundColor: "rgba(122, 90, 248, 0.07)",
            backgroundImage:
              "radial-gradient(rgba(122, 90, 248, 0.38) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.9), 0 0 0 5px rgba(29,111,232,0.12)",
          }}
        />
      )}
      {selectionRect && (
        <div
          aria-hidden="true"
          data-smart-selection-overlay="selected"
          className="pointer-events-none fixed z-[81] rounded-[8px] border-2 border-dotted border-[#1558C0]"
          style={{
            ...selectionRect,
            backgroundColor: "rgba(105, 65, 198, 0.08)",
            backgroundImage:
              "radial-gradient(rgba(105, 65, 198, 0.42) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.95), 0 0 0 5px rgba(105,65,198,0.16)",
          }}
        >
          <span
            className="absolute left-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#1558C0] px-2 py-1.5 font-syne text-[11px] font-semibold text-white shadow-sm"
            style={{ top: selectionRect.top > 36 ? -32 : 4 }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Selected for AI
          </span>
        </div>
      )}
    </>
  );
}
