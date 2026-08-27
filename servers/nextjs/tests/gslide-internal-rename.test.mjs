import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(nextRoot, "..", "..");

async function readRepo(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

test("compose and Dockerfiles use GSlide env and volume names", async () => {
  const compose = await readRepo("docker-compose.yml");
  assert.match(compose, /GSLIDE_HTTP_HOST_PORT/);
  assert.match(compose, /GSLIDE_DOCKER_PLATFORM/);
  assert.match(compose, /gslide_api_node_modules:\/app\/node_modules/);
  assert.match(compose, /TEMP_DIRECTORY=\/tmp\/gslide/);
  assert.match(compose, /gslide_next_node_modules:\/app\/servers\/nextjs\/node_modules/);
  assert.match(
    compose,
    /gslide_document_extraction_liteparse:\/app\/document-extraction-liteparse/,
  );
  assert.doesNotMatch(compose, /presenton_api_node_modules/);
  assert.doesNotMatch(compose, /presenton_next_node_modules/);
  assert.doesNotMatch(compose, /presenton_document_extraction_liteparse/);

  const api = await readRepo("Dockerfile.api");
  const apiDev = await readRepo("Dockerfile.dev.api");
  for (const dockerfile of [api, apiDev]) {
    assert.match(dockerfile, /GSLIDE_APP_ROOT=\/app/);
    assert.match(dockerfile, /GSLIDE_FASTEMBED_ICON_CACHE_DIR=\/root\/.cache\/gslide\/fastembed-icons/);
    assert.match(dockerfile, /gslide-terminal-banner\.mjs/);
    assert.doesNotMatch(dockerfile, /presenton-terminal-banner\.mjs/);
  }
});

test("package names and GHCR image are GSlide", async () => {
  const rootPkg = JSON.parse(await readRepo("package.json"));
  const nextPkg = JSON.parse(await readNext("package.json"));
  assert.equal(rootPkg.name, "gslide");
  assert.equal(nextPkg.name, "gslide-web");
  const pyproject = await readRepo("servers/fastapi/pyproject.toml");
  assert.match(pyproject, /name = "gslide-backend"/);
  const release = await readRepo(".github/workflows/docker-release.yml");
  assert.match(release, /\/gslide/);
  assert.doesNotMatch(release, /ghcr\.io\/presenton\/presenton/);
});

test("banner, owner context, blank-slide event, and clipboard write GSlide names", async () => {
  await assert.rejects(
    () => access(path.join(repoRoot, "scripts/presenton-terminal-banner.mjs")),
    (error) => error && error.code === "ENOENT",
  );
  const banner = await readRepo("scripts/gslide-terminal-banner.mjs");
  assert.match(banner, /GSLIDE_HTTP_HOST_PORT/);
  assert.match(banner, /PRESENTON_HTTP_HOST_PORT/);

  const context = await readRepo("servers/fastapi/api/v1/auth/context.py");
  assert.match(context, /"gslide_current_owner_id"/);
  assert.match(context, /"gslide_current_owner_is_admin"/);
  assert.doesNotMatch(context, /presenton_current_owner_id/);

  const blank = await readNext(
    "app/(presentation-generator)/_shared/blank-slide-prompt-event.ts",
  );
  assert.match(blank, /GSLIDE_BLANK_SLIDE_PROMPT_EVENT/);
  assert.match(blank, /"gslide:blank-slide-prompt"/);
  assert.doesNotMatch(blank, /presenton:blank-slide-prompt/);

  const clipboard = await readNext("components/slide-editor/clipboard/useClipboard.ts");
  assert.match(clipboard, /GSLIDE_TEMPLATE_V2:/);
  assert.match(clipboard, /PRESENTON_TEMPLATE_V2:/);
  assert.match(clipboard, /application\/x-gslide-template-v2/);
  const payload = await readNext("components/slide-editor/clipboard/clipboard.ts");
  assert.match(payload, /"gslide\/template-v2"/);

  const searxng = await readRepo("deploy/searxng/settings.yml");
  assert.match(searxng, /GSlide SearXNG/);
  assert.match(searxng, /gslide-internal-searxng-not-for-public/);
});

test("persisted runtime identifiers are GSlide without Presenton leftovers", async () => {
  const api = await readRepo("Dockerfile.api");
  const apiDev = await readRepo("Dockerfile.dev.api");
  for (const dockerfile of [api, apiDev]) {
    assert.match(dockerfile, /TEMP_DIRECTORY=\/tmp\/gslide/);
    assert.doesNotMatch(dockerfile, /TEMP_DIRECTORY=\/tmp\/presenton/);
  }

  const mem0 = await readRepo("servers/fastapi/services/mem0_oss_memory.py");
  assert.match(mem0, /"gslide_memories"/);
  assert.doesNotMatch(mem0, /presenton_memories/);
  assert.match(mem0, /\/tmp\/gslide/);
  assert.doesNotMatch(mem0, /\/tmp\/presenton/);

  const users = await readRepo("servers/fastapi/api/v1/auth/users.py");
  assert.match(users, /gslide-admin-managed-passwords/);
  assert.doesNotMatch(users, /presenton-admin-managed-passwords/);

  const html = await readNext("lib/template-v2-json-to-html.ts");
  assert.match(html, /\.gslide-math/);
  assert.match(html, /data-gslide-chart/);
  assert.match(html, /data-gslide-math/);
  assert.match(html, /__GSLIDE_JSON_CHARTS__/);
  assert.match(html, /gslideFormat/);
  assert.match(html, /gslideBarRadius/);
  assert.match(html, /gslidePosition/);
  assert.match(html, /gslideOutsideColor/);
  assert.doesNotMatch(html, /presenton-math/);
  assert.doesNotMatch(html, /data-presenton-chart/);
  assert.doesNotMatch(html, /__PRESENTON_JSON_CHARTS__/);
  assert.doesNotMatch(html, /presentonFormat/);
  assert.doesNotMatch(html, /presentonBarRadius/);

  const preview = await readNext(
    "app/(presentation-generator)/components/TemplateV2HtmlSlidePreview.tsx",
  );
  assert.match(preview, /GSlideChartGlobalState/);
  assert.match(preview, /__GSLIDE_JSON_CHARTS__/);
  assert.doesNotMatch(preview, /PresentonChartGlobalState/);
  assert.doesNotMatch(preview, /presentonFormat/);
  assert.doesNotMatch(preview, /data-presenton-chart/);

  const model = await readNext("components/slide-editor/model/model.ts");
  assert.match(model, /__gslide_manual_position/);
  assert.doesNotMatch(model, /__presenton_manual_position/);

  const events = await readNext("components/slide-editor/events/events.ts");
  assert.match(events, /"gslide:template-v2-insert-elements"/);
  assert.doesNotMatch(events, /presenton:template-v2-/);

  const charts = await readNext("lib/chart-browser.ts");
  assert.match(charts, /__GSLIDE_CHART_BROWSER_RUNTIME__/);
  assert.match(charts, /data-gslide-chart-runtime/);
  assert.match(charts, /dataset\.gslideChartRuntime/);
  assert.doesNotMatch(charts, /PRESENTON_CHART_BROWSER/);
  assert.doesNotMatch(charts, /data-presenton-chart-runtime/);

  const tailwind = await readNext("lib/tailwind-browser.ts");
  assert.match(tailwind, /data-gslide-tailwind-browser/);
  assert.doesNotMatch(tailwind, /data-presenton-tailwind-browser/);

  const exportTemp = await readNext("lib/run-bundled-presentation-export.ts");
  assert.match(exportTemp, /os\.tmpdir\(\), "gslide"/);
  assert.doesNotMatch(exportTemp, /os\.tmpdir\(\), "presenton"/);

  const ci = await readRepo(".github/workflows/test-all.yml");
  assert.match(ci, /\/tmp\/gslide-app-data/);
  assert.doesNotMatch(ci, /\/tmp\/presenton-/);
});

test("export manifest, alembic history, and cloud-removed test drop Presenton names", async () => {
  const sync = await readRepo("scripts/sync-presentation-export.cjs");
  assert.match(sync, /gslide-export-version\.json/);
  assert.doesNotMatch(sync, /presenton-export-version\.json/);

  await assert.rejects(
    () =>
      access(
        path.join(
          repoRoot,
          "servers/fastapi/alembic/versions/c6e8f1a3b5d7_add_global_presenton_cloud_provider.py",
        ),
      ),
    (error) => error && error.code === "ENOENT",
  );
  await assert.rejects(
    () =>
      access(
        path.join(
          repoRoot,
          "servers/fastapi/alembic/versions/e4b6c8d0a2f3_drop_presenton_cloud_provider.py",
        ),
      ),
    (error) => error && error.code === "ENOENT",
  );

  const backfill = await readRepo(
    "servers/fastapi/alembic/versions/d2f4a6b8c0e1_backfill_smart_presentation_mode.py",
  );
  assert.match(backfill, /down_revision: str \| None = "f3a7c1d9e5b2"/);
  assert.doesNotMatch(backfill, /c6e8f1a3b5d7/);
  assert.doesNotMatch(backfill, /e4b6c8d0a2f3/);

  const migrationRuntime = await readRepo("servers/fastapi/migrations.py");
  assert.match(migrationRuntime, /REVISION_HEAD = REVISION_SMART_MODE_BACKFILL/);
  assert.doesNotMatch(migrationRuntime, /REVISION_PRESENTON_CLOUD_PROVIDER/);
  assert.doesNotMatch(migrationRuntime, /REVISION_DROP_PRESENTON_CLOUD_PROVIDER/);

  await assert.rejects(
    () =>
      access(
        path.join(
          repoRoot,
          "servers/fastapi/tests/unit/test_presenton_cloud_removed.py",
        ),
      ),
    (error) => error && error.code === "ENOENT",
  );
  await access(
    path.join(repoRoot, "servers/fastapi/tests/unit/test_cloud_removed.py"),
  );
});

test("remaining editor and preview identifiers are GSlide", async () => {
  const preview = await readNext(
    "app/(presentation-generator)/components/TemplateV2HtmlSlidePreview.tsx",
  );
  assert.match(preview, /dataset\.gslideCharts/);
  assert.match(preview, /dataset\.gslideChartRendered/);
  assert.doesNotMatch(preview, /dataset\.presentonCharts/);
  assert.doesNotMatch(preview, /dataset\.presentonChartRendered/);

  const injection = await readNext(
    "app/(presentation-generator)/components/useSmartChartInjection.ts",
  );
  assert.match(injection, /dataset\.gslideChartRendered/);
  assert.doesNotMatch(injection, /dataset\.presentonChartRendered/);

  const editor = await readNext(
    "components/slide-editor/text/TiptapInlineTextEditor.tsx",
  );
  assert.match(editor, /"gslide:commit-template-v2-inline-text"/);
  assert.match(editor, /"gslide:latex-run-focus"/);
  assert.doesNotMatch(editor, /presenton:commit-template-v2-inline-text/);
  assert.doesNotMatch(editor, /presenton:latex-run-focus/);

  const page = await readNext(
    "app/(presentation-generator)/presentation/components/PresentationPage.tsx",
  );
  assert.match(page, /gslide:editor-navigation-hint:v1/);
  assert.doesNotMatch(page, /presenton:editor-navigation-hint/);

  const chat = await readNext(
    "app/(presentation-generator)/presentation/components/chat/chat-utils.ts",
  );
  assert.match(chat, /gslide:chat:/);
  assert.doesNotMatch(chat, /presenton:chat:/);

  const tailwindRuntime = await readNext(
    "components/runtime/TailwindBrowserRuntime.tsx",
  );
  assert.match(tailwindRuntime, /gslide:tailwind-runtime-ready/);
  assert.match(tailwindRuntime, /gslide:tailwind-runtime-request/);
  assert.doesNotMatch(tailwindRuntime, /presenton:tailwind-runtime-/);
});
