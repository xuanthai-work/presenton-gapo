import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(nextRoot, "..", "..");

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

async function readRepo(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("telemetry-status is fail-closed and serves PostHog config only when enabled", async () => {
  const source = await readNext("app/api/telemetry-status/route.ts");
  assert.match(source, /POSTHOG_HOST/);
  assert.match(source, /POSTHOG_PROJECT_API_KEY/);
  assert.match(source, /telemetryEnabled: false/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_POSTHOG/);
  assert.match(source, /readUserConfigFile/);
  assert.match(source, /DISABLE_ANONYMOUS_TRACKING/);
});

test("root env example documents browser-reachable PostHog host", async () => {
  const env = await readRepo(".env.example");
  assert.match(env, /POSTHOG_HOST=/);
  assert.match(env, /POSTHOG_PROJECT_API_KEY=/);
  assert.match(env, /localhost:8010/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_POSTHOG/);
});

test("GSlide compose forwards PostHog env and does not start PostHog", async () => {
  const compose = await readRepo("docker-compose.yml");
  assert.match(compose, /POSTHOG_HOST=\$\{POSTHOG_HOST:-\}/);
  assert.match(compose, /POSTHOG_PROJECT_API_KEY=\$\{POSTHOG_PROJECT_API_KEY:-\}/);
  assert.doesNotMatch(compose, /clickhouse/i);
  assert.doesNotMatch(compose, /deploy\/posthog/);
});
test("posthog wrapper exists and does not import mixpanel", async () => {
  const source = await readNext("utils/posthog.ts");
  assert.match(source, /export type ErrorOperation/);
  assert.match(source, /export function initPostHog/);
  assert.match(source, /export function captureError/);
  assert.match(source, /disable_session_recording:\s*true/);
  assert.match(source, /sanitizeAnalyticsError/);
  assert.doesNotMatch(source, /mixpanel-browser/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_POSTHOG/);
});

test("ClientRoot wires PostHogInitializer and MixpanelInitializer is gone", async () => {
  const root = await readNext("app/ClientRoot.tsx");
  assert.match(root, /PostHogInitializer/);
  assert.doesNotMatch(root, /MixpanelInitializer/);
  await assert.rejects(
    () => access(path.join(nextRoot, "app/MixpanelInitializer.tsx")),
    (error) => error && error.code === "ENOENT",
  );
});

test("privacy copy is error reports and fail-closed", async () => {
  const privacy = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/PrivacySettings.tsx",
  );
  const finalStep = await readNext("components/OnBoarding/FinalStep.tsx");
  assert.match(privacy, /Error reports/);
  assert.match(
    privacy,
    /We send anonymous error reports \(crashes and failed generate, export, stream, or save actions\) to our self-hosted PostHog/,
  );
  assert.doesNotMatch(
    privacy,
    /No personal information or presentation content is collected/,
  );
  assert.match(privacy, /from "@\/utils\/posthog"/);
  assert.doesNotMatch(privacy, /Usage_Analytics_Disabled/);
  assert.match(privacy, /setTrackingEnabled\(false\)/);
  assert.match(finalStep, /Error reports/);
  assert.match(finalStep, /from "@\/utils\/posthog"/);
  assert.doesNotMatch(finalStep, /setTrackingEnabled\(true\)/);
});

const CAPTURE_SITES = [
  ["app/(presentation-generator)/outline/hooks/useOutlineStreaming.ts", "generate"],
  ["app/(presentation-generator)/presentation/hooks/usePresentationStreaming.ts", "generate"],
  ["app/(presentation-generator)/outline/hooks/usePresentationGeneration.ts", "generate"],
  ["app/(presentation-generator)/outline/components/OutlinePage.tsx", "generate"],
  ["app/(presentation-generator)/upload/components/UploadPage.tsx", "generate"],
  ["app/(presentation-generator)/custom-template/hooks/useTemplateCreation.ts", "generate"],
  ["app/(presentation-generator)/presentation/components/PresentationHeader.tsx", "export"],
  ["app/(presentation-generator)/presentation/components/Chat.tsx", "stream"],
  ["app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx", "save"],
  ["app/(presentation-generator)/(dashboard)/theme/components/ThemePanel/index.tsx", "save"],
];

test("closed failure list calls captureError with the spec operation", async () => {
  for (const [file, operation] of CAPTURE_SITES) {
    const source = await readNext(file);
    assert.match(source, /from ['"]@\/utils\/posthog['"]/);
    assert.match(
      source,
      new RegExp(`captureError\\([\\s\\S]*operation:\\s*"${operation}"`),
      `missing captureError operation ${operation} in ${file}`,
    );
    assert.doesNotMatch(source, /operation:\s*"[\w]+"\s*,\s*file_name/);
  }
  const template = await readNext(
    "app/(presentation-generator)/custom-template/hooks/useTemplateCreation.ts",
  );
  assert.match(template, /operation:\s*"save"/);
});
