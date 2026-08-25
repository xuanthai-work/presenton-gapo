# GSlide Hygiene Cleanup — Design Spec

**Date:** 2026-08-25  
**Status:** Draft  
**Approach:** A — layered batches with review between them. Do not mix batches in one commit.

## Product goal

Finish leftover GSlide fork hygiene in three sequential batches: park WIP, rebrand session/API-key identity plus user-visible Presenton copy, then simplify a small set of Gapo-owned files. Community catalog stays on Presenton’s API. AI-generated slide HTML is unchanged.

This spec supersedes the restyle constraint “internal names (`presenton_session`, `sk-presenton-`) stay.” Cookie and API-key prefix become GSlide. It does **not** cut Community (`api.presenton.ai`).

## Decisions locked

| Topic | Choice |
|---|---|
| Sequence | Layered: Batch 0 WIP → Batch 1 identity/copy/dead code → Batch 2 simplify |
| Review | Stop after each batch: tests green, themed commit(s), human review before the next batch |
| Cookie | Write `gslide_session`. Read `gslide_session` first, then legacy `presenton_session` |
| API key | Mint `sk-gslide-…`. Accept `sk-gslide-` and legacy `sk-presenton-` |
| Product name (UI + metadata title/OG siteName) | **GSlide** |
| Community catalog | Keep fetching Presenton Community (default `https://api.presenton.ai/api/v3/community/presentations`) |
| Slide HTML | Not restyled, not renamed |
| Upstream magnets | Do not split `presentation.py`, `TemplateV2KonvaSlide.tsx`, `Chat.tsx`, `memory_layer.py` |
| Repo README | Out of scope (still describes upstream Presenton) |

## Batch 0 — Park WIP

Working tree must be clean of unrelated edits before Batch 1.

Current leftovers (as of 2026-08-25): `.gitignore`, `docs/superpowers/plans/2026-08-24-gslide-ui-kit-restyle.md`, untracked `docs/superpowers/plans/2026-08-24-gslide-slide-editor-chrome.md`. Commit those as docs/chore, or discard them. Do not include identity rename in the same commit.

Do not commit `servers/fastapi/.test-data/`.

**Exit:** `git status` clean except files this cleanup spec itself adds.

## Batch 1 — Identity, copy, dead aliases

### 1.1 Session cookie

Single source of truth in FastAPI:

```python
# servers/fastapi/api/v1/auth/config.py
SESSION_COOKIE_NAME = "gslide_session"
LEGACY_SESSION_COOKIE_NAME = "presenton_session"
```

Read path (principal, fastapi-users cookie login, export cookie header, Next proxy / bundled export):

1. Use `gslide_session` if present and non-empty.
2. Else use `presenton_session`.

Write path (login, logout, Next `/pdf-maker?exportSession=`, internal `Cookie:` header builder):

- Set/delete **only** `gslide_session`.
- On login and logout, also `delete` `presenton_session` so browsers do not keep two cookies.

Next.js duplicates the names as string literals that **must match** FastAPI (`servers/nextjs/proxy.ts`, `servers/nextjs/lib/run-bundled-presentation-export.ts`). Do not invent a third cookie name.

Existing JWT cookie values stay valid; only the cookie **name** changes. Dual-read avoids a forced logout for already-open sessions.

### 1.2 API key prefix

```python
API_KEY_PREFIX = "sk-gslide-"
LEGACY_API_KEY_PREFIX = "sk-presenton-"
```

- New rows in `models/sql/access_token.py` default to `sk-gslide-{token_hex(20)}`.
- Auth accept: `token.startswith(API_KEY_PREFIX) or token.startswith(LEGACY_API_KEY_PREFIX)`.
- Next `proxy.ts` bearer bypass: same dual prefix. Error copy: “API keys are only accepted by the GSlide API” (not Presenton).
- Do **not** rewrite existing DB tokens. Legacy keys keep working until an admin rotates them.

### 1.3 User-visible copy and metadata

Replace product-self “Presenton” with **GSlide** in Next chrome, Auth, onboarding, settings, errors, and document titles.

**Keep “Presenton” when it names the upstream product or the Community host:**

- Community catalog URL, env `PRESENTON_COMMUNITY_API_URL`, FastAPI `community_presentations.py` default host
- Legacy dashboard copy about old Presenton desktop versions (`LegacyPresentationsTable`, unsupported-deck tooltip that names the old app)
- Alembic revision names/tables `presenton_cloud_provider` (history only)
- Tests that assert Cloud modules are **gone** (`test_presenton_cloud_removed.py`)
- Internal identifiers listed in Non-goals

**Metadata (`servers/nextjs/app/layout.tsx` and per-route `generateMetadata`):**

- `title` / Open Graph `title` / `siteName` already say GSlide; keep them.
- Stop using `https://presenton.ai` as `metadataBase`, `openGraph.url`, `alternates.canonical`, and OG image host.
- Add `NEXT_PUBLIC_SITE_URL` (forward in `docker-compose.yml`). Resolve `metadataBase` as `new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")`.
- OG image: `/apple-icon.png` (already used as the GSlide apple touch icon at `servers/nextjs/app/apple-icon.png`). Not `presenton.ai/presenton-feature-graphics.png`.

**Known copy sites (not exhaustive; grep `Presenton` / `presenton.ai` in `servers/nextjs` before closing the batch):**

