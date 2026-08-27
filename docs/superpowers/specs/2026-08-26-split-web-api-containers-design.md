# Split Web / API Containers — Design Spec

**Date:** 2026-08-26  
**Status:** Approved for planning (monorepo container split only)  
**Approach:** Keep one Git repo. Split the combined Docker image into `web` (Next.js), `api` (FastAPI + Chromium + export), and `proxy` (nginx). SearXNG stays a sidecar of `api`. PostHog stays a separate Compose project.

## Product goal

Operators can rebuild and restart the UI without rebuilding Chromium, Python, or LiteParse. FastAPI / PDF / PPTX deploys do not rebuild Next.js. The browser still uses **one origin** on port **5001**.

Success looks like:

- `docker compose up production --build` and `docker compose up development --build` still work.
- Four GSlide containers run: nginx proxy, Next, FastAPI, SearXNG. PostHog is not among them.
- Next and FastAPI are different PIDs in different containers.
- Login, generate, and export PDF/PPTX work at `http://localhost:5001`.
- `docker compose down` on GSlide does not stop PostHog.
- GSlide runs when PostHog env is empty.

## Problem

Root `Dockerfile` / `Dockerfile.dev` plus `start.js` put Nginx, Next.js, FastAPI, Chromium, LiteParse, and `presentation-export` in **one container**. A UI change rebuilds the heavy API image. `start.js` binds Next and FastAPI to `127.0.0.1` because nginx shares the network namespace. That layout cannot deploy frontend and backend independently on GitLab later.

## Decisions locked

| Topic | Choice |
|---|---|
| Git | **Stay in this monorepo.** No GitLab three-project split in this change. |
| Local DX | **One root compose, one command** (reconfirmed 2026-08-26). Not `cd web` / `cd api` two terminals. |
| Public URL | **One origin**, host port **5001** → proxy `:80`. Do not publish 3000/8000 on the host by default. |
| Gateway | **nginx** as Compose service. Not Next-as-only-gateway. Not two browser origins / CORS for the app. |
| Service names | `production` and `development` **are the nginx proxies**. `docker compose up production` starts proxy + `depends_on` web/api (api `depends_on` searxng). Same for `development` with `web-dev` / `api-dev`. |
| Network aliases | Next services alias `web`. FastAPI services alias `api`. Both proxies alias `proxy`. One `nginx.conf` for prod and dev. |
| Web image | Next.js only. **No Chromium, no FastAPI, no nginx.** |
| API image | FastAPI + Chromium + LiteParse + `presentation-export` + Node (export/liteparse runners). **No Next standalone, no nginx.** |
| SearXNG | Unchanged sidecar. `api` / `api-dev` `depends_on: [searxng]`. |
| PostHog | Unchanged `deploy/posthog/`. Root compose only forwards `POSTHOG_HOST` / `POSTHOG_PROJECT_API_KEY` / `DISABLE_ANONYMOUS_TRACKING` into **web**. |
| `start.js` | **Remove as the 3-process orchestrator.** API bootstrap moves to `scripts/start-api.js`. Web CMD is Next. Proxy CMD is nginx. |
| Combined Dockerfiles | **Delete** root `Dockerfile` and `Dockerfile.dev` after the four new Dockerfiles exist. |
| Export | Chromium runs **only on api**. UI `POST /api/export-presentation` stays for the browser; the Next handler **calls FastAPI** `POST /api/v1/ppt/presentation/{id}/export` instead of `runBundledPresentationExport`. |
| Puppeteer page URL | New env `EXPORT_PAGE_BASE_URL=http://proxy` (no trailing slash). FastAPI builds `/pdf-maker?...` from this, **not** from `localhost:5001`. |
| Browser / CORS origin | `NEXT_PUBLIC_URL=http://localhost:5001` (host port from `PRESENTON_HTTP_HOST_PORT`). |
| `NEXT_PUBLIC_FAST_API` | **Unset** in Compose so asset URLs stay path-only (`/app_data`, `/static`). |
| `FAST_API_INTERNAL_URL` | `http://api:8000` on web / web-dev. |
| Bind addresses | Next and FastAPI listen on **`0.0.0.0`** (nginx is another container). |
| `app_data` volume | **rw on api**; **ro on web** (telemetry `userConfig.json` only). Proxy does **not** mount it. |
| `/static` and `/app_data` | nginx **`proxy_pass` to api**. Keep `auth_request` for the existing gated `/app_data/*` locations. Do not `alias` files from the proxy filesystem. |
| GHCR workflow | Must not reference deleted Dockerfiles. Update `.github/workflows/docker-release.yml` to build **two** images (`Dockerfile.web`, `Dockerfile.api`). Do not design GitLab registry here. |

