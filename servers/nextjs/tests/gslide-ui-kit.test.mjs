import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

const TOKENS = {
  "--gslide-bg": "#EFF6FF",
  "--gslide-card": "#FFFFFF",
  "--gslide-border": "#BFDBFE",
  "--gslide-ink": "#1E3A5F",
  "--gslide-muted": "#4B7AB5",
  "--gslide-accent": "#1D6FE8",
  "--gslide-accent-hover": "#1558C0",
  "--gslide-accent-soft": "#DBEAFE",
  "--gslide-input-border": "#93C5FD",
  "--gslide-input-focus": "#1D6FE8",
};

test("globals.css defines GSlide tokens on :root", async () => {
  const css = await readNext("app/globals.css");
  for (const [name, hex] of Object.entries(TOKENS)) {
    assert.match(
      css,
      new RegExp(`${name}:\\s*${hex}`),
      `missing ${name}: ${hex}`,
    );
  }
});

test("tokens.ts matches CSS hex values", async () => {
  const source = await readNext("components/gslide/tokens.ts");
  for (const hex of Object.values(TOKENS)) {
    assert.match(source, new RegExp(hex.replace("#", "\\#")));
  }
  assert.match(source, /export const GSLIDE_TOKENS/);
});

test("GSlide primitives use tokens and GSlide wordmark", async () => {
  const wordmark = await readNext("components/gslide/GSlideWordmark.tsx");
  assert.match(wordmark, />GSlide</);
  assert.match(wordmark, /font-unbounded/);
  assert.match(wordmark, /--gslide-ink/);

  const button = await readNext("components/gslide/GSlideButton.tsx");
  assert.match(button, /--gslide-accent/);
  assert.match(button, /rounded-full/);
  assert.match(button, /variant\?: *"primary" *\| *"secondary"/);

  const card = await readNext("components/gslide/GSlideCard.tsx");
  assert.match(card, /--gslide-card/);
  assert.match(card, /--gslide-border/);

  const page = await readNext("components/gslide/GSlidePage.tsx");
  assert.match(page, /--gslide-bg/);

  const input = await readNext("components/gslide/GSlideInput.tsx");
  assert.match(input, /--gslide-input-border/);
  assert.match(input, /--gslide-input-focus/);

  const skeleton = await readNext("components/gslide/GSlideSkeleton.tsx");
  assert.match(skeleton, /--gslide-accent-soft/);
  assert.doesNotMatch(skeleton, /#F6F6F9/);

  const barrel = await readNext("components/gslide/index.ts");
  assert.match(barrel, /GSlideWordmark/);
  assert.match(barrel, /GSlideButton/);
  assert.match(barrel, /GSlideSkeleton/);
});

test("GSlide splash uses Auth background, wordmark, and accent spinner", async () => {
  const splash = await readNext("components/gslide/GSlideSplashLoader.tsx");
  assert.match(splash, /GSlideWordmark/);
  assert.match(splash, /--gslide-bg/);
  assert.match(splash, /--gslide-accent/);
  assert.match(splash, /GSLIDE_SPLASH_MIN_DURATION_MS/);
  assert.doesNotMatch(splash, /#7[Aa]5[Aa][Ff]8/);
  assert.doesNotMatch(splash, /Presenton_Splash\.png/);
});

test("legacy splash module re-exports GSlide splash", async () => {
  const legacy = await readNext("components/ui/presenton-splash-loader.tsx");
  assert.match(legacy, /GSlideSplashLoader/);
  assert.match(legacy, /PresentonSplashLoader/);
  assert.match(legacy, /PRESENTON_SPLASH_MIN_DURATION_MS/);
});

test("GSlide sidebar and header use tokens and wordmark, not purple chrome", async () => {
  const sidebar = await readNext("components/gslide/GSlideSidebar.tsx");
  assert.match(sidebar, /GSlideWordmark/);
  assert.match(sidebar, /--gslide-bg/);
  assert.match(sidebar, /--gslide-border/);
  assert.match(sidebar, /href="\/dashboard"|href=\{`\/dashboard`\}/);
  assert.doesNotMatch(sidebar, /#7C51F8/);
  assert.doesNotMatch(sidebar, /#F6F6F9/);

  const header = await readNext("components/gslide/GSlideHeader.tsx");
  assert.match(header, /--gslide-bg/);
  assert.match(header, /--gslide-border/);
  assert.match(header, /font-unbounded|--gslide-ink/);
});

test("shared Skeleton delegates to GSlideSkeleton", async () => {
  const skeleton = await readNext("components/ui/skeleton.tsx");
  assert.match(skeleton, /GSlideSkeleton/);
});

test("global loading copy is GSlide not Presenton", async () => {
  const appLoading = await readNext("app/loading.tsx");
  assert.match(appLoading, /GSlideSplashLoader|PresentonSplashLoader/);

  const config = await readNext("app/ConfigurationInitializer.tsx");
  assert.match(config, /Loading GSlide/);
  assert.doesNotMatch(config, /Loading Presenton/);
});

test("AuthGate uses GSlide tokens/kit instead of AUTH_THEME", async () => {
  const auth = await readNext("components/Auth/AuthGate.tsx");
  assert.doesNotMatch(auth, /const AUTH_THEME/);
  assert.match(auth, /GSlideWordmark|GSlideCard|var\(--gslide-/);
});

test("landing and metadata say GSlide", async () => {
  const landing = await readNext("app/page.tsx");
  assert.match(landing, /GSlide/);
  const layout = await readNext("app/layout.tsx");
  assert.match(layout, /GSlide/);
  assert.doesNotMatch(layout, /title: "Presenton/);
});

test("dashboard sidebar uses GSlideSidebar and accent active states", async () => {
  const sidebar = await readNext(
    "app/(presentation-generator)/(dashboard)/Components/DashboardSidebar.tsx",
  );
  assert.match(sidebar, /GSlideSidebar/);
  assert.doesNotMatch(sidebar, /#7C51F8/);
  assert.doesNotMatch(sidebar, /#5146E5/);
});

test("dashboard and community chrome use GSlide surfaces", async () => {
  const dash = await readNext(
    "app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage.tsx",
  );
  assert.match(dash, /--gslide-bg|#EFF6FF/);
  assert.doesNotMatch(dash, /#7A5AF8/);

  const community = await readNext(
    "app/(presentation-generator)/(dashboard)/community/components/CommunityPage.tsx",
  );
  assert.doesNotMatch(community, /#6847F4/);
});

test("settings does not tell users to connect Presenton Cloud", async () => {
  const settings = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx",
  );
  assert.doesNotMatch(settings, /Connect Presenton first/);
  assert.doesNotMatch(settings, /Presenton Cloud/);
});

test("OnboardingPresentonAccount is not imported by product surfaces", async () => {
  const home = await readNext("components/Home.tsx");
  const mode = await readNext("components/OnBoarding/PresentonMode.tsx");
  assert.doesNotMatch(home, /OnboardingPresentonAccount/);
  assert.doesNotMatch(mode, /OnboardingPresentonAccount/);
});

test("onboarding wizard chrome is GSlide blue", async () => {
  const mode = await readNext("components/OnBoarding/PresentonMode.tsx");
  assert.doesNotMatch(mode, />PRESENTON</);
  assert.doesNotMatch(mode, /bg-\[#7C51F8\]/);
  assert.match(mode, /GSlide|GSLIDE|--gslide-accent|#1D6FE8/);
});

test("outline header does not use Presenton PNG", async () => {
  const outline = await readNext(
    "app/(presentation-generator)/outline/components/OutlineStandardHeader.tsx",
  );
  assert.doesNotMatch(outline, /logo-with-bg\.png/);
});

test("editor chrome uses GSlide wordmark not Presenton PNG", async () => {
  const presentation = await readNext(
    "app/(presentation-generator)/presentation/components/PresentationHeader.tsx",
  );
  assert.doesNotMatch(presentation, /logo-with-bg\.png/);
  assert.match(presentation, /GSlideWordmark/);

  const template = await readNext(
    "app/(presentation-generator)/template-preview/components/editor/TemplateEditorHeader.tsx",
  );
  assert.doesNotMatch(template, /logo-with-bg\.png/);

  const studio = await readNext(
    "app/(presentation-generator)/custom-template/CustomTemplatePage.tsx",
  );
  assert.doesNotMatch(studio, /logo-with-bg\.png/);
});

const BANNED_HEX = [
  "#7C51F8",
  "#5146E5",
  "#7A5AF8",
  "#6847F4",
  "#6d46e6",
  "#6D46E6",
  "#F4F3FF",
  "#D9D6FE",
];

const CHROME_FILES = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/not-found.tsx",
  "app/ConfigurationInitializer.tsx",
  "components/Auth/AuthGate.tsx",
  "components/Home.tsx",
  "components/Header.tsx",
  "components/OnBoarding/PresentonMode.tsx",
  "components/OnBoarding/OnBoardingSlidebar.tsx",
  "components/ui/overlay-loader.tsx",
  "app/(presentation-generator)/(dashboard)/Components/DashboardSidebar.tsx",
  "app/(presentation-generator)/(dashboard)/layout.tsx",
  "app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage.tsx",
  "app/(presentation-generator)/(dashboard)/community/components/CommunityPage.tsx",
  "app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx",
  "app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx",
  "app/(presentation-generator)/presentation/components/PresentationHeader.tsx",
  "app/(presentation-generator)/outline/components/OutlineStandardHeader.tsx",
  "app/(presentation-generator)/custom-template/CustomTemplatePage.tsx",
  "app/(presentation-generator)/template-preview/components/editor/TemplateEditorHeader.tsx",
];

test("migrated chrome files do not contain banned purple hex", async () => {
  for (const file of CHROME_FILES) {
    const source = await readNext(file);
    for (const hex of BANNED_HEX) {
      assert.doesNotMatch(
        source,
        new RegExp(hex.replace("#", "\\#"), "i"),
        `${file} still contains ${hex}`,
      );
    }
  }
});

test("app metadata titles use GSlide", async () => {
  const notFound = await readNext("app/not-found.tsx");
  assert.match(notFound, /GSlide/);
  assert.doesNotMatch(notFound, /Presenton/);
});
