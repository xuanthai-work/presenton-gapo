# GSlide Hygiene Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Park leftover WIP, rebrand session cookies and API-key prefixes to GSlide with legacy fallback, replace remaining Presenton product copy/metadata, then rename `PresentonMode` and move `chartPreviewSourceSize` — without cutting Community or splitting upstream-magnet files.

**Architecture:** FastAPI `api/v1/auth/config.py` is the source of cookie names and API-key prefixes. Next.js `proxy.ts` and the bundled exporter duplicate the same string literals. Dual-read keeps `presenton_session` / `sk-presenton-` working; writes mint only `gslide_session` / `sk-gslide-`. Copy and metadata changes stay in Next chrome. Batch 2 is identifier/helper cleanup only.

**Tech Stack:** FastAPI, Starlette cookies, Next.js 16 `proxy.ts`, `node:test` contract tests, pytest.

**Spec:** `docs/superpowers/specs/2026-08-25-gslide-hygiene-cleanup-design.md`

## Global Constraints

- Cookie write name: `gslide_session`. Legacy read: `presenton_session`.
- API key mint: `sk-gslide-`. Accept also `sk-presenton-`. Do not rewrite DB rows.
- Product name in UI/metadata: **GSlide**.
- Keep Community host `https://api.presenton.ai/api/v3/community/presentations` and env `PRESENTON_COMMUNITY_API_URL`.
- Do not restyle AI slide HTML.
- Do not split `presentation.py`, `TemplateV2KonvaSlide.tsx`, `nodes.tsx`, `Chat.tsx`, `memory_layer.py`, `templates/v2/generation.py`.
- Do not rename `/tmp/presenton` paths, Mem0 collection `presenton_memories`, ContextVars, Mixpanel events, or `reset_password_token_secret`.
- Do not rewrite root `README.md`.
- Do not commit `servers/fastapi/.test-data/`.
- Do not push unless asked.
- Stop after Task 5 (Batch 1) and after Task 7 (Batch 2) for human review. Do not start the next batch until review says go.
- Tests: `cd servers/fastapi; python -m pytest <files> -q` and `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`.

## File map

- Create: `servers/fastapi/tests/unit/test_session_identity.py`
- Modify: `servers/fastapi/api/v1/auth/config.py`
- Modify: `servers/fastapi/api/v1/auth/principal.py`
- Modify: `servers/fastapi/api/v1/auth/users.py`
- Modify: `servers/fastapi/api/v1/auth/router.py`
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (`_build_export_cookie_header` cookie fallback only)
- Modify: `servers/fastapi/models/sql/access_token.py`
- Modify: `servers/fastapi/tests/unit/test_export_cookie_header.py`
- Modify: `servers/fastapi/tests/integration/test_auth_endpoints.py`
- Modify: `servers/nextjs/proxy.ts`
- Modify: `servers/nextjs/lib/run-bundled-presentation-export.ts`
- Modify: `servers/nextjs/app/layout.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/page.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/page.tsx`
- Modify: `docker-compose.yml`
- Modify: `servers/nextjs/components/OnBoarding/PresentonMode.tsx` (copy in Task 4; rename in Task 6)
- Modify: `servers/nextjs/app/(presentation-generator)/custom-template/CustomTemplatePage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/community/components/CommunityDesignPreviewDialog.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/components/CommunityReferencePicker.tsx`
- Modify: `servers/nextjs/lib/user-config-store.ts`
- Modify: `servers/nextjs/utils/api.ts` (comment only)
- Modify: `servers/nextjs/app/loading.tsx`
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx`
- Modify: `servers/nextjs/components/Auth/AuthGate.tsx`
- Delete: `servers/nextjs/components/ui/presenton-splash-loader.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`
- Modify: `servers/nextjs/components/Home.tsx`
- Rename: `PresentonMode.tsx` → `OnboardingMode.tsx`
- Modify: `servers/nextjs/components/slide-editor/charts/chart-data.ts`
- Modify: `servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx`
- Do not modify: `servers/fastapi/services/community_presentations.py`, `LegacyPresentationsTable.tsx` download URL, alembic cloud migrations, `README.md`

---

### Task 0: Park WIP and commit hygiene docs

**Files:**
- Modify or keep: `.gitignore` (only if the diff ignores local junk; do not un-ignore secrets)
- Add: `docs/superpowers/specs/2026-08-25-gslide-hygiene-cleanup-design.md`
- Add: `docs/superpowers/plans/2026-08-25-gslide-hygiene-cleanup.md`
- Add if still untracked: `docs/superpowers/plans/2026-08-24-gslide-slide-editor-chrome.md`
- Modify if dirty: `docs/superpowers/plans/2026-08-24-gslide-ui-kit-restyle.md`

**Interfaces:**
- Consumes: none
- Produces: clean working tree except later task edits; spec+plan on `main`

- [ ] **Step 1: Inspect status**

Run:

```bash
git status
git diff --stat
```

Expected: docs/gitignore leftovers only. If `servers/fastapi/.test-data/` appears, do not add it.

- [ ] **Step 2: Stage docs (and .gitignore if appropriate)**

```bash
git add docs/superpowers/specs/2026-08-25-gslide-hygiene-cleanup-design.md
git add docs/superpowers/plans/2026-08-25-gslide-hygiene-cleanup.md
git add docs/superpowers/plans/2026-08-24-gslide-slide-editor-chrome.md
git add docs/superpowers/plans/2026-08-24-gslide-ui-kit-restyle.md
git add .gitignore
```

Skip any path that is not present.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: add GSlide hygiene cleanup spec and plan"
```

