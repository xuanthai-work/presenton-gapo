import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakePosthogPath = path.join(nextRoot, "tests/fakes/posthog-js.mjs");
const fakePosthogHref = pathToFileURL(fakePosthogPath).href;

async function loadWrapper() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "posthog-wrapper-"));
  const outfile = path.join(tmpDir, "posthog.bundle.mjs");
  await esbuild.build({
    absWorkingDir: nextRoot,
    entryPoints: [path.join(nextRoot, "utils/posthog.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    plugins: [
      {
        name: "test-aliases",
        setup(build) {
          build.onResolve({ filter: /^posthog-js$/ }, () => ({
            path: pathToFileURL(fakePosthogPath).href,
            external: true,
          }));
          build.onResolve({ filter: /^@\// }, (args) => ({
            path: path.join(nextRoot, `${args.path.slice(2)}.ts`),
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
}

function installWindow() {
  const window = {
    __posthog_initialized: undefined,
    __posthog_telemetry_enabled: undefined,
    location: { pathname: "/settings" },
  };
  globalThis.window = window;
  return window;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function waitUntil(predicate, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for condition");
}

test("status HTTP failure is fail-closed and does not init PostHog", async () => {
  const window = installWindow();
  const { default: posthog } = await import(fakePosthogHref);
  posthog.reset();
  const fetches = [];
  globalThis.fetch = async () => {
    fetches.push("status");
    return jsonResponse({}, 500);
  };
  const wrapper = await loadWrapper();
  wrapper.initPostHog();
  await waitUntil(() => window.__posthog_telemetry_enabled === false);
  assert.equal(posthog.inits.length, 0);
  wrapper.captureError(new Error("boom"), { operation: "save" });
  assert.equal(posthog.exceptions.length, 0);
  assert.equal(fetches.length, 1);
});

test("enabled status inits once with replay and autocapture off", async () => {
  const window = installWindow();
  const { default: posthog } = await import(fakePosthogHref);
  posthog.reset();
  globalThis.fetch = async () =>
    jsonResponse({
      telemetryEnabled: true,
      host: "http://localhost:8010",
      key: "phc_test",
    });
  const wrapper = await loadWrapper();
  wrapper.initPostHog();
  await waitUntil(() => window.__posthog_initialized === true);
  assert.equal(posthog.inits.length, 1);
  assert.equal(posthog.inits[0].key, "phc_test");
  assert.equal(posthog.inits[0].options.api_host, "http://localhost:8010");
  assert.equal(posthog.inits[0].options.autocapture, false);
  assert.equal(posthog.inits[0].options.capture_pageview, false);
  assert.equal(posthog.inits[0].options.disable_session_recording, true);
});

test("captureError always sends a sanitized Error, never the original object", async () => {
  const window = installWindow();
  const { default: posthog } = await import(fakePosthogHref);
  posthog.reset();
  globalThis.fetch = async () =>
    jsonResponse({
      telemetryEnabled: true,
      host: "http://localhost:8010",
      key: "phc_test",
    });
  const wrapper = await loadWrapper();
  wrapper.initPostHog();
  await waitUntil(() => window.__posthog_initialized === true);
  const original = new Error(`secret-token ${"x".repeat(400)}`);
  wrapper.captureError(original, { operation: "export" });
  assert.equal(posthog.exceptions.length, 1);
  const sent = posthog.exceptions[0].error;
  assert.notEqual(sent, original);
  assert.equal(sent.message.length <= 240, true);
  assert.equal(sent.message.includes("secret-token"), true);
  assert.equal(posthog.exceptions[0].props.operation, "export");
});

test("setTelemetryEnabled(false) opts out and stops further captures without reload", async () => {
  const window = installWindow();
  const { default: posthog } = await import(fakePosthogHref);
  posthog.reset();
  globalThis.fetch = async () =>
    jsonResponse({
      telemetryEnabled: true,
      host: "http://localhost:8010",
      key: "phc_test",
    });
  const wrapper = await loadWrapper();
  wrapper.initPostHog();
  await waitUntil(() => window.__posthog_initialized === true);
  wrapper.setTelemetryEnabled(false);
  assert.equal(posthog.optedOut, true);
  wrapper.captureError(new Error("after-off"), { operation: "save" });
  assert.equal(posthog.exceptions.length, 0);
});

test("setTelemetryEnabled(true) after a disabled status re-fetches and inits", async () => {
  const window = installWindow();
  const { default: posthog } = await import(fakePosthogHref);
  posthog.reset();
  const responses = [
    jsonResponse({ telemetryEnabled: false }),
    jsonResponse({
      telemetryEnabled: true,
      host: "http://localhost:8010",
      key: "phc_test",
    }),
  ];
  const fetches = [];
  globalThis.fetch = async () => {
    fetches.push("status");
    return responses.shift() ?? jsonResponse({ telemetryEnabled: false });
  };
  const wrapper = await loadWrapper();
  wrapper.initPostHog();
  await waitUntil(() => window.__posthog_telemetry_enabled === false);
  assert.equal(posthog.inits.length, 0);
  wrapper.setTelemetryEnabled(true);
  await waitUntil(() => window.__posthog_initialized === true);
  assert.equal(fetches.length, 2);
  assert.equal(posthog.inits.length, 1);
});

test("re-enable after opt-out calls opt_in_capturing instead of a second init", async () => {
  const window = installWindow();
  const { default: posthog } = await import(fakePosthogHref);
  posthog.reset();
  globalThis.fetch = async () =>
    jsonResponse({
      telemetryEnabled: true,
      host: "http://localhost:8010",
      key: "phc_test",
    });
  const wrapper = await loadWrapper();
  wrapper.initPostHog();
  await waitUntil(() => window.__posthog_initialized === true);
  wrapper.setTelemetryEnabled(false);
  assert.equal(posthog.optedOut, true);
  wrapper.setTelemetryEnabled(true);
  await waitUntil(() => posthog.optedOut === false);
  assert.equal(posthog.inits.length, 1);
  assert.equal(posthog.optedOut, false);
});
