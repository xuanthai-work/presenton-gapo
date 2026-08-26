"use client";

import {
  BarChart3,
  Image as ImageIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Type as TypeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "text-provider"
  | "image-provider"
  | "web-search-provider"
  | "privacy"
  | "admin";

const SECTIONS: {
  id: SettingsSection;
  label: string;
  Icon: typeof TypeIcon;
  hint?: string;
}[] = [
  { id: "text-provider", label: "Text", Icon: TypeIcon },
  { id: "image-provider", label: "Image", Icon: ImageIcon },
  { id: "web-search-provider", label: "Search", Icon: SearchIcon },
  {
    id: "privacy",
    label: "Analytics",
    Icon: BarChart3,
    hint: "Privacy controls",
  },
  { id: "admin", label: "Admin", Icon: SettingsIcon },
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
        role="tablist"
        className="flex min-w-max items-end gap-1 border-b border-[var(--gslide-border)]"
      >
        {SECTIONS.map(({ id, label, Icon, hint }) => {
          const active = selectedProvider === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedProvider(id)}
              className={cn(
                "relative isolate inline-flex items-center gap-2 rounded-t-[10px] px-3.5 pb-2.5 pt-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gslide-accent)] focus-visible:ring-offset-2",
                active
                  ? "text-[var(--gslide-accent)]"
                  : "text-[var(--gslide-muted)] hover:bg-[var(--gslide-accent-soft)] hover:text-[var(--gslide-ink)]",
              )}
            >
              <Icon
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={1.75}
              />
              <span>{label}</span>
              {hint ? (
                <span
                  aria-hidden="true"
                  title={hint}
                  className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--gslide-accent)]"
                />
              ) : null}
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[var(--gslide-accent)]"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default SettingSideBar;