- [ ] **Step 4: Confirm clean tree**

Run: `git status`

Expected: clean working tree (or only unrelated files the user keeps local).

---

### Task 1: FastAPI session cookie identity

**Files:**
- Modify: `servers/fastapi/api/v1/auth/config.py`
- Modify: `servers/fastapi/api/v1/auth/principal.py`
- Modify: `servers/fastapi/api/v1/auth/users.py`
- Modify: `servers/fastapi/api/v1/auth/router.py`
- Modify: `servers/fastapi/api/v1/ppt/endpoints/presentation.py` (fallback `request.cookies.get` only)
- Create: `servers/fastapi/tests/unit/test_session_identity.py`
- Modify: `servers/fastapi/tests/unit/test_export_cookie_header.py`
- Modify: `servers/fastapi/tests/integration/test_auth_endpoints.py`

**Interfaces:**
- Consumes: existing `SESSION_COOKIE_NAME` usages
- Produces:
  - `SESSION_COOKIE_NAME = "gslide_session"`
  - `LEGACY_SESSION_COOKIE_NAME = "presenton_session"`
  - `read_session_token(cookies) -> str | None`
  - login writes `gslide_session` and deletes `presenton_session`
  - logout deletes both cookie names

- [ ] **Step 1: Write the failing tests**

Create `servers/fastapi/tests/unit/test_session_identity.py`:

```python
from api.v1.auth.config import (
    LEGACY_SESSION_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    read_session_token,
)


def test_session_cookie_names():
    assert SESSION_COOKIE_NAME == "gslide_session"
    assert LEGACY_SESSION_COOKIE_NAME == "presenton_session"


def test_read_session_token_prefers_gslide_cookie():
    assert (
        read_session_token(
            {
                "gslide_session": "new-jwt",
                "presenton_session": "old-jwt",
            }
        )
        == "new-jwt"
    )


def test_read_session_token_falls_back_to_legacy():
    assert read_session_token({"presenton_session": "old-jwt"}) == "old-jwt"


def test_read_session_token_ignores_empty_new_cookie():
    assert (
        read_session_token({"gslide_session": "", "presenton_session": "old-jwt"})
        == "old-jwt"
    )
```

Append to `servers/fastapi/tests/unit/test_export_cookie_header.py`:

```python
def test_legacy_presenton_session_cookie_header_is_forwarded():
    cookie_header = "presenton_session=legacy-jwt; theme=dark"
    request = _request(headers={"Cookie": cookie_header})
    assert _build_export_cookie_header(request) == cookie_header
```

In `test_login_sets_http_only_jwt_cookie_for_username_only_account`, after `assert SESSION_COOKIE_NAME in response.cookies`, add:

```python
    assert SESSION_COOKIE_NAME == "gslide_session"
    assert response.cookies[SESSION_COOKIE_NAME]
```

Login also `delete_cookie`s `presenton_session` (Max-Age=0). Do not assert that `presenton_session` is absent from `Set-Cookie`.

Add a new integration test in `test_auth_endpoints.py`:

```python
def test_logout_deletes_gslide_and_legacy_session_cookies(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    response = client.post("/api/v1/auth/logout")
    set_cookies = response.headers.get_list("set-cookie")
    joined = "\n".join(set_cookies)
    assert response.status_code == 200
    assert "gslide_session=" in joined
    assert "presenton_session=" in joined
    asyncio.run(engine.dispose())
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd servers/fastapi
python -m pytest tests/unit/test_session_identity.py tests/unit/test_export_cookie_header.py tests/integration/test_auth_endpoints.py::test_login_sets_http_only_jwt_cookie_for_username_only_account tests/integration/test_auth_endpoints.py::test_logout_deletes_gslide_and_legacy_session_cookies -q
```

Expected: FAIL (`read_session_token` missing and/or `SESSION_COOKIE_NAME` still `presenton_session`).

- [ ] **Step 3: Implement cookie helpers and dual-read**

In `servers/fastapi/api/v1/auth/config.py`, add below the existing imports:

```python
from collections.abc import Mapping

SESSION_COOKIE_NAME = "gslide_session"
LEGACY_SESSION_COOKIE_NAME = "presenton_session"


def read_session_token(cookies: Mapping[str, str] | None) -> str | None:
    if not cookies:
        return None
    current = cookies.get(SESSION_COOKIE_NAME)
    if current:
        return current
    legacy = cookies.get(LEGACY_SESSION_COOKIE_NAME)
    if legacy:
        return legacy
    return None
```

Remove the old `SESSION_COOKIE_NAME = "presenton_session"` line (replaced above). Keep `SESSION_TTL_SECONDS` and the rest of the file.

In `principal.py`, replace `request.cookies.get(SESSION_COOKIE_NAME)` with `read_session_token(request.cookies)`. Import `read_session_token` from config.

In `users.py` `read_user_from_cookie`, replace `request.cookies.get(SESSION_COOKIE_NAME)` with `read_session_token(request.cookies)`.

In `router.py`, keep `_set_login_cookie` writing `SESSION_COOKIE_NAME`. After `response.set_cookie(...)` in `_set_login_cookie`, delete the legacy cookie:

```python
    response.delete_cookie(
        LEGACY_SESSION_COOKIE_NAME,
        httponly=True,
        secure=_secure_request(request),
        samesite="lax",
        path="/",
    )
```

Import `LEGACY_SESSION_COOKIE_NAME`. In `logout`, delete **both** `SESSION_COOKIE_NAME` and `LEGACY_SESSION_COOKIE_NAME` with the same httponly/secure/samesite/path kwargs.

In `_build_export_cookie_header`, keep returning the raw `Cookie` header when present (legacy cookies already forward). Change only the last fallback:

```python
    session_token = read_session_token(request.cookies)
    if session_token:
        return f"{SESSION_COOKIE_NAME}={session_token}"
```

Import `read_session_token` next to `SESSION_COOKIE_NAME`.

`COOKIE_TRANSPORT` in `users.py` stays `cookie_name=SESSION_COOKIE_NAME` (write name `gslide_session`).

- [ ] **Step 4: Run tests to verify they pass**

Run the same pytest command as Step 2, plus:

```bash
python -m pytest tests/unit/test_internal_auth_headers.py tests/integration/test_auth_endpoints.py -q
```

Expected: PASS. Internal headers still prefix `gslide_session=`.

- [ ] **Step 5: Commit**

```bash
git add servers/fastapi/api/v1/auth/config.py servers/fastapi/api/v1/auth/principal.py servers/fastapi/api/v1/auth/users.py servers/fastapi/api/v1/auth/router.py servers/fastapi/api/v1/ppt/endpoints/presentation.py servers/fastapi/tests/unit/test_session_identity.py servers/fastapi/tests/unit/test_export_cookie_header.py servers/fastapi/tests/integration/test_auth_endpoints.py
git commit -m "feat(auth): rename session cookie to gslide_session with legacy fallback"
```

---

### Task 2: FastAPI API key prefix

**Files:**
- Modify: `servers/fastapi/api/v1/auth/config.py`
- Modify: `servers/fastapi/api/v1/auth/principal.py`
- Modify: `servers/fastapi/models/sql/access_token.py`
- Modify: `servers/fastapi/tests/unit/test_session_identity.py`
- Modify: `servers/fastapi/tests/integration/test_auth_endpoints.py`

