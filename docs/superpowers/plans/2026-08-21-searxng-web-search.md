# SearXNG Web Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `WEB_SEARCH_PROVIDER=auto`: GPT/Gemini use vendor native search when those LLMs are selected; Gemma/custom (daily driver) uses the Compose SearXNG sidecar. Drop Tavily/Exa/Brave.

**Architecture:** Default is `auto`. `get_web_search_route()` returns `native` for `LLM=openai|google`, and `external` + SearXNG for `LLM=custom` (instead of today's `unavailable`). SearXNG is a first-class Compose sidecar; FastAPI calls `http://searxng:8080/search?q=…&format=json`. Settings is a web-search on/off switch; no provider picker. GPT/Gemini stay in the product as LLM fallback and image generators — their native search stays wired for that fallback.

**Tech Stack:** FastAPI + aiohttp (existing native tools + upstream SearXNG client), Next.js web-search toggle, Docker Compose service `searxng` (always on), official `searxng/searxng` image.

**Spec:** This file. Decisions: keep `auto`; native search for OpenAI/Google; SearXNG fallback for custom; no third-party search APIs; SearXNG in Compose.

## Deploy decision

| Option | Meaning | Use? |
|--------|---------|------|
| Bake into Presenton `Dockerfile` | One container runs Next/FastAPI **and** SearXNG | **No.** Different process, ports, settings, upgrades. |
| Compose sidecar (chosen) | Second service in `docker-compose.yml`, same `docker compose up` | **Yes.** Default for this fork. |
| Run SearXNG separately | Another host/stack; Presenton only gets a URL | Escape hatch via `SEARXNG_BASE_URL` only. Not the default. |
| Compose profile `search` | Optional extra `up --profile search` | **No.** Gemma is the daily LLM, so the sidecar always starts even though GPT/Gemini native search exists. |

`production` / `development` get `depends_on: [searxng]` so search is up before the app. Do not publish SearXNG to the host unless debugging (`SEARXNG_HOST_PORT`); FastAPI talks over the Compose network.

## Global Constraints

- Web search only. Do **not** wire SearXNG image category into `ImageGenerationService`.
- Default `WEB_SEARCH_PROVIDER=auto`. Do **not** disable OpenAI/Google native web-search tools — they are the fallback when those LLMs are selected later.
- `auto` + custom LLM must use SearXNG, not `unavailable`. That is the only fork change to auto semantics vs current code.
- Remove Tavily / Exa / Brave from UI, enum usage, env, and Compose. Do not leave dead API-key fields in Settings.
- Copy SearXNG HTTP client from upstream Presenton (`_get_searxng_search_url`, `_redact_url_credentials`, `_search_searxng`). Do not copy Serper.
- Do not commit unless the human explicitly asks during execution.
- Python tests run from `servers/fastapi`: `uv run --locked python -m pytest <file> -v`.
- FastAPI inside Docker must use `http://searxng:8080`, not `http://localhost:8080`.
- Public SearXNG instances usually disable JSON (`403`). Default instance is the Compose sidecar with `deploy/searxng/settings.yml`.
- CONTRIBUTING: SearXNG is the only dropped provider allowed back. It is the only *external* web-search backend. Native OpenAI/Google search stays.

## Out of scope

- Image search / stock photos as a substitute for `IMAGE_PROVIDER`.
- Bundling SearXNG into the Presenton application image.
- Keeping a provider dropdown (`tavily` / `exa` / `brave`). `auto` is the default; no picker needed.
- A separate SearXNG compose project / k8s chart (override URL if ops needs that later).

## File map

| File | Role |
|------|------|
| `servers/fastapi/enums/web_search_provider.py` | Keep `AUTO` / `NATIVE`; add `SEARXNG`; drop Tavily/Exa/Brave from routing |
| `servers/fastapi/utils/get_env.py` | `get_searxng_base_url_env()`; default empty → Compose URL applied in compose env |
| `servers/fastapi/utils/set_env.py` | `set_searxng_base_url_env()` |
| `servers/fastapi/models/user_config.py` | Persist `SEARXNG_BASE_URL`; drop Tavily/Exa/Brave keys |
| `servers/fastapi/utils/user_config.py` | Load/apply `SEARXNG_BASE_URL`; drop third-party search keys |
| `servers/fastapi/utils/web_search.py` | Keep native for OpenAI/Google; `auto` + custom → SearXNG; `search_web()` only implements SearXNG among externals |
| `servers/fastapi/utils/llm_calls/generate_presentation_outlines.py` | Display name `"SearXNG"` |
| `servers/fastapi/tests/unit/test_web_search.py` | Keep native-auto tests; add SearXNG fallback for custom; drop Tavily/Exa/Brave |
| `servers/nextjs/types/llm_config.ts` | `SEARXNG_BASE_URL`; drop Tavily/Exa/Brave |
| `servers/nextjs/utils/providerConstants.ts` | Keep `auto`; SearXNG is the implicit external fallback, not a picker row |
| `servers/nextjs/utils/storeHelpers.ts` | If `WEB_GROUNDING`, require `SEARXNG_BASE_URL` (or accept compose default) |
| `servers/nextjs/.../settings/WebSearchProvider.tsx` | Toggle + optional URL; **no provider dropdown** |
| `servers/nextjs/components/OnBoarding/PresentonMode.tsx` | Same |
| `docker-compose.yml` | Service `searxng` always on; `depends_on`; `SEARXNG_BASE_URL=http://searxng:8080` |
| `deploy/searxng/settings.yml` | Enable `json`, disable limiter |
| `.env.example`, `README.md`, `setup-presonton.md`, `CONTRIBUTING.md`, `docs/architecture/00-overview.md` | Operator docs |

Default env in Compose: `WEB_SEARCH_PROVIDER=auto` and `SEARXNG_BASE_URL=http://searxng:8080`. Settings does not ask the user to pick a provider.

---

### Task 1: Backend SearXNG adapter (enum + HTTP client + tests)

**Files:**
- Modify: `servers/fastapi/enums/web_search_provider.py`
- Modify: `servers/fastapi/utils/get_env.py`
- Modify: `servers/fastapi/utils/web_search.py`
- Modify: `servers/fastapi/utils/llm_calls/generate_presentation_outlines.py`
- Test: `servers/fastapi/tests/unit/test_web_search.py`

**Interfaces:**
- Consumes: existing `WebSearchResult`, `search_web()`, `_json_response()`, `_required()`, `_clean_text()`
- Produces: `WebSearchProvider.SEARXNG`; `get_searxng_base_url_env() -> str | None`; `_get_searxng_search_url() -> str`; `_redact_url_credentials(value: str) -> str`; `_search_searxng(session, query: str, limit: int) -> list[WebSearchResult]`

Copy the SearXNG functions from upstream `presenton/presenton` `servers/fastapi/utils/web_search.py`. Do not copy Serper.

Keep `NATIVE_WEB_SEARCH_PROVIDERS = {OPENAI, GOOGLE}` and `should_use_native_web_search()` as today for `auto`/`native`.

Change only the `auto` miss path: today `get_web_search_route()` returns `("unavailable", None)` for custom LLMs. New behavior:

```python
        if native_search_supported:
            return "native", None
        if get_searxng_base_url_env():
            return "external", WebSearchProvider.SEARXNG
        return "unavailable", None
```

`resolve_external_web_search_provider()` for `auto` must return `SEARXNG` when native is unavailable and the URL is set (so `search_web()` can run during outline generation). `search_web()` only implements `_search_searxng` among externals. Delete `_search_tavily` / `_search_exa` / `_search_brave`.

Unknown provider names (legacy `tavily`) fall back to `AUTO` like today.

- [ ] **Step 1: Write the failing tests**

Replace `test_pruned_web_search_provider_falls_back_to_auto` (it currently treats `"searxng"` as pruned). Keep fallback for unknown names. Add the upstream SearXNG tests, keeping fork-specific Brave coverage.

In `servers/fastapi/tests/unit/test_web_search.py`, replace the pruned-searxng test and add:

```python
def test_unknown_web_search_provider_falls_back_to_auto(monkeypatch):
    monkeypatch.setenv("LLM", LLMProvider.OPENAI.value)
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "serper")

    assert web_search.get_selected_web_search_provider() == WebSearchProvider.AUTO
    assert web_search.should_use_native_web_search() is True


def test_explicit_searxng_search_is_supported(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", WebSearchProvider.SEARXNG.value)
    monkeypatch.setenv("SEARXNG_BASE_URL", "http://searxng:8080")

    assert web_search.resolve_external_web_search_provider() == WebSearchProvider.SEARXNG
    assert web_search.should_expose_external_web_search_tool() is True
    assert web_search.should_use_native_web_search() is False


def test_auto_does_not_resolve_external_provider_from_configuration(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", WebSearchProvider.AUTO.value)
    monkeypatch.setenv("SEARXNG_BASE_URL", "http://127.0.0.1:8080")
    monkeypatch.setenv("TAVILY_API_KEY", "configured-tavily-key")

    assert web_search.resolve_external_web_search_provider() is None


def test_web_search_route_reports_actual_searxng_provider(monkeypatch):
    monkeypatch.setenv("LLM", LLMProvider.OPENAI.value)
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", WebSearchProvider.SEARXNG.value)
    monkeypatch.setenv("SEARXNG_BASE_URL", "http://127.0.0.1:8080")

    assert web_search.get_web_search_route() == (
        "external",
        WebSearchProvider.SEARXNG,
    )


def test_searxng_accepts_base_or_search_url(monkeypatch):
    monkeypatch.setenv("SEARXNG_BASE_URL", "http://127.0.0.1:8080")
    assert web_search._get_searxng_search_url() == "http://127.0.0.1:8080/search"

    monkeypatch.setenv(
        "SEARXNG_BASE_URL",
        "http://127.0.0.1:8080/search?q=ignored&format=json",
    )
    assert web_search._get_searxng_search_url() == "http://127.0.0.1:8080/search"


def test_searxng_log_url_redacts_credentials():
    assert (
        web_search._redact_url_credentials(
            "http://user:secret@127.0.0.1:8080/search"
        )
        == "http://***:***@127.0.0.1:8080/search"
    )


def test_search_searxng_maps_json_results(monkeypatch):
    captured = {}

    class FakeResponse:
        status = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def json(self, content_type=None):
            return {
                "results": [
                    {
                        "title": "SearXNG Result",
                        "url": "https://example.com/page",
                        "content": "Self-hosted search snippet.",
                    },
                    {"title": "Skip me", "url": ""},
                ]
            }

        async def text(self):
            return ""

    class FakeSession:
        def get(self, url, params):
            captured.update(url=url, params=params)
            return FakeResponse()

    monkeypatch.setenv("SEARXNG_BASE_URL", "http://searxng:8080")

    results = asyncio.run(
        web_search._search_searxng(FakeSession(), "presentation ai", 5)
    )

    assert captured["url"] == "http://searxng:8080/search"
    assert captured["params"] == {"q": "presentation ai", "format": "json"}
    assert results == [
        web_search.WebSearchResult(
            title="SearXNG Result",
            url="https://example.com/page",
            snippet="Self-hosted search snippet.",
        )
    ]


def test_search_web_logs_provider_and_clamps_max_results(monkeypatch, caplog):
    captured = {}

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    async def fake_search(_session, query, limit):
        captured.update(query=query, limit=limit)
        return [
            web_search.WebSearchResult(
                title="Presenton",
                url="https://example.com/presenton",
            )
        ]

    monkeypatch.setenv("WEB_SEARCH_PROVIDER", WebSearchProvider.SEARXNG.value)
    monkeypatch.setattr(
        web_search.aiohttp,
        "ClientSession",
        lambda **_kwargs: FakeSession(),
    )
    monkeypatch.setattr(web_search, "_search_searxng", fake_search)
    caplog.set_level(logging.INFO, logger=web_search.__name__)

    results = asyncio.run(web_search.search_web(" current facts ", max_results=50))

    assert captured == {"query": "current facts", "limit": 10}
    assert len(results) == 1
    assert "provider=searxng" in caplog.text
    assert "results=1" in caplog.text
```

Keep `test_auto_uses_native_search_for_supported_llm`. Change custom+auto from `unavailable` to SearXNG when `SEARXNG_BASE_URL` is set. Delete Tavily/Exa/Brave tests. Add the upstream SearXNG URL/helper tests.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd servers/fastapi
uv run --locked python -m pytest tests/unit/test_web_search.py -v
```

Expected: FAIL — `WebSearchProvider.SEARXNG` missing and/or `_search_searxng` missing. `test_unknown_web_search_provider_falls_back_to_auto` may already pass.

- [ ] **Step 3: Minimal implementation**

`servers/fastapi/enums/web_search_provider.py`:

```python
from enum import Enum


class WebSearchProvider(Enum):
    AUTO = "auto"
    NATIVE = "native"
    SEARXNG = "searxng"
    TAVILY = "tavily"
    EXA = "exa"
    BRAVE = "brave"
```

Add to `servers/fastapi/utils/get_env.py` next to the other web-search getters:

```python
def get_searxng_base_url_env():
    return os.getenv("SEARXNG_BASE_URL")
```

In `servers/fastapi/utils/web_search.py`:

1. `from urllib.parse import urlparse, urlunparse`
2. Import `get_searxng_base_url_env`
3. In `search_web()`, the only remaining external implementation is SearXNG (delete Tavily/Exa/Brave branches). Native path is unchanged and does not call `search_web()`.

4. Paste these helpers after `_required` (upstream, unchanged):

```python
def _get_searxng_search_url() -> str:
    configured_url = _required(get_searxng_base_url_env(), "SEARXNG_BASE_URL")
    parsed = urlparse(configured_url)
    path = parsed.path.rstrip("/")
    if not path.endswith("/search"):
        path = f"{path}/search"
    return urlunparse(parsed._replace(path=path, params="", query="", fragment=""))


def _redact_url_credentials(value: str) -> str:
    parsed = urlparse(value)
    if not parsed.username and not parsed.password:
        return value
    hostname = parsed.hostname or ""
    if parsed.port:
        hostname = f"{hostname}:{parsed.port}"
    return urlunparse(parsed._replace(netloc=f"***:***@{hostname}"))


async def _search_searxng(
    session: aiohttp.ClientSession, query: str, limit: int
) -> list[WebSearchResult]:
    search_url = _get_searxng_search_url()
    LOGGER.info(
        "Using SearXNG instance: search_url=%s",
        _redact_url_credentials(search_url),
    )
    async with session.get(
        search_url,
        params={"q": query, "format": "json"},
    ) as response:
        payload = await _json_response(response)
    return [
        WebSearchResult(
            _clean_text(item.get("title")),
            str(item.get("url") or ""),
            _clean_text(item.get("content")),
        )
        for item in payload.get("results", [])[:limit]
        if item.get("title") and item.get("url")
    ]
```

Keep the unknown-provider fallback in `get_selected_web_search_provider()`. Only `"searxng"` becomes valid; `"serper"` still falls back to AUTO.

In `generate_presentation_outlines.py`, add `"searxng": "SearXNG"` to `_web_search_provider_display_name`.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
cd servers/fastapi
uv run --locked python -m pytest tests/unit/test_web_search.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit (only if the human asked)**

```bash
git add servers/fastapi/enums/web_search_provider.py servers/fastapi/utils/get_env.py servers/fastapi/utils/web_search.py servers/fastapi/utils/llm_calls/generate_presentation_outlines.py servers/fastapi/tests/unit/test_web_search.py
git commit -m "feat: restore SearXNG as an external web search provider"
```

---

### Task 2: Persist `SEARXNG_BASE_URL` through user config

**Files:**
- Modify: `servers/fastapi/utils/set_env.py`
- Modify: `servers/fastapi/models/user_config.py`
- Modify: `servers/fastapi/utils/user_config.py`
- Test: `servers/fastapi/tests/unit/test_user_config_store.py` only if it already asserts the web-search field list; otherwise add a focused test in `servers/fastapi/tests/unit/test_web_search.py` is **not** enough — add `servers/fastapi/tests/unit/test_user_config_searxng.py`

**Interfaces:**
- Consumes: `get_searxng_base_url_env()` from Task 1
- Produces: `set_searxng_base_url_env(value)`; `UserConfig.SEARXNG_BASE_URL: Optional[str]`; `get_user_config()` / `update_env_with_user_config()` round-trip

- [ ] **Step 1: Write the failing test**

Create `servers/fastapi/tests/unit/test_user_config_searxng.py`:

```python
from models.user_config import UserConfig
from utils import user_config


def test_get_user_config_includes_searxng_base_url(monkeypatch):
    monkeypatch.setattr(user_config, "read_user_config_file", lambda _path: {})
    monkeypatch.setenv("USER_CONFIG_PATH", "/tmp/missing-user-config.json")
    monkeypatch.setenv("SEARXNG_BASE_URL", "http://searxng:8080")

    config = user_config.get_user_config()

    assert config.SEARXNG_BASE_URL == "http://searxng:8080"


def test_update_env_applies_searxng_base_url(monkeypatch):
    monkeypatch.setattr(
        user_config,
        "get_user_config",
        lambda: UserConfig(SEARXNG_BASE_URL="http://searxng:8080"),
    )

    user_config.update_env_with_user_config()

    assert user_config.get_searxng_base_url_env() == "http://searxng:8080"
```

The second test imports `get_searxng_base_url_env` from `utils.user_config` only if re-exported. Prefer:

```python
from utils.get_env import get_searxng_base_url_env
...
    assert get_searxng_base_url_env() == "http://searxng:8080"
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd servers/fastapi
uv run --locked python -m pytest tests/unit/test_user_config_searxng.py -v
```

Expected: FAIL — `UserConfig` has no `SEARXNG_BASE_URL`, and/or `set_searxng_base_url_env` missing.

- [ ] **Step 3: Minimal implementation**

`set_env.py`:

```python
def set_searxng_base_url_env(value):
    os.environ["SEARXNG_BASE_URL"] = value
```

`models/user_config.py` in the Web Search block:

```python
    WEB_SEARCH_PROVIDER: Optional[str] = None
    WEB_SEARCH_MAX_RESULTS: Optional[str] = None
    SEARXNG_BASE_URL: Optional[str] = None
    TAVILY_API_KEY: Optional[str] = None
```

`utils/user_config.py`: import `get_searxng_base_url_env` and `set_searxng_base_url_env`. In `get_user_config()`:

```python
        SEARXNG_BASE_URL=existing_config.SEARXNG_BASE_URL
        or get_searxng_base_url_env(),
```

In `update_env_with_user_config()`:

```python
    if user_config.SEARXNG_BASE_URL:
        set_searxng_base_url_env(user_config.SEARXNG_BASE_URL)
```

`provider_settings.py` already stores the whole config dict. No change unless a field allow-list exists — there is none.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
cd servers/fastapi
uv run --locked python -m pytest tests/unit/test_user_config_searxng.py tests/unit/test_web_search.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit (only if the human asked)**

```bash
git add servers/fastapi/utils/set_env.py servers/fastapi/models/user_config.py servers/fastapi/utils/user_config.py servers/fastapi/tests/unit/test_user_config_searxng.py
git commit -m "feat: persist SEARXNG_BASE_URL in user config"
```

---

### Task 3: Settings and onboarding UI

**Files:**
- Modify: `servers/nextjs/types/llm_config.ts`
- Modify: `servers/nextjs/utils/providerConstants.ts`
- Modify: `servers/nextjs/utils/providerUtils.ts`
- Modify: `servers/nextjs/utils/storeHelpers.ts`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/settings/WebSearchProvider.tsx`
- Modify: `servers/nextjs/components/OnBoarding/PresentonMode.tsx`
- Create: `servers/nextjs/public/providers/searxng.svg` (copy from upstream)
- Test: no dedicated Jest file for `storeHelpers`; verify by reading the switch and by existing UI already rendering `urlField`

**Interfaces:**
- Consumes: `WebSearchProviderOption.urlField` / `urlLabel` (already rendered)
- Produces: `WEB_SEARCH_PROVIDERS.searxng`; validation error `"SearXNG base URL is required."` when `WEB_GROUNDING` and provider is `searxng` without URL

- [ ] **Step 1: Copy the icon from upstream**

From repo root:

```powershell
curl -L "https://raw.githubusercontent.com/presenton/presenton/main/servers/nextjs/public/providers/searxng.svg" -o "servers/nextjs/public/providers/searxng.svg"
```

If curl fails, copy the file from a local clone of upstream. Do not invent a new icon. Confirm the file is non-empty.

- [ ] **Step 2: Add the provider constant (upstream text)**

In `providerConstants.ts`, insert after `auto` (same as upstream):

```typescript
  searxng: {
    value: "searxng",
    label: "SearXNG",
    description: "Use a self-hosted SearXNG instance.",
    icon: "/providers/searxng.svg",
    urlField: "SEARXNG_BASE_URL",
    urlLabel: "SearXNG base URL",
  },
```

`llm_config.ts`: drop `TAVILY_API_KEY` / `EXA_API_KEY` / `BRAVE_SEARCH_API_KEY`; add:

```typescript
  WEB_SEARCH_MAX_RESULTS?: string;
  SEARXNG_BASE_URL?: string;
```

`providerUtils.ts`: drop tavily/exa/brave mappings; add `searxng_base_url: "SEARXNG_BASE_URL"`.

- [ ] **Step 3: Validation and lock the UI**

`storeHelpers.ts`: if `WEB_GROUNDING`, treat provider as SearXNG. Do not require Tavily/Exa/Brave keys. `SEARXNG_BASE_URL` may be empty in the form when Compose injects `http://searxng:8080`.

`WebSearchProvider.tsx`: keep the `WEB_GROUNDING` switch. Remove the Tavily/Exa/Brave combobox. On enable, keep/set `WEB_SEARCH_PROVIDER` to `"auto"`. Optional URL field for `SEARXNG_BASE_URL` (used when the LLM is custom), placeholder `http://searxng:8080`.

`PresentonMode.tsx`: same — no Tavily/Exa/Brave/auto picker.

Drop `tavily` / `exa` / `brave` from `providerConstants.ts`.

- [ ] **Step 5: Sanity-check TypeScript**

From `servers/nextjs`:

```powershell
npx tsc --noEmit --pretty false
```

Expected: no new errors on the files above. If `tsc` is too slow/noisy, at least confirm the edited files typecheck in the IDE.

- [ ] **Step 6: Commit (only if the human asked)**

```bash
git add servers/nextjs/types/llm_config.ts servers/nextjs/utils/providerConstants.ts servers/nextjs/utils/providerUtils.ts servers/nextjs/utils/storeHelpers.ts "servers/nextjs/app/(presentation-generator)/(dashboard)/settings/WebSearchProvider.tsx" servers/nextjs/components/OnBoarding/PresentonMode.tsx servers/nextjs/public/providers/searxng.svg
git commit -m "feat: add SearXNG to web search settings"
```

---

### Task 4: Compose sidecar (always on, JSON enabled)

**Files:**
- Create: `deploy/searxng/settings.yml`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Presenton `SEARXNG_BASE_URL` from Tasks 1–3
- Produces: Compose service `searxng` **without a profile**, `depends_on` from `production` and `development`, `SEARXNG_BASE_URL=http://searxng:8080` injected into both app services

Upstream Presenton does **not** bundle SearXNG. This fork does, as a sibling container, because web search is locked to SearXNG.

- [ ] **Step 1: Ship a JSON-enabled settings file**

Create `deploy/searxng/settings.yml`. SearXNG refuses `format=json` unless `json` is listed. Disable the public-instance limiter so FastAPI on the Compose network is not treated as a bot.

```yaml
use_default_settings: true

general:
  instance_name: "Presenton SearXNG"

search:
  safe_search: 0
  autocomplete: ""
  default_lang: "auto"
  formats:
    - html
    - json

server:
  limiter: false
  image_proxy: false
  method: "GET"

outgoing:
  request_timeout: 8.0
```

Do not enable the `images` category for Presenton. Default engines are fine.

- [ ] **Step 2: Add SearXNG as a normal Compose service (no profile)**

In both `production` and `development`:

```yaml
    depends_on:
      - searxng
    environment:
      - WEB_GROUNDING=${WEB_GROUNDING:-}
      - WEB_SEARCH_PROVIDER=${WEB_SEARCH_PROVIDER:-auto}
      - WEB_SEARCH_MAX_RESULTS=${WEB_SEARCH_MAX_RESULTS:-}
      - SEARXNG_BASE_URL=${SEARXNG_BASE_URL:-http://searxng:8080}
```

Remove `TAVILY_API_KEY` / `EXA_API_KEY` / `BRAVE_SEARCH_API_KEY` from Compose env.

Add this service (same indent as `development`). Do **not** use `profiles`. Publish `8080` only for debugging:

```yaml
  searxng:
    image: docker.io/searxng/searxng:latest
    restart: unless-stopped
    ports:
      - "${SEARXNG_HOST_PORT:-127.0.0.1:8080}:8080"
    volumes:
      - ./deploy/searxng/settings.yml:/etc/searxng/settings.yml:ro
    environment:
      - SEARXNG_BASE_URL=http://searxng:8080/
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
      - DAC_OVERRIDE
```

Bind host port to `127.0.0.1` so SearXNG is not exposed on the LAN. App traffic stays on the Compose network.

- [ ] **Step 3: Document env in `.env.example`**

Replace the web-search comment block with:

```dotenv
# WEB_GROUNDING=true
# WEB_SEARCH_PROVIDER=auto
# auto = OpenAI/Google native search, otherwise SearXNG sidecar
# WEB_SEARCH_MAX_RESULTS=
# SEARXNG_BASE_URL=http://searxng:8080
# SEARXNG_HOST_PORT=127.0.0.1:8080
```

- [ ] **Step 4: Validate Compose YAML**

```powershell
docker compose config
```

Expected: prints merged config including service `searxng` (no profile), `depends_on` on app services, and volume bind to `deploy/searxng/settings.yml`. Do not `up` unless the human wants a live smoke test.

Live smoke test (optional, not required to finish the task):

```powershell
docker compose up development --build
```

Then from the Presenton container:

```powershell
docker compose exec development curl -s "http://searxng:8080/search?q=presenton&format=json"
```

Expected: JSON with a `results` array, not `403`.

- [ ] **Step 5: Commit (only if the human asked)**

```bash
git add deploy/searxng/settings.yml docker-compose.yml .env.example
git commit -m "feat: run SearXNG as a Compose sidecar for web search"
```

---

### Task 5: Operator docs

**Files:**
- Modify: `README.md` (web search env list)
- Modify: `setup-presonton.md` (web search section)
- Modify: `CONTRIBUTING.md` (exception for SearXNG)
- Modify: `docs/architecture/00-overview.md` (fork table row)

**Interfaces:**
- Consumes: behavior from Tasks 1–4
- Produces: docs that match shipped env names

- [ ] **Step 1: README env list**

Change the web-search bullets to:

```markdown
- **WEB_SEARCH_PROVIDER**=auto (default): OpenAI/Google use native web search; custom LLMs (Gemma) use the SearXNG sidecar. Tavily/Exa/Brave are removed.
- **WEB_SEARCH_MAX_RESULTS**: Maximum external search results to add to model context (default `5`, maximum `10`).
- **SEARXNG_BASE_URL**: Defaults to `http://searxng:8080` in Compose. Override only if SearXNG runs outside this stack. Do not use `localhost` from inside the Presenton container.
```

Add: `docker compose up development` starts SearXNG automatically. JSON is enabled by `deploy/searxng/settings.yml`. Do not use public SearXNG instances.

- [ ] **Step 2: setup-presonton.md**

Replace the web-search snippet with:

```dotenv
WEB_GROUNDING=true
SEARXNG_BASE_URL=http://searxng:8080
```

Then: `auto` dùng search native của OpenAI/Google. Custom/Gemma dùng SearXNG sidecar. Không còn Tavily / Exa / Brave.

- [ ] **Step 3: CONTRIBUTING.md exception**

After the sentence forbidding dropped providers, add:

```markdown
Exception: SearXNG is the self-hosted fallback when `auto` has no native search (`LLM=custom`). Do not restore Tavily/Exa/Brave or other dropped providers.
```

- [ ] **Step 4: architecture overview**

In `docs/architecture/00-overview.md`, change the fork table row from “Web search SearXNG và native-only extras” to:

| Web search Tavily / Exa / Brave | `auto` (native GPT/Gemini + SearXNG cho custom) |

- [ ] **Step 5: Commit (only if the human asked)**

```bash
git add README.md setup-presonton.md CONTRIBUTING.md docs/architecture/00-overview.md
git commit -m "docs: document SearXNG web search and Compose profile"
```

---

## Self-review

**Spec coverage**

| Requirement | Task |
|-------------|------|
| SearXNG JSON client (upstream) | Task 1 |
| Keep native auto for OpenAI/Google | Task 1 |
| auto + custom → SearXNG | Task 1 |
| Drop Tavily / Exa / Brave | Task 1–3 |
| Persist URL through settings | Task 2–3 |
| Settings = toggle only | Task 3 |
| SearXNG always-on Compose sidecar | Task 4 |
| Docs | Task 5 |
| No image search | Out of scope |

**Placeholder scan:** none remaining.

**Type consistency:** env name is `SEARXNG_BASE_URL` everywhere (not `SEARXNG_URL`). Enum value is `searxng`. Compose hostname is `searxng`. Helper names match upstream: `_get_searxng_search_url`, `_search_searxng`, `get_searxng_base_url_env`.
