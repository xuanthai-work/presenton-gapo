import { cn } from "@/lib/utils";

export type SettingsSection =
  | "text-provider"
  | "image-provider"
  | "web-search-provider"
  | "privacy"
  | "admin";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "text-provider", label: "Text" },
  { id: "image-provider", label: "Image" },
  { id: "web-search-provider", label: "Search" },
  { id: "privacy", label: "Analytics" },
  { id: "admin", label: "Admin" },
];

const SettingSideBar = ({
  selectedProvider,
  setSelectedProvider,
}: {
  selectedProvider: SettingsSection;
  setSelectedProvider: (provider: SettingsSection) => void;
}) => {
  return (
    <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto">
      <div
        className="flex min-w-max gap-1 border-b border-[var(--gslide-border)]"
        role="tablist"
      >
        {SECTIONS.map((section) => {
          const active = selectedProvider === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedProvider(section.id)}
              className={cn(
                "relative px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-[var(--gslide-accent)]"
                  : "text-[var(--gslide-muted)] hover:text-[var(--gslide-ink)]",
              )}
            >
              {section.label}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--gslide-accent)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default SettingSideBar;
