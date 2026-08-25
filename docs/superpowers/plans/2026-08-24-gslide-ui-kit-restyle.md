# GSlide UI Kit Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status (2026-08-24):** Tasks 1–11 complete on `main`. **Follow-on Task 12** (slide-editor floating toolbars / picker chrome) is in `docs/superpowers/plans/2026-08-24-gslide-slide-editor-chrome.md` — not started. Original constraint “Do not change FastAPI Presenton Cloud modules / Backend OAuth stays” is **superseded**: OAuth router, cloud proxy, `presenton_cloud_provider` table, and leftover `LLM === "presenton"` UI are removed. Community catalog (`api.presenton.ai`) is unchanged. Internal names (`presenton_session`, `sk-presenton-`) stay.

**Goal:** Restyle all Next.js product chrome to the Auth blue palette under the GSlide brand, via a reusable kit, including splash/skeleton/loader states.

**Architecture:** Put Auth colors on `:root` as `--gslide-*` CSS variables. Build presentational components in `servers/nextjs/components/gslide/`. Migrate wait states, then Auth/landing, dashboard chrome, wizards, then editor chrome. Hide Presenton Cloud UI. Do not restyle AI-generated slide HTML. FastAPI Presenton Cloud OAuth/proxy is removed (supersedes the earlier “leave backend OAuth” constraint).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, existing `cn()` helper, Node.js `node:test` source-contract tests (this repo has no React Testing Library).

**Spec:** `docs/superpowers/specs/2026-08-24-gslide-ui-kit-restyle-design.md`

## Global Constraints

- Brand wordmark is the text **GSlide** with `font-unbounded`. No new logo PNG.
- Tokens: `--gslide-bg` `#EFF6FF`, `--gslide-card` `#FFFFFF`, `--gslide-border` `#BFDBFE`, `--gslide-ink` `#1E3A5F`, `--gslide-muted` `#4B7AB5`, `--gslide-accent` `#1D6FE8`, `--gslide-accent-hover` `#1558C0`, `--gslide-accent-soft` `#DBEAFE`, `--gslide-input-border` `#93C5FD`, `--gslide-input-focus` `#1D6FE8`.
- After chrome migrate, do not use `#7C51F8`, `#5146E5`, `#7A5AF8`, `#6847F4`, `#6d46e6`, `#F4F3FF`, `#D9D6FE` on product chrome.
- Presenton Cloud onboarding/settings is removed from UI, not renamed GSlide Cloud. FastAPI OAuth + proxy + `presenton_cloud_provider` are removed (migration `e4b6c8d0a2f3`).
- AI-generated slide HTML is unchanged.
- Routes and IA are unchanged (`/dashboard`, `/upload`, `/community`, `/settings`, `/presentation`).
- Dark mode is out of scope.
- Run tests from `servers/nextjs`: `node --test tests/gslide-ui-kit.test.mjs`

## File map