## Approaches considered

**A — nginx proxy + web + api + searxng (chosen)**  
Same origin, keep login rate-limit and `/app_data` `auth_request`, split images.

**B — Next as the only public service**  
Fewer containers. Rejected: 100MB uploads and SSE go through Next; lose nginx `auth_request`; HMR/export edge cases.

**C — Split git into three repos now**  
Rejected: do containers first. GitLab projects are a later change.

## Compose topology

```
Browser :5001
    → production | development  (nginx, alias proxy)
         /  and /_next/hmr     → web:3000   (alias web)
         /api/v1 /api/v2       → api:8000   (alias api)
         /docs /openapi.json   → api:8000
         /_auth_check          → api:8000/api/v1/auth/verify
         /static/ /app_data/   → api:8000
    api → searxng:8080
```

`docker compose up` with **no** service name still starts both `production` and `development` and will collide on 5001 — same class of footgun as today. Docs keep naming the service.

### Production services

| Service | Role | Image / build |
|---|---|---|
| `production` | nginx proxy, `5001:80`, alias `proxy` | `nginx:1.27-alpine`, mount `nginx.conf` |
| `web` | Next standalone, alias `web`, port 3000 internal | `Dockerfile.web` |
| `api` | FastAPI + Chromium, alias `api`, port 8000 internal | `Dockerfile.api` |
| `searxng` | Search sidecar | `searxng/searxng:latest` as today |

`production` `depends_on: [web, api]`. `api` `depends_on: [searxng]`.

### Development services

| Service | Role |
|---|---|
| `development` | nginx proxy, same port mapping and `nginx.conf`, alias `proxy` |
| `web-dev` | `Dockerfile.dev.web`, bind-mount Next sources, `next dev -H 0.0.0.0 -p 3000`, alias `web` |
| `api-dev` | `Dockerfile.dev.api`, bind-mount FastAPI + templates, Chromium, alias `api` |

`development` `depends_on: [web-dev, api-dev]`. `api-dev` `depends_on: [searxng]`.

Do not run `production` and `development` at the same time.

## Environment

### web / web-dev

- `FAST_API_INTERNAL_URL=http://api:8000`
- `POSTHOG_HOST`, `POSTHOG_PROJECT_API_KEY`, `DISABLE_ANONYMOUS_TRACKING`
- `NEXT_PUBLIC_SITE_URL` (metadata; default `http://localhost:5001`)
- `USER_CONFIG_PATH=/app_data/userConfig.json` (read-only volume)
- `HOSTNAME=0.0.0.0`, `PORT=3000`
- No LLM keys, no `SEARXNG_BASE_URL`, no `PUPPETEER_*`

### api / api-dev

- All LLM, image, Mem0, auth, `DATABASE_URL`, `CAN_CHANGE_KEYS`, `MIGRATE_DATABASE_ON_STARTUP`
- `SEARXNG_BASE_URL=http://searxng:8080`
- `APP_DATA_DIRECTORY=/app_data`, `USER_CONFIG_PATH=/app_data/userConfig.json`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- `NEXT_PUBLIC_URL=http://localhost:${PRESENTON_HTTP_HOST_PORT:-5001}` (CORS / browser origin)
- `EXPORT_PAGE_BASE_URL=http://proxy`
- `NEXT_PUBLIC_FAST_API` unset
- LiteParse / export package env already used in today’s image (`EXPORT_PACKAGE_ROOT`, `PRESENTON_APP_ROOT`, `BUILT_PYTHON_MODULE_PATH`, `HF_HOME`, …)

### proxy

No secrets. Only `nginx.conf` (and mime defaults from the nginx image).

## nginx.conf

Replace `http://localhost:3000` with `http://web:3000` and `http://localhost:8000` with `http://api:8000`.

Keep:

- HMR locations `/_next/(hmr|webpack-hmr|turbopack-hmr)` with upgrade + 1h timeouts
- `/api/v1/`, `/api/v2/`, login rate-limit, `/docs`, `/openapi.json`
- `client_max_body_size 100M` / 110M on upload
- `location = /_auth_check` internal → `http://api:8000/api/v1/auth/verify`
- Trailing-slash `/static/` (do not use bare `/static`)

Change `/static/` and each `/app_data/...` location from `alias` to `proxy_pass http://api:8000/...` with the same `auth_request /_auth_check` on the locations that have it today (`images`, `exports`, `uploads`, `pptx-to-html`, `pptx-to-json`). Fonts and templates stay unauthenticated as today.

FastAPI already mounts `StaticFiles` for `/static` and `/app_data`.

## Entrypoints

### `scripts/start-api.js`

Move from `start.js` only:

- Require `APP_DATA_DIRECTORY`
- Create `app_data` subdirs (`exports`, `images`, `uploads`, `fonts`, `templates`, `pptx-to-html`, `pptx-to-json`) with the same best-effort chmod
- `setupUserConfigFromEnv` via `scripts/user-config-env.cjs`
- Set `USER_CONFIG_PATH`
- In **dev**, keep presentation-export sync if the bind-mount hid the image copy (same behavior as today’s `ensurePresentationExportRuntime` for `--dev`)
- `exec` / spawn `python server.py --port 8000 --reload <true|false>` with `cwd` `servers/fastapi`

Do **not** start nginx. Do **not** start Next. Bind FastAPI on `0.0.0.0` (change `server.py` / uvicorn host if it currently binds `127.0.0.1`).

Print the existing GSlide banner from the API process after FastAPI is listening. Show public URL `http://localhost:5001` (or `PRESENTON_HTTP_HOST_PORT`). Do not wait on Next.

### Web

Production: Next standalone `server.js` with `HOSTNAME=0.0.0.0` `PORT=3000`.  
Development: `next dev -H 0.0.0.0 -p 3000`.

### Proxy

`nginx -g 'daemon off;'`.

### Delete

`start.js` after `start-api.js` covers API bootstrap. Do not leave a stub that still spawns three processes.

## Dockerfiles

### `Dockerfile.web`

Copy the current `nextjs-builder` + slim `node:20` runtime. Copy standalone, `public`, static. **No** Python, nginx, Chromium, LiteParse, `presentation-export`.  
`CMD` Next standalone.

### `Dockerfile.api`

Copy current `fastapi-builder` + `assets-builder` + Chromium/fonts/tesseract/Node runtime pieces from today’s `Dockerfile`. **No** `nextjs-builder`, **no** `nginx.conf`, **no** Next standalone.  
`CMD ["node", "/app/scripts/start-api.js"]`.

### `Dockerfile.dev.web`

Node 20, npm install for `servers/nextjs`, `CMD` `next dev`. Bind-mount supplied by compose.

### `Dockerfile.dev.api`

Today’s `Dockerfile.dev` minus nginx and minus assuming Next lives at `/app/servers/nextjs` for the orchestrator. Keep uv, Chromium, LiteParse, presentation-export, spaCy, FastEmbed warm.  
`CMD ["node", "/app/scripts/start-api.js", "--dev"]`.

Root `Dockerfile` and `Dockerfile.dev` are deleted in the same change that compose points at the new files.

## Export flow

Current UI: `POST /api/export-presentation` `{ format, id, title }` → `{ success, path }` then `downloadLink(path)`.

After:

1. Next route still authenticates (`authStatusForRequest`).
2. Next `fetch`es `FAST_API_INTERNAL_URL` `POST /api/v1/ppt/presentation/{id}/export` with `{ "export_as": format }`, forwarding `Cookie`.
3. FastAPI runs existing `export_presentation` → Puppeteer opens `{EXPORT_PAGE_BASE_URL}/pdf-maker?...` (`http://proxy/pdf-maker`). Cookie hash (`exportCookie`) stays.
4. Next maps FastAPI `path` to a same-origin URL the browser can GET. If FastAPI already returns `/app_data/exports/...`, return that. If it returns a filesystem path under `APP_DATA_DIRECTORY`, rewrite to the `/app_data/...` URL. Do **not** require the web container to spawn Chromium or to `rename` files into owner dirs (FastAPI already owner-scopes exports).
5. Browser downloads via nginx → `auth_request` → api `StaticFiles`.

