# Split Web / API Containers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the combined GSlide Docker image into nginx `production`/`development` proxies plus `web`/`api` (and `web-dev`/`api-dev`) containers while keeping `docker compose up production --build` and one browser origin on port 5001.

**Architecture:** Root Compose still starts the stack with one command. `production`/`development` are nginx. Network aliases `proxy` / `web` / `api` keep a single `nginx.conf`. Chromium and `presentation-export` live only on `api`. Next `/api/export-presentation` calls FastAPI. Puppeteer opens `http://proxy/pdf-maker`. PostHog compose is unchanged.

**Tech Stack:** Docker Compose, nginx 1.27-alpine, Next.js standalone, FastAPI/uvicorn, Node `node --test`, pytest.

**Spec:** `docs/superpowers/specs/2026-08-26-split-web-api-containers-design.md`

## Global Constraints

- Stay in this monorepo. No GitLab three-project split.
- Local DX: one root compose, one command. Not `cd web` / `cd api`.
- Public origin is host port 5001 → proxy `:80`. Do not publish 3000/8000 by default.
- `production` and `development` **are nginx**. Aliases: proxies `proxy`, Next `web`, FastAPI `api`.
- Web image: no Chromium, no FastAPI, no nginx.
- API image: FastAPI + Chromium + LiteParse + `presentation-export`. No Next standalone, no nginx.
- SearXNG sidecar unchanged; `api` / `api-dev` `depends_on: [searxng]`.
- PostHog stays `deploy/posthog/`. Root compose must not include it. Forward `POSTHOG_*` only into web.
- Delete `start.js`, root `Dockerfile`, `Dockerfile.dev`.
- `EXPORT_PAGE_BASE_URL=http://proxy` in Compose. `NEXT_PUBLIC_FAST_API` unset. `FAST_API_INTERNAL_URL=http://api:8000` on web.
- Next and FastAPI bind `0.0.0.0`.
- `app_data` rw on api, ro on web, not on proxy.
- nginx `proxy_pass` `/static/` and `/app_data/` to api; keep `auth_request`.
- Do not commit unless the human asks. Do not push unless asked.

## File map

- Create: `servers/nextjs/tests/split-web-api-containers.test.mjs`
- Create: `scripts/start-api.js`
- Create: `Dockerfile.web`, `Dockerfile.api`, `Dockerfile.dev.web`, `Dockerfile.dev.api`
- Modify: `nginx.conf`
- Modify: `docker-compose.yml`
- Modify: `servers/fastapi/server.py`
- Modify: `servers/fastapi/utils/export_utils.py`
- Modify: `servers/fastapi/tests/unit/test_small_surfaces_coverage.py`
- Modify: `servers/nextjs/app/api/export-presentation/route.ts`
- Modify: `scripts/package-metadata.test.mjs`
- Modify: `.github/workflows/docker-release.yml`
- Modify: `.env.example`, `README.md`, `CONTRIBUTING.md`, `setup-presonton.md`, `docs/architecture/00-overview.md`, `docs/architecture/01-level-workspace.md`, `docs/architecture/05-level-export-runtime.md`, `deploy/posthog/README.md`
- Delete: `start.js`, `Dockerfile`, `Dockerfile.dev`

---

### Task 1: Source-assertion tests (fail first)

**Files:**
- Create: `servers/nextjs/tests/split-web-api-containers.test.mjs`

**Interfaces:**
- Consumes: repo files listed in the spec Tests section
- Produces: `node --test tests/split-web-api-containers.test.mjs` (run from `servers/nextjs`)

- [ ] **Step 1: Write the test**

Create `servers/nextjs/tests/split-web-api-containers.test.mjs`:

```js
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(nextRoot, "..", "..");

async function readRepo(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

test("compose splits proxy/web/api and does not start PostHog", async () => {
  const compose = await readRepo("docker-compose.yml");
  for (const name of [
    "production:",
    "development:",
    "web:",
    "api:",
    "web-dev:",
    "api-dev:",
    "searxng:",
  ]) {
    assert.match(compose, new RegExp(`^  ${name}`, "m"));
  }
  assert.match(compose, /FAST_API_INTERNAL_URL=http:\/\/api:8000/);
  assert.match(compose, /EXPORT_PAGE_BASE_URL=http:\/\/proxy/);
  assert.doesNotMatch(compose, /clickhouse/i);
  assert.doesNotMatch(compose, /deploy\/posthog/);
});

test("nginx proxies to web and api hostnames", async () => {
  const nginx = await readRepo("nginx.conf");
  assert.match(nginx, /http:\/\/web:3000/);
  assert.match(nginx, /http:\/\/api:8000/);
  assert.doesNotMatch(nginx, /http:\/\/localhost:3000/);
  assert.doesNotMatch(nginx, /http:\/\/localhost:8000/);
  assert.match(nginx, /proxy_pass http:\/\/api:8000\/static\//);
  assert.match(nginx, /auth_request \/_auth_check/);
});

test("web Dockerfiles have no chromium; api Dockerfiles have no Next standalone", async () => {
  const web = await readRepo("Dockerfile.web");
  const webDev = await readRepo("Dockerfile.dev.web");
  const api = await readRepo("Dockerfile.api");
  const apiDev = await readRepo("Dockerfile.dev.api");
  assert.doesNotMatch(web, /chromium/);
  assert.doesNotMatch(webDev, /chromium/);
  assert.doesNotMatch(api, /\.next-build\/standalone/);
  assert.doesNotMatch(apiDev, /\.next-build\/standalone/);
  assert.match(api, /start-api\.js/);
  assert.match(apiDev, /start-api\.js/);
});

test("start.js is gone; start-api.js does not spawn Next or nginx", async () => {
  await assert.rejects(
    () => access(path.join(repoRoot, "start.js")),
    (error) => error && error.code === "ENOENT",
  );
  const startApi = await readRepo("scripts/start-api.js");
  assert.doesNotMatch(startApi, /nextjsDir/);
  assert.doesNotMatch(startApi, /service", \["nginx"/);
  assert.match(startApi, /server\.py/);
});

test("export route calls FastAPI and FastAPI reads EXPORT_PAGE_BASE_URL", async () => {
  const route = await readNext("app/api/export-presentation/route.ts");
  assert.doesNotMatch(route, /runBundledPresentationExport/);
  assert.match(route, /\/api\/v1\/ppt\/presentation\//);
  const exportUtils = await readRepo("servers/fastapi/utils/export_utils.py");
  assert.match(exportUtils, /EXPORT_PAGE_BASE_URL/);
});
```

- [ ] **Step 2: Run the test; expect FAIL**

Run from `servers/nextjs`:

```bash
node --test tests/split-web-api-containers.test.mjs
```

Expected: FAIL (missing files / old nginx localhost / start.js still present).

- [ ] **Step 3: Do not commit unless asked**

---

### Task 2: nginx.conf

**Files:**
- Modify: `nginx.conf`

**Interfaces:**
- Consumes: FastAPI already mounts `/static` and `/app_data` StaticFiles
- Produces: upstreams `web:3000` and `api:8000`; static/app_data `proxy_pass`

- [ ] **Step 1: Replace loopback upstreams**

Replace every `http://localhost:3000` with `http://web:3000` and every `http://localhost:8000` with `http://api:8000`.

- [ ] **Step 2: Change `/static/` from alias to proxy_pass**

Replace the `/static/` location body `alias /app/servers/fastapi/static/;` with:

```
      proxy_pass http://api:8000/static/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
```

Keep `expires` / `Cache-Control` if they still apply; if nginx ignores them on proxied responses that is acceptable.

- [ ] **Step 3: Change each `/app_data/...` location from alias to proxy_pass**

For example `/app_data/images/` becomes `proxy_pass http://api:8000/app_data/images/;` plus the same proxy headers. **Keep** `auth_request /_auth_check;` and `disable_symlinks on;` on the locations that have them today. Repeat for `exports`, `uploads`, `fonts`, `templates`, `pptx-to-html`, `pptx-to-json`.

Keep `location = /_auth_check` pointing at `http://api:8000/api/v1/auth/verify`.

- [ ] **Step 4: Re-run Task 1 nginx test**

`node --test tests/split-web-api-containers.test.mjs` — nginx assertions PASS; other tests still FAIL.

---

### Task 3: FastAPI bind host + EXPORT_PAGE_BASE_URL