- Create: `servers/nextjs/tests/gslide-ui-kit.test.mjs`
- Create: `servers/nextjs/components/gslide/tokens.ts` (hex constants mirroring CSS, for tests and TS)
- Create: `servers/nextjs/components/gslide/index.ts`
- Create: `servers/nextjs/components/gslide/GSlideWordmark.tsx`
- Create: `servers/nextjs/components/gslide/GSlideButton.tsx`
- Create: `servers/nextjs/components/gslide/GSlideCard.tsx`
- Create: `servers/nextjs/components/gslide/GSlidePage.tsx`
- Create: `servers/nextjs/components/gslide/GSlideInput.tsx`
- Create: `servers/nextjs/components/gslide/GSlideSkeleton.tsx`
- Create: `servers/nextjs/components/gslide/GSlideSplashLoader.tsx`
- Create: `servers/nextjs/components/gslide/GSlideSidebar.tsx`
- Create: `servers/nextjs/components/gslide/GSlideHeader.tsx`
- Modify: `servers/nextjs/app/globals.css` (`:root` in `@layer base`)
- Modify: `servers/nextjs/components/ui/skeleton.tsx`
- Modify: `servers/nextjs/components/ui/presenton-splash-loader.tsx` (re-export GSlide splash)
- Modify: `servers/nextjs/app/loading.tsx`
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx`
- Modify: `servers/nextjs/components/Auth/AuthGate.tsx`
- Modify: `servers/nextjs/app/page.tsx`
- Modify: `servers/nextjs/app/layout.tsx` (metadata title)
- Modify: dashboard layout, sidebar, DashboardPage, dashboard Header, community, settings, admin, onboarding, upload loading, outline header, presentation header, template headers, overlay loader
- FastAPI Cloud modules deleted; drop migration `alembic/versions/e4b6c8d0a2f3_drop_presenton_cloud_provider.py`

---

### Task 1: CSS tokens and contract test

**Files:**
- Create: `servers/nextjs/tests/gslide-ui-kit.test.mjs`
- Create: `servers/nextjs/components/gslide/tokens.ts`
- Modify: `servers/nextjs/app/globals.css` (the `:root` block starting near line 17)

**Interfaces:**
- Consumes: none
- Produces: CSS variables on `:root` named exactly as in Global Constraints; `GSLIDE_TOKENS` object in `tokens.ts` with the same hex values

- [ ] **Step 1: Write the failing test**

Create `servers/nextjs/tests/gslide-ui-kit.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (file missing and/or tokens missing)

- [ ] **Step 3: Write minimal implementation**

Add to `globals.css` inside the existing `@layer base { :root { ... } }` block (do not replace shadcn HSL tokens; append):

```css
    --gslide-bg: #EFF6FF;
    --gslide-card: #FFFFFF;
    --gslide-border: #BFDBFE;
    --gslide-ink: #1E3A5F;
    --gslide-muted: #4B7AB5;
    --gslide-accent: #1D6FE8;
    --gslide-accent-hover: #1558C0;
    --gslide-accent-soft: #DBEAFE;
    --gslide-input-border: #93C5FD;
    --gslide-input-focus: #1D6FE8;
```

Create `servers/nextjs/components/gslide/tokens.ts`:

```ts
export const GSLIDE_TOKENS = {
  bg: "#EFF6FF",
  card: "#FFFFFF",
  border: "#BFDBFE",
  ink: "#1E3A5F",
  muted: "#4B7AB5",
  accent: "#1D6FE8",
  accentHover: "#1558C0",
  accentSoft: "#DBEAFE",
  inputBorder: "#93C5FD",
  inputFocus: "#1D6FE8",
} as const;
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/app/globals.css servers/nextjs/components/gslide/tokens.ts servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): add GSlide CSS tokens"
```

---

### Task 2: Primitive kit (wordmark, button, card, page, input, skeleton)

**Files:**
- Create: `servers/nextjs/components/gslide/GSlideWordmark.tsx`
- Create: `servers/nextjs/components/gslide/GSlideButton.tsx`
- Create: `servers/nextjs/components/gslide/GSlideCard.tsx`
- Create: `servers/nextjs/components/gslide/GSlidePage.tsx`
- Create: `servers/nextjs/components/gslide/GSlideInput.tsx`
- Create: `servers/nextjs/components/gslide/GSlideSkeleton.tsx`
- Create: `servers/nextjs/components/gslide/index.ts`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; CSS variables from Task 1
- Produces:
  - `GSlideWordmark({ className?: string })` renders text `GSlide`
  - `GSlideButton({ variant?: "primary" | "secondary", className?: string } & ButtonHTMLAttributes<HTMLButtonElement>)`
  - `GSlideCard({ className?: string, children })`
  - `GSlidePage({ className?: string, children })`
  - `GSlideInput` forwardRef to `HTMLInputElement`, same props as native input
  - `GSlideSkeleton({ className?: string } & HTMLAttributes<HTMLDivElement>)`
  - barrel `export` from `components/gslide/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/gslide-ui-kit.test.mjs`:

