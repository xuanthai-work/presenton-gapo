"use client";
import React, { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { setTelemetryEnabled } from "@/utils/posthog";
import { Loader2 } from "lucide-react";

const PrivacySettings = () => {
  const [trackingEnabled, setTrackingEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch("/api/telemetry-status");
        if (!response.ok) throw new Error(`telemetry-status returned ${response.status}`);
        const data = await response.json();
        setTrackingEnabled(data.telemetryEnabled);
      } catch {
        setTrackingEnabled(false);
      }
    }
    fetchStatus();
  }, []);

  const handleTrackingToggle = async (enabled: boolean) => {
    const prev = trackingEnabled;
    setTrackingEnabled(enabled);
    setSaving(true);
    try {
      setTelemetryEnabled(enabled);
      const response = await fetch("/api/user-config", {
        method: "POST",
        body: JSON.stringify({
          DISABLE_ANONYMOUS_TRACKING: enabled ? "false" : "true",
        }),
      });
      if (!response.ok) throw new Error(`user-config returned ${response.status}`);
    } catch {
      setTrackingEnabled(prev);
      setTelemetryEnabled(prev ?? false);
    } finally {
      setSaving(false);
    }
  };

  if (trackingEnabled === null) {
    return (
      <div className="w-full bg-[#F9F8F8] p-7 rounded-[20px] flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--gslide-accent)]" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="bg-[#F9F8F8] p-7 rounded-[20px]">
        <h4 className="text-sm font-semibold text-[#191919] mb-1">
          Error reports
        </h4>
        <p className="text-xs text-[#6B7280] mb-6 leading-relaxed max-w-lg">
          We send anonymous error reports (crashes and failed generate, export, stream, or save actions) to our self-hosted PostHog. We do not send presentation content, prompts, chat messages, uploaded files, or API keys. Session recording is off.
        </p>

        <div className="flex items-center justify-between gap-4 rounded-[10px] bg-white border border-[#EDEEEF] p-4">
          <div>
            <label
              htmlFor="tracking-toggle"
              className="text-sm font-medium text-[#191919] cursor-pointer select-none block"
            >
              Send error reports
            </label>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {trackingEnabled
                ? "Anonymous error reports are being sent."
                : "Anonymous error reports are not being sent."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
            )}
            <Switch
              id="tracking-toggle"
              checked={trackingEnabled}
              onCheckedChange={handleTrackingToggle}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;