**Files:**
- Modify: `servers/fastapi/server.py`
- Modify: `servers/fastapi/utils/export_utils.py`
- Modify: `servers/fastapi/tests/unit/test_small_surfaces_coverage.py`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_URL` fallback for pytest
- Produces: `server.py --host` (default `0.0.0.0`); `_get_export_page_base_url()`

- [ ] **Step 1: Add a unit test for EXPORT_PAGE_BASE_URL**

In `test_small_surfaces_coverage.py` next to `test_export_includes_optional_fastapi_param`, add:

```python
def test_export_page_base_url_prefers_export_env():
    async def runner():
        fake_result = MagicMock(path="/exports/deck.pdf")
        dummy = uuid.uuid4()
        mock_pdf = AsyncMock(return_value=fake_result)
        with patch.dict(
            os.environ,
            {
                "EXPORT_PAGE_BASE_URL": "http://proxy",
                "NEXT_PUBLIC_URL": "http://localhost:5001",
            },
            clear=False,
        ), patch.object(EXPORT_TASK_SERVICE, "export_from_url", mock_pdf):
            await export_presentation(dummy, title="safe", export_as="pdf")
        assert mock_pdf.await_args.kwargs["url"].startswith(
            "http://proxy/pdf-maker?"
        )

    asyncio.run(runner())
```

Imports already include `os`, `uuid`, `MagicMock`, `AsyncMock`, `patch`, `export_presentation`, `EXPORT_TASK_SERVICE`. Add `asyncio` import if missing.

- [ ] **Step 2: Run the new test; expect FAIL**

From `servers/fastapi`:

```bash
uv run --locked python -m pytest tests/unit/test_small_surfaces_coverage.py::test_export_page_base_url_prefers_export_env -v
```

Expected: FAIL (`EXPORT_PAGE_BASE_URL` unused).

- [ ] **Step 3: Implement export URL + host**

In `export_utils.py` replace `_get_next_public_url` usage for the pdf-maker origin:

```python
def _get_export_page_base_url() -> str:
    return (
        (os.getenv("EXPORT_PAGE_BASE_URL") or os.getenv("NEXT_PUBLIC_URL") or "").strip()
        or "http://127.0.0.1"
    )
```

In `_build_presentation_export_url`:

```python
    export_url = f"{_get_export_page_base_url().rstrip('/')}/pdf-maker?{urlencode(params)}"
```

In `server.py` add `--host` defaulting to `0.0.0.0`:

```python
    parser.add_argument("--host", type=str, default="0.0.0.0")
    ...
    host = args.host
