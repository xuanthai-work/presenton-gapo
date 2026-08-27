// Contract test: no admin persona, every signed-in user has their own keys.
//
// Covers the architectural shift from a single admin-managed provider slot to
// per-user overlay keys backed by process env. Catches:
//   - leftover role-gating on settings/key endpoints,
//   - deleted files returning because someone re-added them.

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");

async function readNext(...parts) {
  const filePath = path.join(ROOT, ...parts);
  return fs.readFile(filePath, "utf8");
}

test("proxy drops setup_required flag", async () => {
  const proxy = await readNext("proxy.ts");
  assert.doesNotMatch(proxy, /setup_required/);
});

test("can-change-keys requires only authentication", async () => {
  const route = await readNext("app/api/can-change-keys/route.ts");
  assert.match(route, /status\.authenticated/);
  assert.doesNotMatch(route, /role === "admin"/);
});

test("user-config forwards to /api/v1/settings/provider", async () => {
  const route = await readNext("app/api/user-config/route.ts");
  assert.match(route, /\/api\/v1\/settings\/provider/);
  assert.doesNotMatch(route, /\/api\/v1\/admin\/provider-settings/);
  assert.doesNotMatch(route, /requireAdminApi/);
  assert.match(route, /DISABLE_ANONYMOUS_TRACKING/);
  assert.match(route, /isTrackingOnlyBody/);
  assert.match(route, /!canChangeKeys && !isTrackingOnlyBody/);
});

test("server-auth helpers no longer expose role or requireAdmin*", async () => {
  const serverAuth = await readNext("utils/serverAuth.ts");
  const roleHelper = await readNext("lib/server-auth-role.ts");
  assert.doesNotMatch(serverAuth, /requireAdminSession/);
  assert.doesNotMatch(serverAuth, /\brole\b/);
  assert.doesNotMatch(roleHelper, /requireAdminApi/);
  assert.doesNotMatch(roleHelper, /\brole\b/);
});

test("settings page always renders SettingPage", async () => {
  const page = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/page.tsx",
  );
  assert.match(page, /<SettingPage\s*\/>/);
  assert.doesNotMatch(page, /getSettingsView/);
  assert.doesNotMatch(page, /UserAccountSettings/);
});

test("SettingPage no longer imports AdminPanel", async () => {
  const setting = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/SettingPage.tsx",
  );
  assert.doesNotMatch(setting, /AdminPanel/);
  assert.doesNotMatch(setting, /selectedProvider === "admin"/);
});

test("SettingSideBar no longer offers an admin section", async () => {
  const sidebar = await readNext(
    "app/(presentation-generator)/(dashboard)/settings/SettingSideBar.tsx",
  );
  assert.doesNotMatch(sidebar, /"admin"/);
  assert.doesNotMatch(sidebar, /Admin/);
});

test("admin persona files are removed", async () => {
  await assert.rejects(
    () =>
      readNext(
        "app/(presentation-generator)/(dashboard)/admin/AdminPanel.tsx",
      ),
    (error) => error && error.code === "ENOENT",
    "AdminPanel.tsx should be removed",
  );
  await assert.rejects(
    () => readNext("app/(presentation-generator)/(dashboard)/admin/page.tsx"),
    (error) => error && error.code === "ENOENT",
    "admin/page.tsx should be removed",
  );
  await assert.rejects(
    () => readNext("utils/settingsAccess.ts"),
    (error) => error && error.code === "ENOENT",
    "settingsAccess.ts should be removed",
  );
  await assert.rejects(
    () =>
      readNext(
        "app/(presentation-generator)/(dashboard)/settings/UserAccountSettings.tsx",
      ),
    (error) => error && error.code === "ENOENT",
    "UserAccountSettings.tsx should be removed",
  );
});

test("ConfigurationInitializer mentions operator not administrator", async () => {
  const config = await readNext("app/ConfigurationInitializer.tsx");
  assert.doesNotMatch(config, /administrator/i);
  assert.match(config, /operator|sign in and add your own keys/i);
});