- `components/OnBoarding/PresentonMode.tsx` — “Presenton account” / “how Presenton creates visuals” → GSlide
- `app/(presentation-generator)/custom-template/CustomTemplatePage.tsx`
- `CommunityDesignPreviewDialog.tsx` fallback “Presenton managed” → “GSlide” (or omit vendor)
- `CommunityReferencePicker.tsx` fallback author `"Presenton"` → `"Community"`
- `proxy.ts` 403 detail string
- `lib/user-config-store.ts` console prefix `[Presenton]` → `[GSlide]`
- Comments in `utils/api.ts` that say Presenton cloud

Do not rename `PRESENTON_COMMUNITY_API_URL`.

### 1.4 Dead aliases (not Cloud history)

- Delete `servers/nextjs/components/ui/presenton-splash-loader.tsx`. Import `GSlideSplashLoader` / `GSLIDE_SPLASH_MIN_DURATION_MS` directly. Update `gslide-ui-kit.test.mjs` (it currently asserts the re-export exists).
- Leave `OnboardingPresentonAccount.tsx` absent (already deleted). Keep the contract test that asserts `ENOENT`.
- Do not delete alembic `e4b6c8d0a2f3` / `c6e8f1a3b5d7` or `migrations.py` table-name checks.

### 1.5 Tests (Batch 1)

FastAPI:

- Cookie tests keep using `SESSION_COOKIE_NAME` (now `gslide_session`).
- Add: login sets `gslide_session` and does not rely on `presenton_session` being the write name.
- Add: principal/export header reads legacy `presenton_session` when the new cookie is missing.
- Add: API key with `sk-presenton-…` still authenticates; newly created key starts with `sk-gslide-`.

Next:

- Contract test: no `title: "Presenton` / user-visible product string `Presenton` in chrome files already listed in `gslide-ui-kit.test.mjs`, plus layout metadata host is not `presenton.ai`.
- Splash test: imports `GSlideSplashLoader`, not the deleted alias file.

Manual: log in, confirm cookie `gslide_session`; open a tab that still has `presenton_session` only and confirm the session still works once; generate one presentation; open Community list (still Presenton API).

## Batch 2 — Simplify Gapo-owned files

Behavior-preserving. No new UX. No API shape change.

**In scope**

1. **Rename** `components/OnBoarding/PresentonMode.tsx` → `OnboardingMode.tsx` (export `OnboardingMode`). Update `Home.tsx` and `gslide-ui-kit.test.mjs` paths. Filename is leftover brand, not an upstream merge magnet.
2. **Chart editor helpers** in `servers/nextjs/components/slide-editor/charts/`: move `chartPreviewSourceSize` from `ChartEditorContent.tsx` into `chart-data.ts` next to `removeChartColorTarget`. Leave Delete/Backspace JSX and `onDeleteColor` wiring in `ChartEditorContent.tsx` / `ChartToolbar.tsx`. Do not add a new palette file. Keep `--gslide-*` classes where they are.
3. **Splash/loader imports** leftover after Batch 1: one import path, no `Presenton*` aliases in product code.

**Out of scope (merge magnets / high regression)**

- `servers/fastapi/api/v1/ppt/endpoints/presentation.py`
- `servers/nextjs/components/slide-editor/surface/TemplateV2KonvaSlide.tsx`
- `servers/nextjs/components/slide-editor/surface/nodes.tsx`
- `servers/nextjs/app/(presentation-generator)/presentation/components/Chat.tsx`
- `servers/fastapi/services/chat/memory_layer.py`
- `servers/fastapi/templates/v2/generation.py`

If a later pass splits those, it is a different spec.

**Exit:** existing Next contract tests + FastAPI auth/export cookie tests pass. Chart color delete (upstream `1045e22e`) still works: Delete/Backspace removes a color when more than one remains.

## Architecture notes

```
Browser
  Cookie: gslide_session (write)
          presenton_session (read fallback, delete on login/logout)
  Bearer: sk-gslide-* | sk-presenton-*
    → Next proxy.ts (dual prefix bypass to FastAPI)
    → FastAPI principal.py / cookie auth
Community UI
    → FastAPI community_presentations.py
    → https://api.presenton.ai/...  (unchanged)
```

Cookie name and API prefix are identity. Filesystem paths (`/tmp/presenton`), Mem0 collection `presenton_memories`, ContextVar `presenton_current_owner_id`, and password-reset secret `presenton-admin-managed-passwords` stay. Changing those breaks data or invalidates tokens without a migration.

## Non-goals

- Cutting or replacing Community catalog
- Renaming env `PRESENTON_COMMUNITY_API_URL`
- Rewriting root `README.md` / upstream docs
- Changing `/tmp/presenton` default data dirs or Mem0 collection name
- Renaming ContextVars or Mixpanel event names
- Changing `reset_password_token_secret`
- Restyling AI slide HTML
- Dark mode
- Splitting FastAPI generation/chat files
- Pushing to origin (only when asked)

## Success criteria

- New logins set `gslide_session` only.
- A browser that only has `presenton_session` still authenticates until next login/logout.
- New admin API keys start with `sk-gslide-`; old `sk-presenton-` keys still work.
- Next tab title / OG site name is GSlide; canonical/OG URLs are not `presenton.ai`.
- Community list still loads from Presenton API.
- No `presenton-splash-loader.tsx` alias.
- Chart color deletion and GSlide chrome tokens still work.
- Each batch is its own commit (or a short themed series), reviewed before the next batch starts.

## Test plan (manual, after Batch 1)

1. Hard-refresh Auth: wordmark GSlide, cookie after login is `gslide_session`.
2. Call an admin API with an existing `sk-presenton-` key if one exists; then create a new key and confirm prefix.
3. Open Community: designs still load; chrome copy says GSlide, not Presenton Cloud.
4. Generate a standard deck and confirm slide HTML looks as before.
5. In chart editor, add two colors, Delete one; last color cannot be deleted.