```js
test("GSlide primitives use tokens and GSlide wordmark", async () => {
  const wordmark = await readNext("components/gslide/GSlideWordmark.tsx");
  assert.match(wordmark, />GSlide</);
  assert.match(wordmark, /font-unbounded/);
  assert.match(wordmark, /--gslide-ink/);

  const button = await readNext("components/gslide/GSlideButton.tsx");
  assert.match(button, /--gslide-accent/);
  assert.match(button, /rounded-full/);
  assert.match(button, /variant \?= "primary"/);

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (primitive files missing)

- [ ] **Step 3: Write minimal implementation**

`GSlideWordmark.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function GSlideWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-unbounded font-normal tracking-[-0.03em] text-[var(--gslide-ink)]",
        className,
      )}
    >
      GSlide
    </span>
  );
}
```

`GSlideButton.tsx`:

```tsx
import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type GSlideButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function GSlideButton({
  variant = "primary",
  className,
  type = "button",
  ...props
}: GSlideButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "rounded-full px-5 py-3 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]",
        variant === "primary"
          ? "bg-[var(--gslide-accent)] text-white hover:bg-[var(--gslide-accent-hover)]"
          : "border border-[var(--gslide-border)] bg-[var(--gslide-card)] text-[var(--gslide-ink)]",
        className,
      )}
      {...props}
    />
  );
}
```

`GSlideCard.tsx`:

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GSlideCard({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--gslide-border)] bg-[var(--gslide-card)] p-7 shadow-sm sm:p-9",
        className,
      )}
      {...props}
    />
  );
}
```

`GSlidePage.tsx`:

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GSlidePage({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-screen bg-[var(--gslide-bg)] text-[var(--gslide-ink)]", className)}
      {...props}
    />
  );
}
```

`GSlideInput.tsx`:

```tsx
import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const GSlideInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function GSlideInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-lg border bg-[var(--gslide-card)] px-4 text-sm outline-none transition placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60",
        "border-[var(--gslide-input-border)] focus:border-[var(--gslide-input-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--gslide-input-focus)_15%,transparent)]",
        className,
      )}
      {...props}
    />
  );
});
```

`GSlideSkeleton.tsx`:

```tsx
import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GSlideSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--gslide-accent-soft)]",
        className,
      )}
      {...props}
    />
  );
}
```

`index.ts`:

```ts
export { GSLIDE_TOKENS } from "./tokens";
export { GSlideWordmark } from "./GSlideWordmark";
export { GSlideButton } from "./GSlideButton";
export { GSlideCard } from "./GSlideCard";
export { GSlidePage } from "./GSlidePage";
export { GSlideInput } from "./GSlideInput";
export { GSlideSkeleton } from "./GSlideSkeleton";
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/gslide servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): add GSlide primitive kit"
```

---

### Task 3: Splash loader kit and compatibility re-export

**Files:**
- Create: `servers/nextjs/components/gslide/GSlideSplashLoader.tsx`
- Modify: `servers/nextjs/components/gslide/index.ts`
- Modify: `servers/nextjs/components/ui/presenton-splash-loader.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideWordmark`
- Produces:
  - `GSlideSplashLoader({ message?: string, className?: string })`
  - `GSLIDE_SPLASH_MIN_DURATION_MS = 3000`
  - `PresentonSplashLoader` and `PRESENTON_SPLASH_MIN_DURATION_MS` re-exported from `presenton-splash-loader.tsx` so existing imports keep compiling

- [ ] **Step 1: Write the failing test**

Append:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`GSlideSplashLoader.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { GSlideWordmark } from "./GSlideWordmark";

export const GSLIDE_SPLASH_MIN_DURATION_MS = 3000;

