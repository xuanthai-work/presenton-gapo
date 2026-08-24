# GSlide UI Kit Restyle — Design Spec

**Date:** 2026-08-24  
**Status:** Implemented (2026-08-24). Chrome kit shipped; Presenton Cloud OAuth/proxy later removed from FastAPI as well.  
**Approach:** B — build a GSlide component kit, then migrate surfaces onto it.

## Product goal

Restyle the entire Next.js product chrome so it matches the Auth page palette and visual language, under the **GSlide** brand. Loading, splash, and skeleton states are in scope. Layout and routes stay; chrome, wizards, editor shell, and wait states change.

## Design read

Product-app restyle (dashboard, settings, community, upload, onboarding, editor chrome). Not a marketing landing overhaul. Auth (`AUTH_THEME` in `servers/nextjs/components/Auth/AuthGate.tsx`) is the source of truth for color and control treatment.

## Decisions locked

| Topic | Choice |
|---|---|
| Scope | Entire UI chrome, including presentation editor / template studio shell |
| Depth | Overhaul chrome and wizards (upload, onboarding), not color-swap only |
| Brand | Wordmark text **GSlide** (`font-unbounded`). No new logo PNG in this phase. Presenton PNGs stay unused. |
| Presenton Cloud | User-facing Cloud onboarding/settings is **removed**, not renamed to GSlide Cloud. FastAPI OAuth, proxy, and `presenton_cloud_provider` were later removed. Community catalog is still an external Presenton API. |
| Slide HTML | AI-generated slide markup is **not** restyled |
| Token strategy | CSS variables on `:root`; kit consumes tokens; pages consume kit |
| Dark mode | Out of scope |

## Architecture

Kit lives at `servers/nextjs/components/gslide/`. Tokens live in `servers/nextjs/app/globals.css` on `:root`. Auth local `AUTH_THEME` is replaced by the same tokens so Auth and product chrome cannot drift.

Pages must not keep one-off purple hex for chrome once migrated. Residual purple after the last migrate pass is a spec miss.

### Tokens

| Token | Hex | Use |
|---|---|---|
| `--gslide-bg` | `#EFF6FF` | Page / shell background |
| `--gslide-card` | `#FFFFFF` | Cards, panels, auth card |
| `--gslide-border` | `#BFDBFE` | Card and shell borders |
| `--gslide-ink` | `#1E3A5F` | Headings, primary text, wordmark |
| `--gslide-muted` | `#4B7AB5` | Secondary text, inactive nav |
| `--gslide-accent` | `#1D6FE8` | Primary CTA, active nav, spinner |
| `--gslide-accent-hover` | `#1558C0` | Primary CTA hover |
| `--gslide-accent-soft` | `#DBEAFE` | Skeleton pulse, soft fills, focus ring mix |
| `--gslide-input-border` | `#93C5FD` | Inputs |
| `--gslide-input-focus` | `#1D6FE8` | Input focus (same as accent) |

### Kit components

| Component | Responsibility |
|---|---|
| `GSlideWordmark` | Text “GSlide”, `font-unbounded`, ink color |
| `GSlideButton` | Primary pill (accent / white text), secondary (white / border / ink), disabled, focus ring |
| `GSlideCard` | White surface, `--gslide-border`, ~16px radius matching Auth card |
| `GSlidePage` | Min-height shell with `--gslide-bg` |
| `GSlideSidebar` | Dashboard rail: wordmark, nav, active = accent, inactive = muted, border `--gslide-border` |
| `GSlideHeader` | Chrome header + wordmark link to dashboard |
| `GSlideInput` | Auth-like height, border, focus ring 15% accent |
| `GSlideSkeleton` | Pulse using `--gslide-accent-soft` on page bg; not gray `#F6F6F9` |
| `GSlideSplashLoader` | Full-page wait: Auth bg, GSlide wordmark, accent spinner. Replaces `PresentonSplashLoader` |

Existing `components/ui/skeleton.tsx` and splash loader either wrap the GSlide versions or are replaced so every current import picks up the new look.

## Visual language

- Page shell background `#EFF6FF`. Sidebar is the same family, not gray `#F6F6F9`. No purple circle behind the brand mark.
- Titles and wordmark: `font-unbounded`, `--gslide-ink`. Body/labels may keep existing Syne/system fonts.
- Primary buttons: pill, accent fill, white label, hover `#1558C0`, active scale like Auth.
- Secondary buttons: white, `--gslide-border`, ink text.
- Focus rings: accent at 15% mix, same as Auth inputs.
- Chrome must not use `#7C51F8`, `#5146E5`, `#7A5AF8`, `#6847F4`, `#6d46e6`, `#F4F3FF`, `#D9D6FE` after migrate.

## Presenton copy and Cloud UI

Replace user-visible “Presenton” with **GSlide** on splash, landing, sidebar, headers, `ConfigurationInitializer` (“Loading Presenton…”), document titles where they name the product.

Presenton Cloud UI to hide or remove from the product surface:

- `servers/nextjs/components/OnBoarding/OnboardingPresentonAccount.tsx` (do not render in onboarding)
- Settings copy and actions that ask the user to connect Presenton Cloud (`SettingPage.tsx` and related)

Do not relabel those screens as GSlide Cloud. FastAPI Presenton Cloud modules stay unless a later spec says otherwise.

## Migration order

Each step must be visible in the UI, including that surface’s loading state. Do not leave a migrated chrome mixed with purple on the same shell.

1. Kit + tokens (components and CSS variables; no large page swap yet)
2. Global wait states: `app/loading.tsx`, splash loader, `ConfigurationInitializer`, shared `Skeleton`
3. Auth + landing (`AuthGate`, `app/page.tsx`)
4. Dashboard chrome: dashboard layout, sidebar, dashboard page/header, settings, community, admin. Community/dashboard skeletons. Hide Cloud UI.
5. Wizards: onboarding, upload, outline headers, `/upload` loading
6. Editor chrome: presentation header, template studio, template editor, overlay loader. Not slide HTML.
7. Residual sweep: leftover purple hex and Presenton product strings in Next.js UI

## Success criteria

- Auth and dashboard share the same token values.
- Chrome CTAs, nav active states, spinners, and focus rings use accent blue, not purple.
- Wordmark/text in chrome says GSlide.
- Presenton Cloud onboarding/settings is not shown.
- Splash, skeleton, overlay, and route `loading.tsx` files use GSlide wait styling.
- Generated slide HTML is unchanged.

## Non-goals (this phase)

- Changing backend/API Presenton Cloud code
- Designing or adding a GSlide logo image
- Dark mode
- Changing routes or information architecture
- Marketing copy rewrite beyond product brand Presenton → GSlide
- Restyling AI-generated slide content
- Committing this spec unless the user asks

## Test plan (manual)

Walk each surface after its migrate step: Auth, landing, dashboard, settings, community, upload, outline, editor. Hard-refresh to see splash. Trigger dashboard/community/upload skeletons. Tab through a primary button and an input to confirm focus. Confirm a generated slide still looks as before.

## Revision note

Parts 1–3 of brainstorming were approved provisionally. Token names, kit file layout, and Cloud-hide vs delete-frontend-file may be revised in this spec before or during planning.