**Interfaces:**
- Consumes: `read_session_token` from Task 1
- Produces:
  - `API_KEY_PREFIX = "sk-gslide-"`
  - `LEGACY_API_KEY_PREFIX = "sk-presenton-"`
  - `is_accepted_api_key(token: str) -> bool`
  - new `AccessToken` values start with `sk-gslide-`

- [ ] **Step 1: Write the failing tests**

Append to `test_session_identity.py`:

```python
import uuid

from models.sql.access_token import AccessToken
from api.v1.auth.config import (
    API_KEY_PREFIX,
    LEGACY_API_KEY_PREFIX,
    is_accepted_api_key,
)


def test_api_key_prefixes():
    assert API_KEY_PREFIX == "sk-gslide-"
    assert LEGACY_API_KEY_PREFIX == "sk-presenton-"
    assert is_accepted_api_key("sk-gslide-abc")
    assert is_accepted_api_key("sk-presenton-abc")
    assert not is_accepted_api_key("sk-other-abc")


def test_new_access_token_uses_gslide_prefix():
    token = AccessToken(user_id=uuid.uuid4())
    assert token.token.startswith("sk-gslide-")
```

In `test_admin_access_key_passes_internal_auth_check`, after reading `token`, add:

```python
    assert token.startswith("sk-gslide-")
```

Add:

```python
def test_legacy_presenton_api_key_still_verifies(monkeypatch, tmp_path):
    monkeypatch.setenv("USER_CONFIG_PATH", str(tmp_path / "userConfig.json"))
    monkeypatch.delenv("DISABLE_AUTH", raising=False)
    client, engine = _build_client(tmp_path)
    client.post(
        "/api/v1/auth/setup",
        json={"username": "admin", "password": "secret123"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "secret123"},
    )
    assert login.status_code == 200

    from sqlalchemy import select

    async def seed_legacy_key():
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with session_maker() as session:
            admin = (
                await session.execute(select(User).where(User.username == "admin"))
            ).scalar_one()
            session.add(
                AccessToken(token="sk-presenton-legacyfixture", user_id=admin.id)
            )
            await session.commit()

    asyncio.run(seed_legacy_key())
    client.cookies.clear()
    response = client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": "Bearer sk-presenton-legacyfixture"},
    )
    assert response.status_code == 200
    assert response.json()["method"] == "api_key"
    asyncio.run(engine.dispose())
```

If `select` is not imported at module level in `test_auth_endpoints.py`, keep the in-test `from sqlalchemy import select` above `seed_legacy_key`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd servers/fastapi
python -m pytest tests/unit/test_session_identity.py tests/integration/test_auth_endpoints.py::test_admin_access_key_passes_internal_auth_check tests/integration/test_auth_endpoints.py::test_legacy_presenton_api_key_still_verifies -q
```

Expected: FAIL (`is_accepted_api_key` missing and/or new tokens still `sk-presenton-`).

- [ ] **Step 3: Implement prefixes**

In `config.py` add:

```python
API_KEY_PREFIX = "sk-gslide-"
LEGACY_API_KEY_PREFIX = "sk-presenton-"


def is_accepted_api_key(token: str) -> bool:
    return token.startswith(API_KEY_PREFIX) or token.startswith(
        LEGACY_API_KEY_PREFIX
    )
```

In `principal.py`, replace `if not token.startswith("sk-presenton-"):` with `if not is_accepted_api_key(token):`. Import `is_accepted_api_key`.

In `access_token.py`, change the factory to:

```python
        default_factory=lambda: f"sk-gslide-{secrets.token_hex(20)}",
```

Do **not** import `api.v1.auth.config` from the model module (avoids a models → api cycle). The unit test binds the literal to `API_KEY_PREFIX`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd servers/fastapi
python -m pytest tests/unit/test_session_identity.py tests/integration/test_auth_endpoints.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add servers/fastapi/api/v1/auth/config.py servers/fastapi/api/v1/auth/principal.py servers/fastapi/models/sql/access_token.py servers/fastapi/tests/unit/test_session_identity.py servers/fastapi/tests/integration/test_auth_endpoints.py
git commit -m "feat(auth): mint sk-gslide- API keys and accept legacy sk-presenton- keys"
```

---

### Task 3: Next proxy and bundled export identity

