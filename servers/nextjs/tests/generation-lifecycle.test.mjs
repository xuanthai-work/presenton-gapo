import assert from "node:assert/strict";
import test from "node:test";
import {
  STALL_MS,
  isUsefulStreamEvent,
  shouldSilentRetry,
  needsCancelConfirm,
  isStalled,
  silentRetryDelayMs,
} from "../lib/generation-lifecycle.ts";

test("heartbeat is not a useful event", () => {
  assert.equal(isUsefulStreamEvent("heartbeat"), false);
  assert.equal(isUsefulStreamEvent("status"), true);
  assert.equal(isUsefulStreamEvent("chunk"), true);
  assert.equal(isUsefulStreamEvent("slide_html"), true);
  assert.equal(isUsefulStreamEvent("complete"), true);
  assert.equal(isUsefulStreamEvent("error"), true);
});

test("silent retry only before first useful event", () => {
  assert.equal(shouldSilentRetry({ retryCount: 0, hasUsefulEvent: false, closed: false }), true);
  assert.equal(shouldSilentRetry({ retryCount: 3, hasUsefulEvent: false, closed: false }), false);
  assert.equal(shouldSilentRetry({ retryCount: 0, hasUsefulEvent: true, closed: false }), false);
  assert.equal(shouldSilentRetry({ retryCount: 0, hasUsefulEvent: false, closed: true }), false);
  assert.equal(silentRetryDelayMs(1), 1000);
  assert.equal(silentRetryDelayMs(3), 3000);
});

test("cancel confirm only when a draft exists", () => {
  assert.equal(needsCancelConfirm(0), false);
  assert.equal(needsCancelConfirm(2), true);
});

test("stalls after 45s without useful events while generating", () => {
  assert.equal(STALL_MS, 45_000);
  assert.equal(isStalled({ now: 50_000, lastUsefulEventAt: 0, state: "generating" }), true);
  assert.equal(isStalled({ now: 40_000, lastUsefulEventAt: 0, state: "generating" }), false);
  assert.equal(isStalled({ now: 80_000, lastUsefulEventAt: 0, state: "connecting" }), true);
  assert.equal(isStalled({ now: 80_000, lastUsefulEventAt: 0, state: "complete" }), false);
});