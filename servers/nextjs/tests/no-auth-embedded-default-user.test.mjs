import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const nextRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(nextRoot, "..", "..");

async function readNext(relativePath) {
  return readFile(path.join(nextRoot, relativePath), "utf8");
}

test("/auth page is deleted", async () => {
  await assert.rejects(readNext("app/auth/page.tsx"));
});

test("AuthGate and LogoutButton are deleted", async () => {
  await assert.rejects(readNext("components/Auth/AuthGate.tsx"));
  await assert.rejects(readNext("components/Auth/LogoutButton.tsx"));
});

test("root / redirects to /dashboard", async () => {
  const source = await readNext("app/page.tsx");
  assert.match(source, /redirect\(["']\/dashboard["']\)/);
});

test("SettingPage no longer imports LogoutButton", async () => {
  const source = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx"
  );
  assert.doesNotMatch(source, /LogoutButton/);
});

test("proxy still exempts /api/v1/auth/* paths", async () => {
  const source = await readNext("proxy.ts");
  assert.match(source, /\/api\/v1\/auth\//);
});

test("can-change-keys always reflects env flag", async () => {
  const source = await readNext("app/api/can-change-keys/route.ts");
  assert.match(source, /canChangeKeys\s*=\s*process\.env\.CAN_CHANGE_KEYS/);
  assert.doesNotMatch(source, /authStatusForRequest/);
});

test(".env.example is not modified (no DEMO_* added)", async () => {
  const env = await readFile(path.join(repoRoot, ".env.example"), "utf8");
  assert.doesNotMatch(env, /DEMO_USERNAME/);
});