import type { ReactNode } from "react";

export const settingsFormColumnClassName =
  "flex w-full min-w-0 max-w-[400px] flex-col gap-4";

export const settingsControlClassName =
  "h-12 w-full rounded-lg border border-gray-300 px-4 text-sm font-medium text-[#191919] outline-none transition-colors hover:border-gray-400 focus:border-[var(--gslide-accent)] focus:ring-2 focus:ring-[var(--gslide-accent)]/20";

export const settingsDropdownClassName = `${settingsControlClassName} justify-between`;

export function SettingsField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full min-w-0">
      <label className="mb-2 block text-sm font-medium text-[#4C5554]">
        {label}
      </label>
      {children}
    </div>
  );
}