export function GSlideSplashLoader({
  message = "Preparing your workspace",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={message}
      role="status"
      className={cn(
        "fixed inset-0 z-[2147483000] flex min-h-screen items-center justify-center bg-[var(--gslide-bg)]",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-6">
        <GSlideWordmark className="text-3xl sm:text-4xl" />
        <div
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gslide-accent-soft)] border-t-[var(--gslide-accent)]"
        />
        <p className="font-syne text-sm text-[var(--gslide-muted)]">{message}</p>
      </div>
    </main>
  );
}
```

Replace the body of `presenton-splash-loader.tsx` with:

```tsx
export {
  GSlideSplashLoader as PresentonSplashLoader,
  GSLIDE_SPLASH_MIN_DURATION_MS as PRESENTON_SPLASH_MIN_DURATION_MS,
} from "@/components/gslide/GSlideSplashLoader";
```

Export splash from `components/gslide/index.ts`:

```ts
export {
  GSlideSplashLoader,
  GSLIDE_SPLASH_MIN_DURATION_MS,
} from "./GSlideSplashLoader";
```

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/gslide/GSlideSplashLoader.tsx servers/nextjs/components/gslide/index.ts servers/nextjs/components/ui/presenton-splash-loader.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): replace Presenton splash with GSlide loader"
```

---

### Task 4: Sidebar and header kit