```

- [ ] **Step 4: Re-run pytest**

```bash
uv run --locked python -m pytest tests/unit/test_small_surfaces_coverage.py::test_export_page_base_url_prefers_export_env tests/unit/test_small_surfaces_coverage.py::test_export_includes_optional_fastapi_param -v
```

Expected: PASS. Existing test still uses `NEXT_PUBLIC_URL` when `EXPORT_PAGE_BASE_URL` is unset.

---

### Task 4: `scripts/start-api.js` and delete `start.js`

**Files:**
- Create: `scripts/start-api.js`
- Delete: `start.js`

**Interfaces:**
- Consumes: `scripts/user-config-env.cjs`, `scripts/presenton-terminal-banner.mjs`, `scripts/sync-presentation-export.cjs`
- Produces: API-only process; `python server.py --host 0.0.0.0 --port 8000 --reload ...`

- [ ] **Step 1: Create start-api.js**

Copy from `start.js`: umask, `APP_DATA_DIRECTORY` required, `ensureAppDataDirectories`, `readJsonConfig` / `writeUserConfig` / `setupUserConfigFromEnv`, `ensurePresentationExportRuntime` (keep `--dev` sync behavior).

Do **not** copy: `nextjsDir`, `spawnNextjsProcess`, `startNginx`, `syncNginxConfigForDev`, `FAST_API_INTERNAL_URL` default.

Spawn:

```js
spawn(
  "python",
  [
    "server.py",
    "--host",
    "0.0.0.0",
    "--port",
    "8000",
    "--reload",
    isDev ? "true" : "false",
  ],
  { cwd: join(__dirname, "../servers/fastapi"), stdio: "inherit", env: process.env }
);
```

`__dirname` is repo root when the file lives at `scripts/start-api.js` — use `join(__dirname, "..")` as app root and `join(appRoot, "servers/fastapi")` as cwd.

After FastAPI listens (reuse `waitForProcessHttp` on `0.0.0.0`/`127.0.0.1` port 8000 path `/api/v1/auth/status`, or inherit stdio and print the banner after a short HTTP wait), call `printGSlideStartupBanner` with `nextPort` unused; public URL from `PRESENTON_HTTP_HOST_PORT` or `5001`.

If HTTP wait is too heavy, print the banner immediately after spawn and document that nginx/web may still be starting. Prefer the HTTP wait copied from `start.js` (`waitForProcessHttp`) targeting `127.0.0.1:8000` (uvicorn listens on all interfaces, loopback still works inside the api container).

- [ ] **Step 2: Delete `start.js`**

- [ ] **Step 3: Syntax-check start-api.js**

```bash
node --check scripts/start-api.js
```

Expected: exit 0.

---

### Task 5: Dockerfiles + package-metadata + GHCR workflow

**Files:**
- Create: `Dockerfile.web`, `Dockerfile.api`, `Dockerfile.dev.web`, `Dockerfile.dev.api`
- Modify: `scripts/package-metadata.test.mjs`
- Modify: `.github/workflows/docker-release.yml`
- Delete: `Dockerfile`, `Dockerfile.dev`

**Interfaces:**
- Consumes: current multi-stage `Dockerfile` / `Dockerfile.dev`
- Produces: four Dockerfiles matching the spec

- [ ] **Step 1: Update package-metadata test to the api Dockerfiles**

In `scripts/package-metadata.test.mjs` read `Dockerfile.api` and `Dockerfile.dev.api` instead of `Dockerfile` / `Dockerfile.dev`. Keep asserting `COPY package.json` (api still copies root `package.json` for presentation-export version) and `sync-presentation-export.cjs --force`.

- [ ] **Step 2: Write Dockerfile.web**

Take the `nextjs-builder` stage from current `Dockerfile` plus a slim `node:20-bookworm-slim` runtime:

- `COPY` standalone, `public`, `.next-build/static`
- `ENV HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1`
- `EXPOSE 3000`
- `CMD ["node", "servers/nextjs/server.js"]` — match the standalone output layout from the current image (`COPY --from=nextjs-builder /app/servers/nextjs/.next-build/standalone/ /app/servers/nextjs/` then `WORKDIR /app/servers/nextjs` and `CMD ["node", "server.js"]` with `HOSTNAME`/`PORT` env). **No chromium.**

- [ ] **Step 3: Write Dockerfile.api**

Take `fastapi-builder` + `assets-builder` + the current runtime **minus** nginx packages, **minus** nextjs-builder copies, **minus** `COPY nginx.conf`. Keep Chromium, fonts, tesseract, Node, LiteParse, presentation-export, venv, FastEmbed cache.

`COPY scripts/start-api.js scripts/user-config-env.cjs scripts/sync-presentation-export.cjs scripts/presenton-terminal-banner.mjs scripts/gslide-ascii.txt` (and LICENSE/NOTICE if the banner needs them).

`EXPOSE 8000`  
`CMD ["node", "/app/scripts/start-api.js"]`

- [ ] **Step 4: Write Dockerfile.dev.web**

`FROM node:20-bookworm-slim`, workdir `/app/servers/nextjs`, copy `servers/nextjs/package.json` + lock, `npm ci`, `EXPOSE 3000`, `CMD ["npx", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]`. Compose bind-mounts `.:/app` or `servers/nextjs` over this; installing in the image is a fallback. **No chromium.**

- [ ] **Step 5: Write Dockerfile.dev.api**

Current `Dockerfile.dev` minus nginx install, minus `COPY nginx.conf`, minus any Next-only setup. `CMD ["node", "/app/scripts/start-api.js", "--dev"]`. Keep Chromium, uv, LiteParse, presentation-export, spaCy, FastEmbed.

- [ ] **Step 6: Delete `Dockerfile` and `Dockerfile.dev`**

- [ ] **Step 7: Split GHCR workflow into two build-push jobs**

`.github/workflows/docker-release.yml`: two jobs (or one job, two `docker/build-push-action` steps) using `file: Dockerfile.web` tags `${IMAGE_NAME}-web:${TAG}` and `file: Dockerfile.api` tags `${IMAGE_NAME}-api:${TAG}` where `IMAGE_NAME` stays as today. Verify inspect for both. Do not invent GitLab registry.

- [ ] **Step 8: Run package-metadata test**

```bash
node --test scripts/package-metadata.test.mjs
```

Expected: PASS.

---

### Task 6: Root docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: four Dockerfiles, `nginx.conf`, SearXNG block as today
- Produces: `docker compose up production` starts proxy+web+api+searxng

- [ ] **Step 1: Replace `production` / `development` app services with nginx proxies plus web/api**

Keep `searxng` almost identical.

Use YAML anchors for env lists. Required shape:

```yaml
services:
  production:
    image: nginx:1.27-alpine
    ports:
      - "${PRESENTON_HTTP_HOST_PORT:-5001}:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - web
      - api
    networks:
      default:
        aliases:
          - proxy

  web:
    platform: ${PRESENTON_DOCKER_PLATFORM:-linux/amd64}
    build:
      context: .
      dockerfile: Dockerfile.web
    expose:
      - "3000"
    volumes:
      - ./app_data:/app_data:ro
    environment:
      - FAST_API_INTERNAL_URL=http://api:8000
      - HOSTNAME=0.0.0.0
      - PORT=3000
      - USER_CONFIG_PATH=/app_data/userConfig.json
      - DISABLE_ANONYMOUS_TRACKING=${DISABLE_ANONYMOUS_TRACKING:-}
      - POSTHOG_HOST=${POSTHOG_HOST:-}
      - POSTHOG_PROJECT_API_KEY=${POSTHOG_PROJECT_API_KEY:-}
      - NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-}
    networks:
      default:
        aliases:
          - web

  api:
    platform: ${PRESENTON_DOCKER_PLATFORM:-linux/amd64}
    build:
      context: .
      dockerfile: Dockerfile.api
    expose:
      - "8000"
    volumes:
      - ./app_data:/app_data
      - ./servers/fastapi/templates:/app/servers/fastapi/templates:ro
    depends_on:
      - searxng
    environment:
      # copy today's production LLM/auth/db/mem0/searxng/puppeteer env
      - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
      - APP_DATA_DIRECTORY=/app_data
      - USER_CONFIG_PATH=/app_data/userConfig.json
      - SEARXNG_BASE_URL=${SEARXNG_BASE_URL:-http://searxng:8080}
      - EXPORT_PAGE_BASE_URL=http://proxy
      - NEXT_PUBLIC_URL=http://localhost:${PRESENTON_HTTP_HOST_PORT:-5001}
      - PRESENTON_HOST_HTTP_PORT=${PRESENTON_HOST_HTTP_PORT:-5001}
      # plus every current production env except POSTHOG_* (PostHog stays on web)
    networks:
      default:
        aliases:
          - api

  development:
    image: nginx:1.27-alpine
    ports:
      - "${PRESENTON_HTTP_HOST_PORT:-5001}:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - web-dev
      - api-dev
    networks:
      default:
        aliases:
          - proxy

  web-dev:
    # Dockerfile.dev.web, bind-mount .:/app (or servers/nextjs), node_modules volume
    # same web env as web
    # alias web
    # command: npx next dev -H 0.0.0.0 -p 3000 if image CMD is not enough

  api-dev:
    # Dockerfile.dev.api, bind-mount .:/app, app_data rw, templates
    # same api env, depends_on searxng, alias api
    # command: node /app/scripts/start-api.js --dev

  searxng:
    # unchanged
```

Copy the **full** current `production` `environment` list onto `api` except `POSTHOG_HOST` and `POSTHOG_PROJECT_API_KEY` (those only on web). Keep `DISABLE_ANONYMOUS_TRACKING` on **both** web (telemetry-status) and api (user-config bootstrap).

`web-dev` volumes: follow today’s `development` bind-mount `.:/app` plus a dedicated next node_modules volume if needed (`presenton_next_node_modules` at `/app/servers/nextjs/node_modules`). Drop `presenton_root_node_modules` if the root `package.json` npm install is no longer required on web-dev.

`api-dev` volumes: `.:/app`, `./app_data:/app_data`, liteparse named volume as today.

Do not `depends_on` PostHog. Do not `include` `deploy/posthog`.

- [ ] **Step 2: Validate compose**

```bash
docker compose config
```

Expected: exit 0, services `production`, `web`, `api`, `development`, `web-dev`, `api-dev`, `searxng`.

---

### Task 7: Next export route calls FastAPI

**Files:**
- Modify: `servers/nextjs/app/api/export-presentation/route.ts`

**Interfaces:**
- Consumes: `getFastApiBaseUrl()` from `@/lib/fastapi-internal`, FastAPI `POST /api/v1/ppt/presentation/{id}/export` body `{ export_as: "pdf" | "pptx" }`
- Produces: same browser JSON `{ success: true, path: string }` where `path` is a same-origin `/app_data/...` URL

- [ ] **Step 1: Replace Chromium spawn with FastAPI fetch**

Keep `readExportRequestBody`, auth check, format/id validation.

Remove imports of `runBundledPresentationExport` / `bundledExportPackageAvailable`. Remove `moveExportIntoOwnerDirectory` (api already owner-scopes).

```ts
import { getFastApiBaseUrl } from "@/lib/fastapi-internal";

function toAppDataUrl(fastapiPath: string): string {
  const trimmed = fastapiPath.trim().replace(/\\/g, "/");
  if (trimmed.startsWith("/app_data/")) {
    return trimmed;
  }
  const appData = (process.env.APP_DATA_DIRECTORY || "/app_data").replace(/\\/g, "/").replace(/\/+$/, "");
  if (trimmed.startsWith(`${appData}/`)) {
    return `/app_data/${trimmed.slice(appData.length + 1)}`;
  }
  if (trimmed.startsWith("app_data/")) {
    return `/${trimmed}`;
  }
  throw new Error("Export path is not under /app_data");
}

// inside POST, after validation:
  const response = await fetch(
    `${getFastApiBaseUrl()}/api/v1/ppt/presentation/${encodeURIComponent(id.trim())}/export`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({ export_as: format }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: detail || "Export failed", success: false },
      { status: response.status },
    );
  }
  const payload = (await response.json()) as { path?: string };
  if (!payload.path) {
    throw new Error("No path returned from export");
  }
  return NextResponse.json({
    success: true,
    path: toAppDataUrl(payload.path),
  });
