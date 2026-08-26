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

test("privacy and onboarding persist user-config before enabling telemetry", async () => {
  const privacy = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/PrivacySettings.tsx",
  );
  const finalStep = await readNext("components/OnBoarding/FinalStep.tsx");
  for (const [name, source] of [
    ["PrivacySettings", privacy],
    ["FinalStep", finalStep],
  ]) {
    assert.doesNotMatch(
      source,
      /setTelemetryEnabled\(enabled\);[\s\S]{0,120}fetch\(['"]\/api\/user-config['"]/,
      `${name} must not enable telemetry before POST /api/user-config`,
    );
    assert.match(
      source,
      /if \(!response\.ok\) throw[\s\S]*setTelemetryEnabled\(enabled\)/,
      `${name} must enable telemetry only after user-config POST succeeds`,
    );
  }
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
  assert.match(template, /alreadyReported:\s*true/);
  assert.match(
    template,
    /if\s*\(\s*failure\.alreadyReported\s*\)\s*return/,
    "save-originated layout failures must not be recaptured as generate",
  );
});

test("mixpanel is gone from Next.js app source", async () => {
  await assert.rejects(
    () => access(path.join(nextRoot, "utils/mixpanel.ts")),
    (error) => error && error.code === "ENOENT",
  );
  const pkg = await readNext("package.json");
  assert.doesNotMatch(pkg, /mixpanel-browser/);
  const banned = /d726e8bea8ec147f4c7720060cb2e6d1|api-eu\.mixpanel\.com|@\/utils\/mixpanel/;
  const { readdir } = await import("node:fs/promises");
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".next-build") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) continue;
      if (entry.name === "NOTICE") continue;
      if (entry.name === "posthog-error-reporting.test.mjs") continue;
      if (full.endsWith("package-lock.json")) {
        const lock = await readFile(full, "utf8");
        assert.doesNotMatch(lock, /mixpanel-browser/, full);
        continue;
      }
      const text = await readFile(full, "utf8");
      assert.doesNotMatch(text, banned, full);
    }
  }
  await walk(nextRoot);
});

test("PostHog stack is a separate compose project in deploy/posthog", async () => {
  const readme = await readRepo("deploy/posthog/README.md");
  assert.match(readme, /gslide-posthog/);
  assert.match(readme, /localhost:8010/);
  assert.match(readme, /--project-name gslide-posthog/);
  assert.match(readme, /9f29728b378fba9453a8c78e1c4039aa018f2629/);
  await access(path.join(repoRoot, "deploy/posthog/docker-compose.yml"));
  const compose = await readRepo("deploy/posthog/docker-compose.yml");
  assert.match(compose, /proxy:/);
  assert.match(compose, /ports:\s*!override/);
  assert.match(compose, /["']8010:80["']/);
  assert.doesNotMatch(compose, /8010:8000/);
  assert.doesNotMatch(compose, /["']80:80["']/);
  const gslide = await readRepo("docker-compose.yml");
  assert.doesNotMatch(gslide, /include:[\s\S]*deploy\/posthog/);
});