**Files:**
- Create: `servers/nextjs/components/gslide/GSlideSidebar.tsx`
- Create: `servers/nextjs/components/gslide/GSlideHeader.tsx`
- Modify: `servers/nextjs/components/gslide/index.ts`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideWordmark`
- Produces:
  - `GSlideSidebar({ children, footer?: ReactNode })` - 114px rail, `--gslide-bg`, `--gslide-border`, wordmark linking to `/dashboard`
  - `GSlideHeader({ title, actions?: ReactNode, href?: string })` - sticky header, wordmark optional via title string, border `--gslide-border`, background `--gslide-bg`
  - `gslideNavActiveClass = "text-[var(--gslide-accent)]"`
  - `gslideNavIdleClass = "text-[var(--gslide-muted)]"`

- [ ] **Step 1: Write the failing test**

Append:

```js
test("GSlide sidebar and header use tokens and wordmark, not purple chrome", async () => {
  const sidebar = await readNext("components/gslide/GSlideSidebar.tsx");
  assert.match(sidebar, /GSlideWordmark/);
  assert.match(sidebar, /--gslide-bg/);
  assert.match(sidebar, /--gslide-border/);
  assert.match(sidebar, /href=\{`\/dashboard`\}|href="\/dashboard"/);
  assert.doesNotMatch(sidebar, /#7C51F8/);
  assert.doesNotMatch(sidebar, /#F6F6F9/);

  const header = await readNext("components/gslide/GSlideHeader.tsx");
  assert.match(header, /--gslide-bg/);
  assert.match(header, /--gslide-border/);
  assert.match(header, /font-unbounded|--gslide-ink/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`GSlideSidebar.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { GSlideWordmark } from "./GSlideWordmark";

export const gslideNavActiveClass = "text-[var(--gslide-accent)]";
export const gslideNavIdleClass = "text-[var(--gslide-muted)]";

export function GSlideSidebar({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      className="sticky top-0 flex h-screen w-[114px] shrink-0 flex-col justify-between border-r border-[var(--gslide-border)] bg-[var(--gslide-bg)] px-4 py-8"
      aria-label="Dashboard sidebar"
    >
      <div>
        <Link
          href="/dashboard"
          className="flex items-center border-b border-[var(--gslide-border)] pb-6"
        >
          <GSlideWordmark className="mx-auto text-sm" />
        </Link>
        <nav className="pt-6 font-syne" aria-label="Dashboard sections">
          {children}
        </nav>
      </div>
      {footer}
    </aside>
  );
}
```

`GSlideHeader.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GSlideHeader({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-[105px] items-center justify-between border-b border-[var(--gslide-border)] bg-[var(--gslide-bg)] px-1",
        className,
      )}
    >
      <h1 className="whitespace-nowrap font-unbounded text-[22px] font-normal tracking-[-0.03em] text-[var(--gslide-ink)]">
        {title}
      </h1>
      {actions}
    </header>
  );
}
```

Export both plus nav class constants from `index.ts`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/gslide servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): add GSlide sidebar and header"
```

---

### Task 5: Global wait states

**Files:**
- Modify: `servers/nextjs/components/ui/skeleton.tsx`
- Modify: `servers/nextjs/app/loading.tsx`
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideSkeleton`, `GSlideSplashLoader`, `GSLIDE_SPLASH_MIN_DURATION_MS`
- Produces: shared `Skeleton` look equals GSlide skeleton; app loading and config loading show GSlide splash / "Loading GSlide..."

- [ ] **Step 1: Write the failing test**

Append:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL on ConfigurationInitializer copy and possibly Skeleton

- [ ] **Step 3: Write minimal implementation**

Replace `components/ui/skeleton.tsx` with:

```tsx
import { GSlideSkeleton } from "@/components/gslide";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <GSlideSkeleton className={className} {...props} />;
}

export { Skeleton };
```

Keep `app/loading.tsx` using `PresentonSplashLoader` (re-export) or switch import to `GSlideSplashLoader`. Message: `"Preparing your workspace..."`.

In `ConfigurationInitializer.tsx`, replace `ConfigurationLoadingScreen` internals with `GSlideSplashLoader message="Loading GSlide..."`. Keep using `PRESENTON_SPLASH_MIN_DURATION_MS` (alias) or switch to `GSLIDE_SPLASH_MIN_DURATION_MS`. Remove the white screen + "Loading Presenton..." paragraph.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual: hard-refresh the app and confirm splash is blue + GSlide, not purple mask PNG.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/ui/skeleton.tsx servers/nextjs/app/loading.tsx servers/nextjs/app/ConfigurationInitializer.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): restyle global loading and skeletons for GSlide"
```

---

### Task 6: Auth and landing

**Files:**
- Modify: `servers/nextjs/components/Auth/AuthGate.tsx`
- Modify: `servers/nextjs/app/page.tsx`
- Modify: `servers/nextjs/app/layout.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlidePage`, `GSlideCard`, `GSlideButton`, `GSlideInput`, `GSlideWordmark`, `GSlideSplashLoader` / re-export
- Produces: Auth no longer defines local `AUTH_THEME`; landing wordmark is GSlide; document title uses GSlide

- [ ] **Step 1: Write the failing test**

Append:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

In `AuthGate.tsx`:
- Delete `AUTH_THEME`.
- Wrap the signed-out UI in `GSlidePage` (or `main` with `bg-[var(--gslide-bg)]`).
- Replace the card `section` with `GSlideCard`.
- Put `GSlideWordmark` where the commented logo was.
- Replace native inputs with `GSlideInput`.
- Replace submit `<button>` with `GSlideButton type="submit" variant="primary"`.
- Keep splash import working (`PresentonSplashLoader` re-export is fine).
- Keep mode toggle / form logic unchanged.

In `app/page.tsx`:
- Remove leftover logo `Image` if still commented; show `GSlideWordmark` above "Gapo Presentations" or replace that headline with **GSlide** as the product name (spec: chrome brand is GSlide). Use heading "GSlide" and keep the existing subtitle unless it still says Presenton.
- Primary link continues to `/auth`, styled like `GSlideButton` (className on `Link` is OK: `rounded-full bg-[var(--gslide-accent)] ...`).

In `app/layout.tsx` metadata:
- `title: "GSlide - AI presentation generator"`
- Align `openGraph` / `twitter` titles the same way. Do not change `metadataBase` URL unless it is user-facing title text.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual: open `/auth` and `/` and confirm blue card, GSlide wordmark, pill CTA.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/Auth/AuthGate.tsx servers/nextjs/app/page.tsx servers/nextjs/app/layout.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): restyle Auth and landing with GSlide kit"
```

---

### Task 7: Dashboard chrome (layout, sidebar, dashboard, community, admin)

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/layout.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/Components/DashboardSidebar.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/dashboard/components/Header.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/community/components/CommunityPage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/community/page.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/admin/page.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideSidebar`, `gslideNavActiveClass`, `gslideNavIdleClass`, `GSlideHeader`, `GSlidePage`, `GSlideButton`, `GSlideCard`
- Produces: dashboard shell on `--gslide-bg`; sidebar wordmark GSlide; active nav accent; community header/CTA/skeleton on tokens; admin primary buttons use accent not `#7C51F8`

- [ ] **Step 1: Write the failing test**

Append:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (sidebar still has purple)

- [ ] **Step 3: Write minimal implementation**

`layout.tsx`: keep `flex` wrapper; background `bg-[var(--gslide-bg)]`.

`DashboardSidebar.tsx`: wrap existing nav links in `GSlideSidebar`. Remove purple logo circle. Active icons/strokes use `gslideNavActiveClass` (`text-[var(--gslide-accent)]`); idle use `gslideNavIdleClass`. Footer: Settings, Help, Logout unchanged in behavior. Help URL may stay as-is (spec does not require changing the help href).

`DashboardPage.tsx`:
- `DashboardHeader` becomes `GSlideHeader title="Dashboard"` (drop extra white header).
- Page root `GSlidePage` or `bg-[var(--gslide-bg)]`.
- Action cards: border `--gslide-border`, focus ring `--gslide-accent` instead of `#7A5AF8`.
- Spinner `#6847F4` -> `text-[var(--gslide-accent)]`.
- Grid/list toggle focus rings to accent.

`dashboard/components/Header.tsx` (used by upload loading): wordmark area uses `GSlideWordmark` inside the existing dashboard `Link`, not the empty span.

`CommunityPage.tsx`:
- Header bg `--gslide-bg`, border `--gslide-border`, title ink.
- "New presentation" button: `GSlideButton` or accent pill (not the pastel Presenton gradient).
- Retry button: accent, not `#6847F4`.
- `CommunityGridSkeleton`: use `GSlideSkeleton` / shared `Skeleton`.
- Search input can stay, restyle border to `--gslide-input-border`.

`AdminPanel.tsx`: replace `bg-[#7C51F8]` primary class with `bg-[var(--gslide-accent)] hover:bg-[var(--gslide-accent-hover)]` and focus `ring-[var(--gslide-accent)]`.

Metadata `community/page.tsx` and `admin/page.tsx`: `Community | GSlide`, `Admin | GSlide`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual: `/dashboard`, `/community`, `/admin` share blue chrome; skeletons pulse blue-soft.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/app/(presentation-generator)/(dashboard) servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): restyle dashboard community and admin chrome"
```

---

### Task 8: Hide Presenton Cloud UI and restyle settings

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/SettingSideBar.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/WebSearchProvider.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/PrivacySettings.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/page.tsx`
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx` (Cloud status should not gate user chrome)
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: none of the Cloud OAuth endpoints from the UI
- Produces: no user-visible "Presenton Cloud" / "Connect Presenton" strings; settings chrome uses accent tokens; `OnboardingPresentonAccount.tsx` remains unimported

- [ ] **Step 1: Write the failing test**

Append:

```js
const CLOUD_UI_FILES = [
  "app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx",
  "components/OnBoarding/OnboardingPresentonAccount.tsx",
];

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (`Connect Presenton first` still in SettingPage)

- [ ] **Step 3: Write minimal implementation**

`SettingPage.tsx`:
- Remove `checkPresentonAuthStatus` and the notify that says sign in to Presenton Cloud.
- If `llmConfig.LLM === "presenton"`, treat it like an unavailable platform provider: do not show Cloud connect UX. Prefer leaving the value but hiding Cloud-specific copy; if save-path still calls presenton status, skip that branch.
- Restyle Save CTA from `bg-[#7C51F8]` to `GSlideButton` or accent token classes.
- Badge `text-[#7A5AF8]` -> `text-[var(--gslide-accent)]`.

`WebSearchProvider.tsx`: copy "Otherwise Presenton queries SearXNG" -> "Otherwise GSlide queries SearXNG". Purple info box (`#D9D6FE` / `#F4F3FF` / `#5146E5`) -> border `--gslide-border`, bg `--gslide-accent-soft`, text `--gslide-ink`.

`PrivacySettings.tsx`: "improve Presenton" -> "improve GSlide".

`settings/page.tsx`: `Settings | GSlide`.

`ConfigurationInitializer.tsx`: stop fetching `/api/v1/auth/presenton/status` to decide whether config is complete if that only exists for Cloud. If the block is `hasPresentonCloud` gating `LLM === 'presenton'`, treat `presenton` as invalid for end-user completion (config incomplete unless another provider is set) without showing Cloud UI. Do not add GSlide Cloud labeling.

Do not delete `OnboardingPresentonAccount.tsx` unless needed; do not import it.

Do not edit FastAPI OAuth files.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual: open Settings; no Cloud connect card; save button is blue pill.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/app/(presentation-generator)/(dashboard)/settings servers/nextjs/app/ConfigurationInitializer.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): hide Presenton Cloud and restyle settings"
```

---

### Task 9: Wizards (onboarding, upload, outline)

**Files:**
- Modify: `servers/nextjs/components/OnBoarding/PresentonMode.tsx`
- Modify: `servers/nextjs/components/OnBoarding/OnBoardingSlidebar.tsx`
- Modify: `servers/nextjs/components/Home.tsx` only if it still shows Presenton product chrome
- Modify: `servers/nextjs/app/(presentation-generator)/upload/loading.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/page.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/components/CurrentConfig.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/components/OutlineStandardHeader.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideButton`, `GSlideInput`, `GSlideWordmark`, `GSlideHeader` / outline link chrome
- Produces: onboarding badge GSlide; primary continue buttons accent; upload loading on GSlide skeleton; outline header wordmark GSlide without PNG

- [ ] **Step 1: Write the failing test**

Append:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (`PRESENTON` badge and/or `#7C51F8`)

- [ ] **Step 3: Write minimal implementation**

`PresentonMode.tsx` (filename can stay; do not rename in this phase):
- Badge text `PRESENTON` -> `GSLIDE`, color `text-[var(--gslide-accent)]`.
- Continue button `bg-[#7C51F8]` -> `GSlideButton` or `bg-[var(--gslide-accent)]`.
- Replace `#7A5AF8` / `#D9D6FE` / `#F4F3FF` / `#5146E5` hover, focus, selected-card styles with `--gslide-accent`, `--gslide-border`, `--gslide-accent-soft`.
- Copy that says "Presenton account" / "how Presenton creates visuals": change product name to GSlide. Do not add Cloud connect.

`OnBoardingSlidebar.tsx`: background `bg-[var(--gslide-bg)]` instead of `#F6F6F9`; place `GSlideWordmark` where the commented `Logo.png` was.

`upload/loading.tsx`: wrap with `bg-[var(--gslide-bg)]`; Header already GSlide from Task 7.

`upload/page.tsx` metadata: `GSlide | AI presentation generator`.

`CurrentConfig.tsx`: `text-[#7A5AF8]` -> `text-[var(--gslide-accent)]`.

`OutlineStandardHeader.tsx`: replace commented/disabled logo `Image` with `GSlideWordmark` inside the dashboard `Link`. Focus rings `#7A5AF8` -> `--gslide-accent`. Back hover color the same.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual: `/upload` loading skeleton is blue-soft; outline header shows GSlide text.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/OnBoarding servers/nextjs/app/(presentation-generator)/upload servers/nextjs/app/(presentation-generator)/outline servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): restyle onboarding upload and outline chrome"
```

---

### Task 10: Editor chrome (presentation, templates, overlay)

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/components/PresentationHeader.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/presentation/loading.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/template-preview/components/editor/TemplateEditorHeader.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/custom-template/CustomTemplatePage.tsx`
- Modify: `servers/nextjs/components/ui/overlay-loader.tsx`
- Modify: `servers/nextjs/components/Header.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideWordmark`
- Produces: editor top bars use GSlide wordmark (click still goes to `/dashboard`); overlay card on `--gslide-card` / `--gslide-border`; spinner accent; **no edits** to slide HTML renderers (`SmartHtmlSlide` markup, stored `slides[]` strings)

