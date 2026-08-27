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
  assert.match(exportUtils, /exportSession/);
});

test("pdf-maker suspends search params without the app splash", async () => {
  const page = await readNext("app/(export)/pdf-maker/page.tsx");
  const loading = await readNext("app/(export)/pdf-maker/loading.tsx");
  assert.match(page, /Suspense/);
  assert.doesNotMatch(page, /['"]use client['"]/);
  assert.match(loading, /return null/);
});

test("api-dev keeps api node_modules so export sharp survives bind-mount", async () => {
  const compose = await readRepo("docker-compose.yml");
  assert.match(compose, /gslide_api_node_modules:\/app\/node_modules/);
  assert.doesNotMatch(compose, /presenton_api_node_modules/);
  assert.doesNotMatch(compose, /presenton_root_node_modules/);
  const pkg = JSON.parse(await readRepo("package.json"));
  assert.equal(typeof pkg.dependencies.sharp, "string");
});

test("next dev does not reuse the production distDir or standalone output", async () => {
  const config = await readNext("next.config.mjs");
  assert.match(config, /NODE_ENV === ["']production["']/);
  assert.doesNotMatch(config, /^\s*distDir:\s*["']\.next-build["']/m);
  assert.doesNotMatch(config, /^\s*output:\s*["']standalone["']/m);
  assert.match(config, /["']\.next-build["']/);
  assert.match(config, /output:\s*["']standalone["']/);
  assert.match(config, /allowedDevOrigins/);
  assert.match(config, /["']proxy["']/);
});
