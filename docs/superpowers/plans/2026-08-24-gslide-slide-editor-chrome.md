# GSlide Slide-Editor Chrome (Task 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle slide-editor floating toolbars, picker modals, and selection overlays onto `--gslide-*` tokens so editor chrome matches Auth/dashboard, without changing Konva/slide markup.

**Architecture:** Task 10 restyled presentation/template headers only. Remaining purple lives in `components/slide-editor/**` toolbars (mostly `#7C3AED` / `#F4F1FF` / `#F6F6F9`). Swap those to CSS variables already defined in `app/globals.css`. Compact toolbar `<input>`s stay native (do not drop in `GSlideInput`, which is `h-12` Auth-sized). Chart/table/Konva *slide content* is out of scope.

**Tech Stack:** Next.js 16, React 19, Tailwind, `cn()`, `GSLIDE_TOKENS` in `components/gslide/tokens.ts`, Node.js `node:test` source-contract tests.

**Spec:** `docs/superpowers/specs/2026-08-24-gslide-ui-kit-restyle-design.md`  
**Parent plan:** `docs/superpowers/plans/2026-08-24-gslide-ui-kit-restyle.md` (Tasks 1–11 complete)

## Global Constraints

- Tokens (copy from spec): `--gslide-bg` `#EFF6FF`, `--gslide-card` `#FFFFFF`, `--gslide-border` `#BFDBFE`, `--gslide-ink` `#1E3A5F`, `--gslide-muted` `#4B7AB5`, `--gslide-accent` `#1D6FE8`, `--gslide-accent-hover` `#1558C0`, `--gslide-accent-soft` `#DBEAFE`, `--gslide-input-border` `#93C5FD`, `--gslide-input-focus` `#1D6FE8`.
- Banned purple on editor chrome after this plan: `#7C51F8`, `#5146E5`, `#7A5AF8`, `#6847F4`, `#6d46e6`, `#F4F3FF`, `#D9D6FE`, plus the leftover toolbar purples `#7C3AED`, `#F4F1FF`, `#E4D7FF`.
- Gray wait/hover `#F6F6F9` on these chrome files becomes `var(--gslide-accent-soft)` (pulse/hover) — not left as skeleton gray.
- Focus rings: `focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]` (same mix as `GSlideButton` / `GSlideInput`).
- **Do not restyle slide markup:** Konva `Stage`/`Layer`/`Group`/`Shape` fills in `surface/`, `DEFAULT_CHART_COLORS` in `charts/TemplateV2ChartJsElement.tsx`, on-slide table/text renderers (`tables/TemplateV2TableElement.tsx`, `tables/TableInlineEditor.tsx`, `text/TiptapInlineTextEditor.tsx` content, `text/template-v2-*.ts`). Crop/selection *overlays* and floating toolbars **are** chrome and **are** in scope.
- `GSlideInput` is `h-12 w-full`. Use it only for panel/form fields that are already full-width (`h-9`+). Compact toolbar numeric/color inputs keep native `<input>` and only change border/focus tokens.
- Hidden `type="file"` inputs stay unchanged.
- Do not rename files, add barrels, or change routes in this plan.
- Tests: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

## Hex → token map (use everywhere in this plan)

| Old chrome hex | Replacement |
|---|---|
| `#7C3AED` | `var(--gslide-accent)` |
| `#F4F1FF` | `var(--gslide-accent-soft)` |
| `#E4D7FF` | `var(--gslide-border)` |
| `#F6F6F9` (hover / menu / skeleton pulse) | `var(--gslide-accent-soft)` |
| `#DBEAFE` (already accent-soft hex) | `var(--gslide-accent-soft)` |
| `#1D6FE8` (already accent hex, in chrome only) | `var(--gslide-accent)` |
| `ring-[#7C3AED]` / `ring-[#7C3AED]/30` | `ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]` or `ring-[var(--gslide-accent)]/30` |
| `focus-visible:ring-[#7C3AED]` | `focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]` |

Do **not** map `#8B5CF6` / `#7F22FE` in `TemplateV2ChartJsElement.tsx` — those are series colors painted on the slide.

## File map

- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`
- Modify: `servers/nextjs/components/slide-editor/toolbar/inlineStyles.ts`
- Modify: `servers/nextjs/components/slide-editor/text/TextToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx`
- Modify: `servers/nextjs/components/slide-editor/charts/ChartColorPalette.tsx` (panel labels only)
- Modify: `servers/nextjs/components/slide-editor/images/ImageToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/images/IconsEditor.tsx`
- Modify: `servers/nextjs/components/slide-editor/images/ImagePickerModal.tsx`
- Modify: `servers/nextjs/components/slide-editor/images/IconToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/shapes/ShapeToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/tables/TableToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/selection/ComponentActionsMenu.tsx`
- Modify: `servers/nextjs/components/slide-editor/layout/LayoutToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/layout/InfographicToolbarControls.tsx`
- Modify: `servers/nextjs/components/slide-editor/surface/TemplateV2KonvaSlide.tsx` (loading placeholder only)
- Modify: `servers/nextjs/app/(presentation-generator)/components/ImageEditorToolbar.tsx` (same purple pattern, not under `slide-editor/`)
- Do not modify: `servers/nextjs/components/slide-editor/charts/TemplateV2ChartJsElement.tsx`, `surface/nodes.tsx`, table/text on-slide renderers

## Scan note (2026-08-24)

The earlier “76 unstaged files” were already committed with Tasks 1–11. This plan scans **HEAD** `slide-editor/` chrome, not that working tree. `git status` leftover (`gslide-logo.png`, README logo, Wordmark) is **out of this plan** — it is P3.

`surface/*` has **no** banned purple. Task 12g only restyles the loading empty state (`bg-gray-100`) in `TemplateV2KonvaSlide.tsx`. Do not edit Konva node drawing.

`text/*` is already mostly accent hex. Task 12b swaps remaining `#DBEAFE` / `#1D6FE8` in `TextToolbar.tsx` style objects to CSS vars.

---

### Task 12a: Contract tests for slide-editor chrome

**Files:**
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: existing `readNext()`, `BANNED_HEX`, `CHROME_FILES`
- Produces: `SLIDE_EDITOR_CHROME_FILES` list + extra banned purples; later tasks make these tests pass one group at a time

- [ ] **Step 1: Write the failing test**

Append after the existing `migrated chrome files do not contain banned purple hex` test:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL on `slide-editor chrome files do not contain banned purple or skeleton gray` (`ImageToolbar.tsx` still has `#7C3AED`; `ShapeToolbar.tsx` still has `#F6F6F9`). Existing Tasks 1–11 tests still PASS. `chart slide palette is unchanged` and `Konva surface nodes` PASS already.

- [ ] **Step 3: No product code yet**

Leave the new tests failing. Implementation is Tasks 12b–12i.

- [ ] **Step 4: Do not commit until 12b lands with the first passing group**

If you must checkpoint, commit **only** the test file with message `test(ui): add slide-editor chrome token contracts` — otherwise hold and commit with 12b.

---

### Task 12b: `toolbar/inlineStyles.ts` + `text/*`

**Files:**
- Modify: `servers/nextjs/components/slide-editor/toolbar/inlineStyles.ts`
- Modify: `servers/nextjs/components/slide-editor/text/TextToolbar.tsx`
- Test: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: CSS variables on `:root` (Task 1)
- Produces: `editorTheme.primary` / `primarySoft` as `var(--gslide-*)`; TextToolbar active styles use the same vars. Compact font-size `<input>` stays native.

- [ ] **Step 1: Confirm 12a tests still fail on these two files**

Grep: `Select-String -Path servers/nextjs/components/slide-editor/toolbar/inlineStyles.ts,servers/nextjs/components/slide-editor/text/TextToolbar.tsx -Pattern '#7C3AED|#F6F6F9|#DBEAFE|#1D6FE8'`

Expected: `inlineStyles.ts` has `primary: "#1D6FE8"` and `primarySoft: "#DBEAFE"`; `TextToolbar.tsx` has `background: "#DBEAFE"` / `color: "#1D6FE8"` in `buttonActive`.

- [ ] **Step 2: Restyle `inlineStyles.ts`**

Replace the `editorTheme` object:

```ts
const editorTheme = {
  surface: "#FFFFFF",
  border: "#EDEEEF",
  text: "#191919",
  primary: "var(--gslide-accent)",
  primarySoft: "var(--gslide-accent-soft)",
  danger: "#D83B3B",
} as const;
```

Leave `surface` / `border` / `text` / `danger` as-is (not banned hex). All consumers of `editorTheme.primary` (`iconButtonActive`, `actionButton`, `opacityInput.accentColor`, `textEditor.border`) pick up the token automatically.

Do **not** import `GSlideInput` here — these styles feed 28px toolbar widgets.

- [ ] **Step 3: Restyle `TextToolbar.tsx` active styles**

In the `textToolbarStyles.buttonActive` object (around the `color: "#1D6FE8"` / `background: "#DBEAFE"` pair):

```ts
  buttonActive: {
    color: "var(--gslide-accent)",
    background: "var(--gslide-accent-soft)",
  },
```

Font-size / color `<input>`s in this file stay native. If a visible text input has `outline-none` and no focus ring, add:

```tsx
className="... outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]"
```

or the equivalent `style` if that control is inline-styled: `outline: "2px solid color-mix(in srgb, var(--gslide-accent) 15%, transparent)"` is **not** required if the control already uses `editorTheme.primary` as border on focus. Prefer Tailwind `className` when the input already has one.

Do not edit `text/TiptapInlineTextEditor.tsx`, `text/template-v2-text.ts`, `text/text-runs.ts`.

- [ ] **Step 4: Run tests**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL still, but **not** on `inlineStyles.ts` or `TextToolbar.tsx`. Failures remain in images/shapes/layout files.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/tests/gslide-ui-kit.test.mjs \
  servers/nextjs/components/slide-editor/toolbar/inlineStyles.ts \
  servers/nextjs/components/slide-editor/text/TextToolbar.tsx
git commit -m "feat(ui): token-restyle slide-editor text toolbar chrome"
```

---

### Task 12c: `charts/*` chrome (not slide series colors)

**Files:**
- Modify: `servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx`
- Modify: `servers/nextjs/components/slide-editor/charts/ChartColorPalette.tsx`
- Do not modify: `servers/nextjs/components/slide-editor/charts/TemplateV2ChartJsElement.tsx`

**Interfaces:**
- Consumes: `GSlideInput` from `@/components/gslide`
- Produces: chart *editor panel* fields use GSlide tokens; on-slide Chart.js colors stay `#7F22FE` / `#8B5CF6`

- [ ] **Step 1: Swap `ChartTextField` (full-width `h-9`) to `GSlideInput`**

At the top of `ChartEditorContent.tsx` add:

```ts
import { GSlideInput } from "@/components/gslide";
```

Replace the labeled full-width field (the one with `className="mt-1.5 h-9 w-full truncate rounded-lg border border-[#E6E6EA] ... focus:border-[#1D6FE8]"`):

```tsx
    <label className="block text-[12px] font-medium text-[var(--gslide-muted)]">
      {label}
      <GSlideInput
        className="mt-1.5 h-9 px-3 text-[12px]"
        maxLength={CHART_TEXT_MAX_LENGTH}
        placeholder={placeholder}
        spellCheck={false}
        value={draftValue}
        onBlur={commitValue}
        onChange={(event) => setDraftValue(limitChartText(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
```

`GSlideInput` already sets `h-12`; `className="mt-1.5 h-9 px-3 text-[12px]"` overrides height via `cn()`.

- [ ] **Step 2: Tokenize remaining chrome hex in the same file**

Replace:
- `text-[#686873]` → `text-[var(--gslide-muted)]`
- `border-[#1D6FE8] ring-2 ring-[#DBEAFE]` → `border-[var(--gslide-accent)] ring-2 ring-[var(--gslide-accent-soft)]`
- `border-[#93C5FD] ... text-[#1D6FE8] ... hover:bg-[#DBEAFE]` → `border-[var(--gslide-input-border)] text-[var(--gslide-accent)] hover:bg-[var(--gslide-accent-soft)]`

Inline series-name `<input>` inside the floating 32px chip (`h-full ... bg-transparent`) stays native. Add `focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]` on that input.

Do **not** wrap `type="color"` swatches or the chip input with `GSlideInput`.

- [ ] **Step 3: `ChartColorPalette.tsx` panel labels**

Replace `color: "#686873"` (two occurrences, label text in the editor palette UI) with `color: "var(--gslide-muted)"`. Do not change swatch hex values that are user-editable chart colors.

- [ ] **Step 4: Run tests**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: `ChartEditorContent.tsx` and `ChartColorPalette.tsx` no longer fail the banned-hex loop. `chart slide palette is unchanged` still PASS (`#8B5CF6` present).

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx \
  servers/nextjs/components/slide-editor/charts/ChartColorPalette.tsx
git commit -m "feat(ui): token-restyle chart editor chrome"
```

---

### Task 12d: `images/*`

**Files:**
- Modify: `servers/nextjs/components/slide-editor/images/ImageToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/images/IconsEditor.tsx`
- Modify: `servers/nextjs/components/slide-editor/images/ImagePickerModal.tsx`
- Modify: `servers/nextjs/components/slide-editor/images/IconToolbar.tsx`

**Interfaces:**
- Consumes: hex → token map
- Produces: image/icon toolbars and picker modal chrome on tokens; crop overlay strokes use accent (editor overlay, not slide fill)

- [ ] **Step 1: `ImageToolbar.tsx` active + crop overlay**

Replace every `text-[#7C3AED]` / `bg-[#DBEAFE]` active pair with `text-[var(--gslide-accent)]` / `bg-[var(--gslide-accent-soft)]`.

Crop overlay (editor chrome on the canvas — in scope):

```tsx
focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]
```

```tsx
<div className="pointer-events-none absolute inset-0 border-2 border-[var(--gslide-accent)]" />
```

```tsx
className="pointer-events-none absolute z-[4] border-2 border-[var(--gslide-accent)] shadow-[0_0_0_1px_rgba(255,255,255,0.85)]"
```

Handle knobs: `focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]`. `border-[#D6D3E8]` on knobs may stay (neutral) or become `border-[var(--gslide-border)]`.

Radius/opacity `<input type="range">` and hidden file inputs stay native. Set `accent-color: var(--gslide-accent)` on ranges if they currently inherit purple.

- [ ] **Step 2: `IconsEditor.tsx`**

Replace:
- `data-[state=checked]:bg-[#7C3AED]` → `data-[state=checked]:bg-[var(--gslide-accent)]`
- `hover:bg-[#F6F6F9]` on the close button → `hover:bg-[var(--gslide-accent-soft)]`

Keep `Skeleton` import from `@/components/ui/skeleton` (already GSlide). Do not swap the Switch into a new component.

If there is a visible search `<input>` (not `sr-only` file), wrap with `GSlideInput`. The color `<input>` stays native.

- [ ] **Step 3: `ImagePickerModal.tsx`**

Replace:
- close button `hover:bg-[#F6F6F9]` → `hover:bg-[var(--gslide-accent-soft)]`
- pulse tile `bg-[#F6F6F9]` → `bg-[var(--gslide-accent-soft)]`
- empty tile `bg-[#F6F6F9]` → `bg-[var(--gslide-accent-soft)]`
- `focus-visible:ring-[#191919]` → `focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]`

The `type="file"` `className="sr-only"` stays. There is no full-width text field here — do not add `GSlideInput`.

- [ ] **Step 4: `IconToolbar.tsx`**

Replace both `hover:bg-[#F6F6F9]` with `hover:bg-[var(--gslide-accent-soft)]`.

- [ ] **Step 5: Run tests**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: all four `images/*` files pass the banned-hex loop. `slide-editor chrome uses GSlide accent tokens` PASS for `ImageToolbar.tsx`.

- [ ] **Step 6: Commit**

```bash
git add servers/nextjs/components/slide-editor/images
git commit -m "feat(ui): token-restyle image and icon editor chrome"
```

---

### Task 12e: `shapes/*`

**Files:**
- Modify: `servers/nextjs/components/slide-editor/shapes/ShapeToolbar.tsx`

**Interfaces:**
- Consumes: hex → token map
- Produces: shape picker selected ring and segmented controls on tokens; compact `<input>`s stay native

- [ ] **Step 1: Replace purple / gray chrome**

```tsx
"border-[var(--gslide-border)] bg-[var(--gslide-accent-soft)] ring-2 ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]"
```

```tsx
<div className="grid grid-cols-2 gap-1 rounded-md bg-[var(--gslide-accent-soft)] p-1">
```

(both `bg-[#F6F6F9]` grids)

```tsx
pressed && "bg-[var(--gslide-accent-soft)] text-[var(--gslide-accent)]"
```

Native number/color inputs: add the standard focus ring class if they use `outline-none`. Do not use `GSlideInput`.

- [ ] **Step 2: Run tests**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: `ShapeToolbar.tsx` passes banned-hex loop; accent-token test PASS.

- [ ] **Step 3: Commit**

```bash
git add servers/nextjs/components/slide-editor/shapes/ShapeToolbar.tsx
git commit -m "feat(ui): token-restyle shape toolbar chrome"
```

---

### Task 12f: `tables/*` + `selection/*`

**Files:**
- Modify: `servers/nextjs/components/slide-editor/tables/TableToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/selection/ComponentActionsMenu.tsx`
- Do not modify: `tables/TemplateV2TableElement.tsx`, `tables/TableInlineEditor.tsx`, `selection/SelectionTransformers.tsx` (Konva transformer strokes `#1D6FE8` / `#D9D9DE` are already accent/neutral; changing transformer stroke to CSS vars is optional and easy to get wrong in canvas `setAttr`)

**Interfaces:**
- Consumes: hex → token map
- Produces: table toolbar menu shortcut chip and component ⋮ menu hover on tokens

- [ ] **Step 1: `TableToolbar.tsx` menu shortcut**

```ts
const menuShortcutStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "4px 6px",
  borderRadius: 6,
  background: "var(--gslide-accent-soft)",
  color: "#808080",
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: "nowrap",
};
```

If this file still contains `#7C3AED` / `#F6F6F9` elsewhere, apply the same map. Do not change table cell fill colors that write into the slide model.

- [ ] **Step 2: `ComponentActionsMenu.tsx`**

Replace every `bg-[#F6F6F9]` / `hover:bg-[#F6F6F9]` / `focus:bg-[#F6F6F9]` with `bg-[var(--gslide-accent-soft)]` / `hover:bg-[var(--gslide-accent-soft)]` / `focus:bg-[var(--gslide-accent-soft)]`.

- [ ] **Step 3: Run tests**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: `TableToolbar.tsx` and `ComponentActionsMenu.tsx` pass banned-hex loop.

- [ ] **Step 4: Commit**

```bash
git add servers/nextjs/components/slide-editor/tables/TableToolbar.tsx \
  servers/nextjs/components/slide-editor/selection/ComponentActionsMenu.tsx
git commit -m "feat(ui): token-restyle table and selection menus"
```

---

### Task 12g: `layout/*` + `surface` loading placeholder

**Files:**
- Modify: `servers/nextjs/components/slide-editor/layout/LayoutToolbar.tsx`
- Modify: `servers/nextjs/components/slide-editor/layout/InfographicToolbarControls.tsx`
- Modify: `servers/nextjs/components/slide-editor/surface/TemplateV2KonvaSlide.tsx` (empty-state only)
- Do not modify: `surface/nodes.tsx`, `layout/flowLayout.ts`, `layout/layoutItems.ts`

**Interfaces:**
- Consumes: hex → token map; `GSlideInput` only if a layout control is already a full-width form field (it is not — `InlineNumberInput` is `h-7`)
- Produces: layout/infographic toolbar active states on tokens; Konva loading placeholder uses accent-soft instead of `bg-gray-100`

- [ ] **Step 1: `LayoutToolbar.tsx`**

```tsx
open && "bg-[var(--gslide-accent-soft)] text-[var(--gslide-accent)]"
```

```tsx
className="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 hover:bg-[var(--gslide-accent-soft)] cursor-pointer text-[14px] font-manrope font-medium leading-4 text-[#191919]"
```

Native `<input>` at the color/number control: add the standard focus ring; do not use `GSlideInput`.

- [ ] **Step 2: `InfographicToolbarControls.tsx`**

```tsx
open && "bg-[var(--gslide-accent-soft)] text-[var(--gslide-accent)]"
```

`InlineNumberInput` stays a native `h-7` `<input>`. Add:

```tsx
className="... outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gslide-accent)_15%,transparent)]"
```

on that input if it does not already have a focus style.

- [ ] **Step 3: Surface loading placeholder only**

In `TemplateV2KonvaSlide.tsx`, when `!uiDraft`:

```tsx
      <div className="flex h-full aspect-video flex-col items-center justify-center rounded-lg bg-[var(--gslide-accent-soft)]">
        <Loader2 className="mb-2 h-4 w-4 animate-spin text-[var(--gslide-accent)]" />
        <p className="text-center text-sm text-[var(--gslide-muted)]">Loading slide layout...</p>
      </div>
```

Do not change the `Stage` tree, `className="relative h-full w-full overflow-hidden bg-white"` (slide paper), or the hidden file input.

- [ ] **Step 4: Run tests**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: layout files pass banned-hex loop; `Konva surface nodes are not restyled` still PASS (`nodes.tsx` untouched).

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/slide-editor/layout/LayoutToolbar.tsx \
  servers/nextjs/components/slide-editor/layout/InfographicToolbarControls.tsx \
  servers/nextjs/components/slide-editor/surface/TemplateV2KonvaSlide.tsx
git commit -m "feat(ui): token-restyle layout toolbar and slide loading chrome"
```

---

### Task 12h: Adjacent HTML-slide image toolbar

`app/(presentation-generator)/components/ImageEditorToolbar.tsx` is not under `slide-editor/` but uses the same `#F4F1FF` / `#7C3AED` / `#F6F6F9` pattern. Leaving it would fail `SLIDE_EDITOR_CHROME_FILES`.

**Files:**
- Modify: `servers/nextjs/app/(presentation-generator)/components/ImageEditorToolbar.tsx`

**Interfaces:**
- Consumes: hex → token map
- Produces: HTML-slide image fit toolbar active states on tokens

- [ ] **Step 1: Replace active / hover classes**

```tsx
"cursor-pointer rounded-none px-3 py-2 text-[14px] text-[#191919] font-manrope focus:bg-[var(--gslide-accent-soft)]",
objectFit === option.value && "bg-[var(--gslide-accent-soft)] text-[var(--gslide-accent)]",
```

Same swap for `objectFit === "cover"|"contain"|"fill"` buttons and `isFocusPointMode`.

- [ ] **Step 2: Run the full contract file**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: **all 20+ tests PASS**, including `slide-editor chrome files do not contain banned purple or skeleton gray`.

If a file still fails, fix it in this task — do not expand into P4/P5 refactors.

- [ ] **Step 3: Manual check (required)**

Open a presentation in the editor:
1. Select text → floating toolbar active buttons are accent blue, not purple.
2. Select image → crop overlay and pressed tools are accent blue; picker modal pulse tiles are accent-soft, not `#F6F6F9`.
3. Select shape / table / layout → same.
4. Confirm the **slide canvas content** (Konva shapes, chart series, table cells) looks unchanged versus before this branch.
5. Tab a toolbar numeric input: focus ring is accent 15% mix.

- [ ] **Step 4: Commit**

```bash
git add servers/nextjs/app/(presentation-generator)/components/ImageEditorToolbar.tsx
git commit -m "feat(ui): token-restyle HTML slide image toolbar"
```

---

## Out of scope (do not execute with Task 12)

These were proposed as P3–P5. **Do not implement them in this plan.** Reasons:

### P3 — FastAPI `provider_settings.py` + README logo

- `servers/fastapi/services/provider_settings.py` is **171 lines** and already split (`sanitize_provider_settings` / `merge_provider_settings` / `fill_unset_from_runtime` / persist). Splitting further is not justified.
- If you later commit unrelated provider logic, run FastAPI tests first: `cd servers/fastapi; python -m pytest tests/unit/test_provider_settings.py -q` (memory of “462 pass” is not a substitute).
- `readme_assets/images/logo.png` is a README asset, not product chrome. Product wordmark is `servers/nextjs/public/gslide-logo.png`. Handle the README PNG in a **separate** commit after inspecting `git diff --stat readme_assets/images/logo.png`. Do not block Task 12 on it.

### P4 — cleanup / rename

- `PresentonMode.tsx` (~1000 lines) rename is identifier churn (`Home.tsx` import + contract test path). Filename-legacy is already accepted in the restyle spec.
- `OnboardingPresentonAccount.tsx` is already gone; `gslide-ui-kit.test.mjs` asserts `ENOENT`. No import remains. Nothing to do.
- Deleting `components/ui/skeleton.tsx` / `presenton-splash-loader.tsx` aliases forces a bulk import rewrite and breaks the existing “legacy re-export” tests. Keep the 10-line shims.

### P5 — architecture

- `slide-editor/` **already has** `text/`, `charts/`, `images/`, `shapes/`, `tables/`, `selection/`, `layout/`, `surface/` folders. Adding empty `index.ts` barrels with no consumers is ceremony.
- Changing `app/(presentation-generator)/` route groups contradicts spec non-goal: “Routes and IA are unchanged”.
- Full-repo `#7C51F8` sweep beyond editor chrome is a later residual task. Task 12 only adds the slide-editor file list. Do not expand `CHROME_FILES` to every `#F6F6F9` in upload/community in this plan (those are leftover gray, not purple CTAs).

---

## Self-review

**Spec coverage:**
- Editor chrome tokens, not slide HTML → Tasks 12b–12h; Konva/chart palette guards in 12a
- No `#F6F6F9` skeleton on migrated chrome → picker pulse + toolbar hovers in 12d–12g
- Focus ring 15% accent → compact inputs + crop handles
- `GSlideInput` where a real form field exists → `ChartTextField` only
- Non-goals (backend split, logo PNG, dark mode, routes, barrels) listed as out of scope

**Placeholder scan:** none

**Type consistency:** `GSlideInput` still `forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>`; `GSLIDE_TOKENS.accent` `#1D6FE8`; CSS var names unchanged from Task 1
