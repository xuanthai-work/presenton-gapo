import assert from "node:assert/strict";
import { access } from "node:fs/promises";
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

test("GSlide logo asset is in public/", async () => {
  await access(path.join(nextRoot, "public/gslide-logo.png"));
});

test("browser tab icon is GSlide, not Presenton icon1.svg", async () => {
  await access(path.join(nextRoot, "app/icon.png"));
  await access(path.join(nextRoot, "app/favicon.ico"));
  await access(path.join(nextRoot, "app/apple-icon.png"));
  await assert.rejects(
    () => access(path.join(nextRoot, "app/icon1.svg")),
    (error) => error && error.code === "ENOENT",
  );
  await assert.rejects(
    () => access(path.join(nextRoot, "app/icon2.png")),
    (error) => error && error.code === "ENOENT",
  );
});

test("GSlide primitives use tokens and GSlide wordmark", async () => {
  const wordmark = await readNext("components/gslide/GSlideWordmark.tsx");
  assert.match(wordmark, />GSlide</);
  assert.match(wordmark, /font-unbounded/);
  assert.match(wordmark, /--gslide-ink/);
  assert.match(wordmark, /gslide-logo\.png/);
  assert.match(wordmark, /markOnly/);

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

test("legacy Presenton splash alias file is removed", async () => {
  await assert.rejects(
    () => readNext("components/ui/presenton-splash-loader.tsx"),
    (error) => error && error.code === "ENOENT",
  );
});

test("GSlide sidebar and header use tokens and wordmark, not purple chrome", async () => {
  const sidebar = await readNext("components/gslide/GSlideSidebar.tsx");
  assert.match(sidebar, /GSlideWordmark/);
  assert.match(sidebar, /markOnly/);
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
  assert.match(appLoading, /GSlideSplashLoader/);
  assert.doesNotMatch(appLoading, /PresentonSplashLoader/);
  assert.doesNotMatch(appLoading, /presenton-splash-loader/);

  const config = await readNext("app/ConfigurationInitializer.tsx");
  assert.match(config, /Loading GSlide/);
  assert.doesNotMatch(config, /Loading Presenton/);
  assert.doesNotMatch(config, /auth\/presenton/);
  assert.doesNotMatch(config, /hasPresentonCloud/);
  assert.doesNotMatch(config, /revalidatePresentonConnection/);
});

test("AuthGate uses GSlide tokens/kit instead of AUTH_THEME", async () => {
  const auth = await readNext("components/Auth/AuthGate.tsx");
  assert.doesNotMatch(auth, /const AUTH_THEME/);
  assert.match(auth, /GSlideWordmark|GSlideCard|var\(--gslide-/);
  assert.doesNotMatch(auth, /PresentonSplashLoader/);
  assert.doesNotMatch(auth, /PRESENTON_SPLASH_MIN_DURATION_MS/);
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
  assert.doesNotMatch(settings, /LLM === "presenton"/);
});

test("template and generation APIs do not request Presenton Cloud", async () => {
  const template = await readNext(
    "app/(presentation-generator)/services/api/template.ts",
  );
  assert.doesNotMatch(template, /presenton_cloud_only/);
  assert.doesNotMatch(template, /presentonCloudOnly/);

  const generation = await readNext(
    "app/(presentation-generator)/services/api/presentation-generation.ts",
  );
  assert.doesNotMatch(generation, /LLM === "presenton"/);
  assert.doesNotMatch(generation, /usePresentonSmartEndpoint/);
});

test("Presenton Cloud onboarding UI file is removed", async () => {
  await assert.rejects(
    () =>
      readNext("components/OnBoarding/OnboardingPresentonAccount.tsx"),
    (error) => error && error.code === "ENOENT",
  );
});

test("onboarding wizard chrome is GSlide blue", async () => {
  const mode = await readNext("components/OnBoarding/OnboardingMode.tsx");
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
  assert.match(presentation, /aria-label="Go to dashboard"/);
  assert.doesNotMatch(presentation, /className="w-10 h-10"/);

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
  "components/OnBoarding/OnboardingMode.tsx",
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
  "app/(presentation-generator)/upload/components/GenerationModeDialog.tsx",
  "app/(presentation-generator)/upload/components/CommunityReferencePicker.tsx",
  "components/OnBoarding/FinalStep.tsx",
  "app/(presentation-generator)/upload/page.tsx",
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

const SLIDE_EDITOR_BANNED_HEX = [
  ...BANNED_HEX,
  "#7C3AED",
  "#F4F1FF",
  "#E4D7FF",
  "#F6F6F9",
];

const SLIDE_EDITOR_CHROME_FILES = [
  "components/slide-editor/toolbar/inlineStyles.ts",
  "components/slide-editor/text/TextToolbar.tsx",
  "components/slide-editor/charts/ChartEditorContent.tsx",
  "components/slide-editor/charts/ChartColorPalette.tsx",
  "components/slide-editor/images/ImageToolbar.tsx",
  "components/slide-editor/images/IconsEditor.tsx",
  "components/slide-editor/images/ImagePickerModal.tsx",
  "components/slide-editor/images/IconToolbar.tsx",
  "components/slide-editor/shapes/ShapeToolbar.tsx",
  "components/slide-editor/tables/TableToolbar.tsx",
  "components/slide-editor/selection/ComponentActionsMenu.tsx",
  "components/slide-editor/layout/LayoutToolbar.tsx",
  "components/slide-editor/layout/InfographicToolbarControls.tsx",
  "app/(presentation-generator)/components/ImageEditorToolbar.tsx",
];

test("slide-editor chrome files do not contain banned purple or skeleton gray", async () => {
  for (const file of SLIDE_EDITOR_CHROME_FILES) {
    const source = await readNext(file);
    for (const hex of SLIDE_EDITOR_BANNED_HEX) {
      assert.doesNotMatch(
        source,
        new RegExp(hex.replace("#", "\\#"), "i"),
        `${file} still contains ${hex}`,
      );
    }
  }
});

test("slide-editor chrome uses GSlide accent tokens for active toolbar states", async () => {
  const imageToolbar = await readNext(
    "components/slide-editor/images/ImageToolbar.tsx",
  );
  assert.match(imageToolbar, /--gslide-accent/);
  assert.doesNotMatch(imageToolbar, /#7C3AED/);

  const shapeToolbar = await readNext(
    "components/slide-editor/shapes/ShapeToolbar.tsx",
  );
  assert.match(shapeToolbar, /--gslide-accent/);

  const layoutToolbar = await readNext(
    "components/slide-editor/layout/LayoutToolbar.tsx",
  );
  assert.match(layoutToolbar, /--gslide-accent/);
});

test("chart slide palette is unchanged", async () => {
  const chart = await readNext(
    "components/slide-editor/charts/TemplateV2ChartJsElement.tsx",
  );
  assert.match(chart, /#8B5CF6/);
  assert.match(chart, /#7F22FE/);
});

test("Konva surface nodes are not restyled as product chrome", async () => {
  const nodes = await readNext("components/slide-editor/surface/nodes.tsx");
  assert.doesNotMatch(nodes, /--gslide-accent/);
  assert.doesNotMatch(nodes, /--gslide-bg/);
});

test("onboarding sidebar and shared Header use GSlide wordmark", async () => {
  const sidebar = await readNext("components/OnBoarding/OnBoardingSlidebar.tsx");
  assert.match(sidebar, /GSlideWordmark/);
  const header = await readNext("components/Header.tsx");
  assert.match(header, /GSlideWordmark/);
});

test("app metadata titles use GSlide", async () => {
  const notFound = await readNext("app/not-found.tsx");
  assert.match(notFound, /GSlide/);
  assert.doesNotMatch(notFound, /Presenton/);
});

test("session cookie and API key identity are GSlide with Presenton fallback", async () => {
  const proxy = await readNext("proxy.ts");
  assert.match(proxy, /gslide_session/);
  assert.match(proxy, /presenton_session/);
  assert.match(proxy, /sk-gslide-/);
  assert.match(proxy, /sk-presenton-/);
  assert.match(proxy, /GSlide API/);
  assert.doesNotMatch(proxy, /Presenton API/);

  const exporter = await readNext("lib/run-bundled-presentation-export.ts");
  assert.match(exporter, /gslide_session/);
  assert.match(exporter, /presenton_session/);
});

test("app metadata does not use presenton.ai", async () => {
  const layout = await readNext("app/layout.tsx");
  assert.doesNotMatch(layout, /presenton\.ai/);
  assert.match(layout, /NEXT_PUBLIC_SITE_URL/);
  assert.match(layout, /\/apple-icon\.png/);

  const upload = await readNext(
    "app/(presentation-generator)/upload/page.tsx",
  );
  assert.doesNotMatch(upload, /presenton\.ai/);
  assert.doesNotMatch(upload, /PresentOn/);
  assert.doesNotMatch(upload, /@presenton_ai/);

  const outline = await readNext(
    "app/(presentation-generator)/outline/page.tsx",
  );
  assert.doesNotMatch(outline, /presenton\.ai/);
});

test("onboarding and community copy are GSlide not Presenton product", async () => {
  const mode = await readNext("components/OnBoarding/OnboardingMode.tsx");
  assert.doesNotMatch(mode, /Presenton account/);
  assert.doesNotMatch(mode, /how Presenton creates/);

  const picker = await readNext(
    "app/(presentation-generator)/upload/components/CommunityReferencePicker.tsx",
  );
  assert.doesNotMatch(picker, /\|\| "Presenton"/);

  const preview = await readNext(
    "app/(presentation-generator)/(dashboard)/community/components/CommunityDesignPreviewDialog.tsx",
  );
  assert.doesNotMatch(preview, /Presenton managed/);
});

test("PresentonMode filename is gone", async () => {
  await assert.rejects(
    () => readNext("components/OnBoarding/PresentonMode.tsx"),
    (error) => error && error.code === "ENOENT",
  );
  const home = await readNext("components/Home.tsx");
  assert.match(home, /OnboardingMode/);
  assert.doesNotMatch(home, /PresentonMode/);
});

test("chart preview size helper lives in chart-data", async () => {
  const data = await readNext("components/slide-editor/charts/chart-data.ts");
  assert.match(data, /export function chartPreviewSourceSize/);
  const editor = await readNext(
    "components/slide-editor/charts/ChartEditorContent.tsx",
  );
  assert.match(editor, /chartPreviewSourceSize/);
  assert.doesNotMatch(editor, /function chartPreviewSourceSize/);
});