```

Leave `/api/export-presentation/file` in place (unused by the new path). Leave `lib/run-bundled-presentation-export.ts` on disk.

- [ ] **Step 2: Run Next tests + tsc**

From `servers/nextjs`:

```bash
node --test tests/split-web-api-containers.test.mjs
npx tsc --noEmit
npm test
```

Expected: split-web-api test PASS (after Tasks 1–7). `tsc` exit 0. Full `npm test` PASS. If `gslide-ui-kit.test.mjs` asserts `runBundledPresentationExport` from the **route**, update that assertion to FastAPI fetch; keep exporter tests that only read `lib/run-bundled-presentation-export.ts`.

---

### Task 8: Docs + .env.example + PostHog recreate

**Files:**
- Modify: `.env.example`, `README.md`, `CONTRIBUTING.md`, `setup-presonton.md`, `docs/architecture/00-overview.md`, `docs/architecture/01-level-workspace.md`, `docs/architecture/05-level-export-runtime.md`, `deploy/posthog/README.md`

- [ ] **Step 1: Document four containers**

Commands stay:

```bash
docker compose up production --build
docker compose up development --build
```

State that `production`/`development` are nginx and that Next/FastAPI/SearXNG start via `depends_on`. After `.env` change, recreate `web` and `api` (or `web-dev` / `api-dev`).

PostHog README: `docker compose up -d --force-recreate web` (not the old single `production` app container).

`.env.example`: add comment for `EXPORT_PAGE_BASE_URL` only if operators override it; Compose sets `http://proxy`. Mention `FAST_API_INTERNAL_URL` is Compose-only.