**Files:**
- Modify: `servers/nextjs/proxy.ts`
- Modify: `servers/nextjs/lib/run-bundled-presentation-export.ts`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: FastAPI names from Tasks 1–2 (`gslide_session`, `presenton_session`, `sk-gslide-`, `sk-presenton-`)
- Produces: Next cookie write `gslide_session`; export parser reads new then legacy; bearer bypass accepts both prefixes

- [ ] **Step 1: Write the failing contract tests**

In `gslide-ui-kit.test.mjs` add:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd servers/nextjs
node --test tests/gslide-ui-kit.test.mjs
```

Expected: FAIL on the new test (`proxy.ts` still `presenton_session` / `Presenton API`).

- [ ] **Step 3: Implement Next identity strings**

In `proxy.ts` replace the cookie constant with:

```typescript
const SESSION_COOKIE_NAME = "gslide_session";
const LEGACY_SESSION_COOKIE_NAME = "presenton_session";
```

`pdf-maker` `cookies.set` stays `name: SESSION_COOKIE_NAME`.

Replace the bearer check:

```typescript
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (
    bearer.startsWith("sk-gslide-") ||
    bearer.startsWith("sk-presenton-")
  ) {
    return isFastApiApiPath(pathname)
      ? rewriteToFastApi(request)
      : NextResponse.json(
          { detail: "API keys are only accepted by the GSlide API" },
          { status: 403 }
        );
  }
```

Compare prefixes in a case-sensitive way on the original `authorization.slice(7).trim()` (not lowercased), because keys are `sk-gslide-` / `sk-presenton-`. Do not lowercase the token.

In `run-bundled-presentation-export.ts` replace `extractSessionTokenFromCookieHeader`:

```typescript
function extractSessionTokenFromCookieHeader(cookieHeader?: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const gslide = cookieHeader.match(/(?:^|;\s*)gslide_session=([^;]+)/);
  const presenton = cookieHeader.match(/(?:^|;\s*)presenton_session=([^;]+)/);
  const value = gslide?.[1] || presenton?.[1];
  if (!value) {
    return undefined;
  }

  return decodeURIComponent(value);
}
```

Leave `getPresentonAppRoot` and `PRESENTON_APP_ROOT` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS (including the new identity test).

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/proxy.ts servers/nextjs/lib/run-bundled-presentation-export.ts servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(auth): use gslide_session and dual API-key prefixes in Next proxy"
```

---

### Task 4: Metadata, site URL, and user-visible copy

**Files:**
- Modify: `servers/nextjs/app/layout.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/page.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/outline/page.tsx`
- Modify: `docker-compose.yml`
- Modify: `servers/nextjs/components/OnBoarding/PresentonMode.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/custom-template/CustomTemplatePage.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/(dashboard)/community/components/CommunityDesignPreviewDialog.tsx`
- Modify: `servers/nextjs/app/(presentation-generator)/upload/components/CommunityReferencePicker.tsx`
- Modify: `servers/nextjs/lib/user-config-store.ts`
- Modify: `servers/nextjs/utils/api.ts`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: GSlide product name from spec
- Produces: no `presenton.ai` in app metadata; onboarding/community/template copy says GSlide/Community; `NEXT_PUBLIC_SITE_URL` forwarded in compose

- [ ] **Step 1: Write the failing contract tests**

Add to `gslide-ui-kit.test.mjs`:

```javascript
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
  const mode = await readNext("components/OnBoarding/PresentonMode.tsx");
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
```

Do **not** assert `LegacyPresentationsTable.tsx` is free of `presenton.ai` (spec keeps that download URL).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (`layout.tsx` still has `presenton.ai`).

- [ ] **Step 3: Implement metadata and copy**

`layout.tsx` — above `export const metadata`:

```typescript
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
```

Replace `metadataBase`, OG url/images, canonical, twitter images:

```typescript
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "GSlide - AI presentation generator",
  description:
    "Open-source AI presentation generator with custom layouts, multi-model support (OpenAI, Gemini, OpenAI-compatible), and PDF/PPTX export. A free Gamma alternative.",
  keywords: [
    "AI presentation generator",
    "data storytelling",
    "data visualization tool",
    "AI data presentation",
    "presentation generator",
    "data to presentation",
    "interactive presentations",
    "professional slides",
  ],
  openGraph: {
    title: "GSlide - AI presentation generator",
    description:
      "Open-source AI presentation generator with custom layouts, multi-model support (OpenAI, Gemini, OpenAI-compatible), and PDF/PPTX export. A free Gamma alternative.",
    url: siteUrl,
    siteName: "GSlide",
    images: [
      {
        url: "/apple-icon.png",
        width: 1200,
        height: 630,
        alt: "GSlide Logo",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  alternates: {
    canonical: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "GSlide - AI presentation generator",
    description:
      "Open-source AI presentation generator with custom layouts, multi-model support (OpenAI, Gemini, OpenAI-compatible), and PDF/PPTX export. A free Gamma alternative.",
    images: ["/apple-icon.png"],
  },
};
```

`upload/page.tsx`: `canonical: "/create"`, `openGraph.url: "/create"`, `openGraph.title` / `twitter.title` to `"Create Data Presentation | GSlide"`, `siteName: "GSlide"`. Remove `twitter.site` and `twitter.creator` (`@presenton_ai`).

`outline/page.tsx`: `canonical: "/create"`.

`docker-compose.yml`: add to **both** `production` and `development` `environment:` lists (next to `CAN_CHANGE_KEYS`):

```yaml
      - NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-}
```

`PresentonMode.tsx` copy:

```tsx
{providerStep === 1
    ? "Use your GSlide account, or configure your own AI providers."
    : providerStep === 2
        ? "Choose how GSlide creates visuals, or continue without image generation."
        : "Add current web context to presentations, or continue with web search disabled."}
```

`CustomTemplatePage.tsx`:

```tsx
GSlide sends each slide as a screenshot and HTML reference. Use a
vision-enabled model for accurate layouts. Text-only models may produce
poor results or fail.
```

`CommunityReferencePicker.tsx`: `item.created_by?.trim() || "Community"`

`CommunityDesignPreviewDialog.tsx`: `"Presenton managed"` → `"GSlide"` (three SetupChip fallbacks). Provider-label fallback `"Presenton"` → `"GSlide"`.

`user-config-store.ts`: `[Presenton]` → `[GSlide]` on both `console.warn` strings.

`utils/api.ts` comment:

```typescript
      // Assets returned by a remote origin (including Community) must
```

Then grep `servers/nextjs` (exclude `.playwright-cli`, `node_modules`, tests that assert Cloud removal) for remaining user-visible `Presenton` product strings and `presenton.ai` in `app/` metadata. Fix product-self hits. Leave `LegacyPresentationsTable` download URL and Community API client unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/app/layout.tsx "servers/nextjs/app/(presentation-generator)/upload/page.tsx" "servers/nextjs/app/(presentation-generator)/outline/page.tsx" docker-compose.yml servers/nextjs/components/OnBoarding/PresentonMode.tsx "servers/nextjs/app/(presentation-generator)/custom-template/CustomTemplatePage.tsx" "servers/nextjs/app/(presentation-generator)/(dashboard)/community/components/CommunityDesignPreviewDialog.tsx" "servers/nextjs/app/(presentation-generator)/upload/components/CommunityReferencePicker.tsx" servers/nextjs/lib/user-config-store.ts servers/nextjs/utils/api.ts servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "feat(ui): drop presenton.ai metadata and remaining Presenton product copy"
```

---

### Task 5: Remove Presenton splash alias

**Files:**
- Delete: `servers/nextjs/components/ui/presenton-splash-loader.tsx`
- Modify: `servers/nextjs/app/loading.tsx`
- Modify: `servers/nextjs/app/ConfigurationInitializer.tsx`
- Modify: `servers/nextjs/components/Auth/AuthGate.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `GSlideSplashLoader`, `GSLIDE_SPLASH_MIN_DURATION_MS` from `@/components/gslide`
- Produces: no `presenton-splash-loader.tsx`; no `PresentonSplashLoader` / `PRESENTON_SPLASH_MIN_DURATION_MS` in product code

- [ ] **Step 1: Write the failing tests**

Replace `test("legacy splash module re-exports GSlide splash"` with:

```javascript
test("legacy Presenton splash alias file is removed", async () => {
  await assert.rejects(
    () => readNext("components/ui/presenton-splash-loader.tsx"),
    (error) => error && error.code === "ENOENT",
  );
});
```

Change `test("global loading copy is GSlide not Presenton"`:

```javascript
  const appLoading = await readNext("app/loading.tsx");
  assert.match(appLoading, /GSlideSplashLoader/);
  assert.doesNotMatch(appLoading, /PresentonSplashLoader/);
  assert.doesNotMatch(appLoading, /presenton-splash-loader/);
```

Add to the AuthGate test (or a new test):

```javascript
  assert.doesNotMatch(auth, /PresentonSplashLoader/);
  assert.doesNotMatch(auth, /PRESENTON_SPLASH_MIN_DURATION_MS/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (alias file still exists, so ENOENT assertion fails).

- [ ] **Step 3: Switch imports and delete the alias**

`app/loading.tsx`:

```tsx
import { GSlideSplashLoader } from "@/components/gslide";

export default function Loading() {
  return <GSlideSplashLoader message="Preparing your workspace..." />;
}
```

`ConfigurationInitializer.tsx`: replace

```typescript
import { PRESENTON_SPLASH_MIN_DURATION_MS } from '@/components/ui/presenton-splash-loader';
```

with

```typescript
import { GSLIDE_SPLASH_MIN_DURATION_MS } from '@/components/gslide';
```

and use `GSLIDE_SPLASH_MIN_DURATION_MS` in the timeout.

`AuthGate.tsx`: import `GSlideSplashLoader` and `GSLIDE_SPLASH_MIN_DURATION_MS` from `@/components/gslide`. Replace `PresentonSplashLoader` with `GSlideSplashLoader` and `PRESENTON_SPLASH_MIN_DURATION_MS` with `GSLIDE_SPLASH_MIN_DURATION_MS`.

Delete `servers/nextjs/components/ui/presenton-splash-loader.tsx`.

Grep `servers/nextjs` for `presenton-splash-loader`, `PresentonSplashLoader`, `PRESENTON_SPLASH_MIN_DURATION_MS` and fix leftovers (not CSS class names `.presenton-splash-surface` in `globals.css` — those are animation class names, not product copy; leave them).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/app/loading.tsx servers/nextjs/app/ConfigurationInitializer.tsx servers/nextjs/components/Auth/AuthGate.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git add -u servers/nextjs/components/ui/presenton-splash-loader.tsx
git commit -m "refactor(ui): drop Presenton splash loader alias"
```

- [ ] **Step 6: Stop for Batch 1 review**

Do not start Task 6 until the human partner says go.

Manual checks from the spec:

1. Log in; cookie is `gslide_session`.
2. A request that only sends `presenton_session` still authenticates.
3. New API key starts with `sk-gslide-`; a seeded `sk-presenton-` key still verifies.
4. Community list still loads.
5. Tab metadata is not `presenton.ai`.

---

### Task 6: Rename PresentonMode to OnboardingMode

