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