Keep `/pdf-maker` and `/api/export-presentation-data/:id` on Next (Puppeteer needs that page). Stop calling `runBundledPresentationExport` from the export route. `lib/run-bundled-presentation-export.ts` may remain unused until a later cleanup; do not install `presentation-export` on the web image.

`EXPORT_PAGE_BASE_URL` is required in Compose. If unset, FastAPI keeps today’s `NEXT_PUBLIC_URL` fallback **only for non-Docker local pytest**; Compose must set the new variable so Docker export does not use `http://127.0.0.1`.

## Tests

Add `servers/nextjs/tests/split-web-api-containers.test.mjs` (source assertions, same style as `posthog-error-reporting.test.mjs`):

- `docker-compose.yml` defines `production`, `development`, `web`, `api`, `web-dev`, `api-dev`, `searxng`.
- `production` `depends_on` includes `web` and `api`; `development` includes `web-dev` and `api-dev`.
- `api` / `api-dev` `depends_on` includes `searxng`.
- Compose does **not** `include` `deploy/posthog` and does not define ClickHouse/Kafka/PostHog services.
- `nginx.conf` contains `http://web:3000` and `http://api:8000` and does **not** contain `http://localhost:3000` or `http://localhost:8000`.
- `Dockerfile.web` / `Dockerfile.dev.web` do not install `chromium`.
- `Dockerfile.api` / `Dockerfile.dev.api` do not copy Next standalone (no `.next-build/standalone`).
- `start.js` does not exist.
- `scripts/start-api.js` exists and does not spawn Next or nginx.
- `app/api/export-presentation/route.ts` does not import `runBundledPresentationExport`.
- FastAPI `export_utils.py` reads `EXPORT_PAGE_BASE_URL`.

Update `scripts/package-metadata.test.mjs` to read `Dockerfile.api` and `Dockerfile.dev.api` (not the deleted combined files). Keep asserting `sync-presentation-export.cjs --force`.

Keep existing FastAPI export / auth / web_search tests. Next: `tsc --noEmit` and the new source test plus remaining Next tests.

Manual (not automated in this spec):

- `docker compose up production --build` → `http://localhost:5001` login, generate, export PPTX and PDF.
- `docker compose up development --build` hot-reload still reaches the UI through 5001.
- SearXNG on the Compose network.
- Empty PostHog env → no capture requests. `deploy/posthog` still starts with its own command.

## Docs

Update `.env.example`, `README.md`, `CONTRIBUTING.md`, `setup-presonton.md`, `docs/architecture/00-overview.md`, `docs/architecture/01-level-workspace.md`, `docs/architecture/05-level-export-runtime.md`, and PostHog README recreate example:

- Explain four containers; `production`/`development` are the proxy.
- After `.env` change: recreate **`web` and `api`** (and the matching `*-dev` services), not “the one container”.
- PostHog: recreate **`web`** so it picks up `POSTHOG_*`.

## Out of scope

- Splitting git into `gslide-web` / `gslide-api` / `gslide-ops`.
- Moving PostHog compose, Helm, Kubernetes.
- Publishing a GitLab registry strategy.
- Merging SearXNG into the API image.
- Moving `/pdf-maker` into FastAPI.
- Deleting `lib/run-bundled-presentation-export.ts` unless the export-route change requires it for tests.
- Changing SearXNG settings or PostHog error-event list.

## Risks

- **Puppeteer vs cookie host:** Chromium in `api` loads `http://proxy/pdf-maker` while the session cookie is for `localhost:5001`. Existing `exportCookie` hash must keep working; verify PDF/PPTX export manually.
- **`0.0.0.0` bind:** required for nginx in another container; do not leave Next/FastAPI on `127.0.0.1`.
- **Dev inotify on Windows:** bind-mount hot-reload issues already exist; this split does not fix them.
- **Both proxies up:** port 5001 clash if someone `docker compose up` with no service name.
- **Telemetry file flag:** web must mount `app_data` **ro** or Settings opt-out in `userConfig.json` is invisible to `/api/telemetry-status`.
- **GHCR:** updating `docker-release.yml` is required so CI does not build a deleted `Dockerfile`; two-image tags are enough. Do not treat GHCR as the GitLab production registry.