**Files:**
- Rename: `servers/nextjs/components/OnBoarding/PresentonMode.tsx` → `servers/nextjs/components/OnBoarding/OnboardingMode.tsx`
- Modify: `servers/nextjs/components/Home.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: Task 4 copy already inside the file
- Produces: `export default function` / const named `OnboardingMode`; `Home.tsx` imports `OnboardingMode` from `./OnBoarding/OnboardingMode`

- [ ] **Step 1: Write the failing tests**

In `gslide-ui-kit.test.mjs`:

- Change `readNext("components/OnBoarding/PresentonMode.tsx")` to `OnboardingMode.tsx` in `test("onboarding wizard chrome is GSlide blue"` and in `test("onboarding and community copy...")`.
- Change `CHROME_FILES` entry `"components/OnBoarding/PresentonMode.tsx"` to `"components/OnBoarding/OnboardingMode.tsx"`.
- Add:

```javascript
test("PresentonMode filename is gone", async () => {
  await assert.rejects(
    () => readNext("components/OnBoarding/PresentonMode.tsx"),
    (error) => error && error.code === "ENOENT",
  );
  const home = await readNext("components/Home.tsx");
  assert.match(home, /OnboardingMode/);
  assert.doesNotMatch(home, /PresentonMode/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (`OnboardingMode.tsx` missing).

- [ ] **Step 3: Rename and update imports**

```bash
git mv servers/nextjs/components/OnBoarding/PresentonMode.tsx servers/nextjs/components/OnBoarding/OnboardingMode.tsx
```

In `OnboardingMode.tsx` rename `const PresentonMode` to `const OnboardingMode` and `export default PresentonMode` to `export default OnboardingMode`.

`Home.tsx`:

```tsx
import OnboardingMode from "./OnBoarding/OnboardingMode";
```

and `{step === 2 && <OnboardingMode ... />}`.

Grep `PresentonMode` under `servers/nextjs` and update.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/OnBoarding/OnboardingMode.tsx servers/nextjs/components/Home.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git add -u servers/nextjs/components/OnBoarding/PresentonMode.tsx
git commit -m "refactor(ui): rename PresentonMode to OnboardingMode"
```

---

### Task 7: Move chartPreviewSourceSize into chart-data.ts

**Files:**
- Modify: `servers/nextjs/components/slide-editor/charts/chart-data.ts`
- Modify: `servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx`
- Modify: `servers/nextjs/tests/gslide-ui-kit.test.mjs`

**Interfaces:**
- Consumes: `removeChartColorTarget` already in `chart-data.ts`; `EDITOR_STAGE_WIDTH` / `EDITOR_STAGE_HEIGHT` from `components/slide-editor/types.ts`
- Produces: `export function chartPreviewSourceSize(chart: ChartElement): { width: number; height: number }`
- Does not move `onDeleteColor` JSX out of `ChartEditorContent.tsx` / `ChartToolbar.tsx`

- [ ] **Step 1: Write the failing test**

```javascript
test("chart preview size helper lives in chart-data", async () => {
  const data = await readNext("components/slide-editor/charts/chart-data.ts");
  assert.match(data, /export function chartPreviewSourceSize/);
  const editor = await readNext(
    "components/slide-editor/charts/ChartEditorContent.tsx",
  );
  assert.match(editor, /chartPreviewSourceSize/);
  assert.doesNotMatch(editor, /function chartPreviewSourceSize/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: FAIL (`chart-data.ts` has no `chartPreviewSourceSize`).

- [ ] **Step 3: Move the helper**

In `chart-data.ts` add imports:

```typescript
import {
  EDITOR_STAGE_HEIGHT,
  EDITOR_STAGE_WIDTH,
} from "@/components/slide-editor/types";
```

(`ChartElement` is already imported from types — merge into that import.)

Immediately after `removeChartColorTarget`, add:

```typescript
export function chartPreviewSourceSize(chart: ChartElement) {
  const width = chart.size?.width;
  const height = chart.size?.height;
  return {
    width:
      typeof width === "number" && Number.isFinite(width) && width > 0
        ? width
        : EDITOR_STAGE_WIDTH - 90,
    height:
      typeof height === "number" && Number.isFinite(height) && height > 0
        ? height
        : EDITOR_STAGE_HEIGHT - 90,
  };
}
```

In `ChartEditorContent.tsx`: import `chartPreviewSourceSize` from `chart-data`; delete the local `function chartPreviewSourceSize`. Keep `chartPreviewElement` local. Keep color-delete `onDeleteColor` handlers in this file and `ChartToolbar.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servers/nextjs; node --test tests/gslide-ui-kit.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add servers/nextjs/components/slide-editor/charts/chart-data.ts servers/nextjs/components/slide-editor/charts/ChartEditorContent.tsx servers/nextjs/tests/gslide-ui-kit.test.mjs
git commit -m "refactor(editor): move chartPreviewSourceSize into chart-data"
```

- [ ] **Step 6: Stop for Batch 2 review**

Manual: in chart editor, add two colors, press Delete — one color is removed; the last color cannot be deleted. Preview in the data modal still scales.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Batch 0 WIP / docs | Task 0 |
| Cookie `gslide_session` + legacy read + delete both on login/logout | Task 1 |
| Export cookie header dual-read fallback | Task 1 |
| Mint `sk-gslide-`, accept `sk-presenton-` | Task 2 |
| Next proxy + bundled export parser | Task 3 |
| Metadata / `NEXT_PUBLIC_SITE_URL` / OG `/apple-icon.png` | Task 4 |
| Product copy; keep Community API and legacy desktop download URL | Task 4 |
| Delete splash alias | Task 5 |
| Batch 1 review gate | Task 5 Step 6 |
| Rename `PresentonMode` | Task 6 |
| Move `chartPreviewSourceSize` | Task 7 |
| Batch 2 review gate | Task 7 Step 6 |
| Do not split generation/Konva/chat files | File map + Global Constraints |
| Do not rewrite README / data dirs / ContextVars | Global Constraints |
