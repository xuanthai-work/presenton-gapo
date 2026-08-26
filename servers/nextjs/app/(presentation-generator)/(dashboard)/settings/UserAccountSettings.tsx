import { UserRound } from "lucide-react";

import LogoutButton from "@/components/Auth/LogoutButton";
import { GSlideCard, GSlideHeader } from "@/components/gslide";

type UserAccountSettingsProps = {
  username: string;
};

export default function UserAccountSettings({
  username,
}: UserAccountSettingsProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col font-syne">
      <GSlideHeader title="Settings" />

      <div className="mx-7 mt-8 max-w-xl pb-16">
        <GSlideCard aria-labelledby="account-heading" className="p-7 sm:p-7">
          <h2
            id="account-heading"
            className="font-unbounded text-base font-normal text-[var(--gslide-ink)]"
          >
            Account
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--gslide-muted)]">
            Review the signed-in account and end this session.
          </p>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--gslide-accent-soft)]">
              <UserRound
                className="h-5 w-5 text-[var(--gslide-accent)]"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--gslide-muted)]">
                Signed in as
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--gslide-ink)]">
                {username}
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-[var(--gslide-border)] pt-6">
            <p className="text-sm font-semibold text-[var(--gslide-ink)]">
              Sign out
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--gslide-muted)]">
              You will need to sign in again to access this workspace.
            </p>
            <LogoutButton
              label="Sign out"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--gslide-accent)] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[var(--gslide-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </GSlideCard>
      </div>
    </div>
  );
}