- [ ] **Step 1: Write the failing test**

Append:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (PNG still in comments or GSlideWordmark missing)

- [ ] **Step 3: Write minimal implementation**

`PresentationHeader.tsx`: replace the empty dashboard button/commented `<img src="/logo-with-bg.png">` with `GSlideWordmark` inside the existing click handler / button that `router.push("/dashboard")`. Swap `#7A5AF8` / `#5141e5` / `#6847F4` / `#F0EDFF` hover and focus to `--gslide-accent` and `--gslide-accent-soft`. Do not change slide canvas components in the same file if they only layout chrome.

`TemplateEditorHeader.tsx` and `CustomTemplatePage.tsx` StudioTopBar: same wordmark swap; `#7A5AF8` / `#5146E5` / `#7C51F8` chrome to tokens.

`overlay-loader.tsx`: panel `bg-[var(--gslide-card)] border-[var(--gslide-border)]`; text `--gslide-ink`; keep `show` / progress behavior.

`presentation/loading.tsx`: already uses `Skeleton` (now GSlide). Add `bg-[var(--gslide-bg)]` wrapper.

`components/Header.tsx`: commented `logo-white.png` replaced by `GSlideWordmark`.

Do not change `SmartHtmlSlide` or any component that injects `dangerouslySetInnerHTML` for slides.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual: open a presentation; chrome is GSlide; slide contents look as before.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/app/(presentation-generator)/presentation servers/nextjs/app/(presentation-generator)/template-preview servers/nextjs/app/(presentation-generator)/custom-template servers/nextjs/components/ui/overlay-loader.tsx servers/nextjs/components/Header.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): restyle editor chrome with GSlide wordmark"
```

---

### Task 11: Residual sweep

**Files:**
- Modify: any remaining `servers/nextjs/**/*.tsx` chrome that still contains banned purple hex or user-visible `Presenton` product name
- Modify: `servers/nextjs/app/not-found.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`
- Do not modify: `servers/fastapi/**`, slide HTML strings, `OnboardingPresentonAccount.tsx` internal copy if the file is unused (optional: leave file, test already forbids imports)

**Interfaces:**
- Consumes: token list from Task 1
- Produces: contract test listing chrome files that must not contain banned hex; user-visible Presenton product titles gone from `app/` metadata

- [ ] **Step 1: Write the failing test**

Append (adjust `CHROME_GLOBS` if a file is slide-content; do not include `OnboardingPresentonAccount.tsx` if unused, or include it and rewrite its strings only if you keep shipping the file):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL on any leftover hex or `not-found.tsx`

If extra files fail later, add them to `CHROME_FILES` and fix those files in Step 3. Do not add SmartHtml slide payload files.

- [ ] **Step 3: Write minimal implementation**

Replace remaining banned hex in listed files with `var(--gslide-*)`.

`not-found.tsx`: `Page not found | GSlide`.

Grep `servers/nextjs` for `Presenton` in `title:` and user-visible JSX strings; replace product name with GSlide. Leave code identifiers (`PresentonMode`, `PRESENTON_SPLASH_MIN_DURATION_MS` alias, Mixpanel event names, API paths `/api/v1/auth/presenton`) unchanged.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `cd servers/nextjs && node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS

Manual full pass from spec: Auth, landing, dashboard, settings, community, upload, outline, editor. Hard-refresh splash. Tab focus on CTA. Confirm one generated slide unchanged.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs
git commit -m "feat(ui): sweep leftover Presenton chrome colors and titles"
```

---

## Self-review

**Spec coverage:**
- Tokens + kit path -> Tasks 1-4
- Splash/skeleton/loading -> Tasks 3, 5, 9, 10
- Auth + landing -> Task 6
- Dashboard/settings/community/admin + hide Cloud -> Tasks 7-8
- Wizards -> Task 9
- Editor chrome, not slide HTML -> Task 10 (headers/overlay); Task 12 follow-on for slide-editor toolbars
- Residual purple / Presenton titles -> Task 11
- Non-goals (backend, logo PNG, dark mode, routes) stated in constraints
- Slide-editor floating chrome (`#7C3AED` / `#F6F6F9`) -> `docs/superpowers/plans/2026-08-24-gslide-slide-editor-chrome.md`

**Placeholder scan:** none

**Type consistency:** `GSlideButton` variant `"primary" | "secondary"`; `GSLIDE_SPLASH_MIN_DURATION_MS`; `gslideNavActiveClass` / `gslideNavIdleClass`; `GSLIDE_TOKENS` keys as in Task 1