Architecture docs: replace “one image / start.js orchestrator” with proxy + web + api.

- [ ] **Step 2: Re-run split-web-api + posthog compose assertions**

```bash
node --test tests/split-web-api-containers.test.mjs tests/posthog-error-reporting.test.mjs
```

from `servers/nextjs`. Expected: PASS. Update `posthog-error-reporting.test.mjs` compose assertions if they require `POSTHOG_HOST` on a service named `production` — PostHog env now lives on `web` / `web-dev`.

---

### Task 9: Verification

- [ ] **Step 1: FastAPI unit tests**

```bash
cd servers/fastapi
uv run --locked python -m pytest tests/unit/test_small_surfaces_coverage.py tests/unit/test_web_search.py tests/unit/test_export_cookie_header.py -v
```

- [ ] **Step 2: Next tests + tsc**

```bash
cd servers/nextjs
npx tsc --noEmit
npm test
```

- [ ] **Step 3: Manual Docker (operator)**

```bash
docker compose up production --build
```

Open `http://localhost:5001`, login, generate, export PPTX and PDF. Confirm four containers. Confirm PostHog is not in `docker compose ps`.

If Docker build cannot run in this session, report that and leave the checklist item unchecked.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| One origin 5001, nginx proxy | 2, 6 |
| Aliases proxy/web/api | 6 |
| Four Dockerfiles, delete combined | 5 |
| start-api.js, delete start.js | 4 |
| FastAPI 0.0.0.0 + EXPORT_PAGE_BASE_URL | 3 |
| Next export → FastAPI | 7 |
| SearXNG sidecar, no PostHog in root compose | 6 |
| Source tests + package-metadata + GHCR | 1, 5 |
| Docs | 8 |
| Two-folder local DX | Out of scope (spec reconfirmed) |
