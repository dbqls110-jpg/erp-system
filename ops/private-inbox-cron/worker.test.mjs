import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.mjs";

const key = "a".repeat(64);
const env = { ERP_PRIVATE_INBOX_CRON_SECRET: key };
const event = { scheduledTime: Date.parse("2026-11-20T05:00:00Z") };
const healthy = { ok: true, checked: 2, synced: 2, skipped: 0, failed: 0 };

test("a scheduled event only sends a scoped POST and reports aggregate counts", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://erp-system-lojo.onrender.com/api/agent/inbox/sync");
    assert.equal(options.method, "POST");
    assert.deepEqual(options.headers, { "x-erp-inbox-cron": key });
    assert.equal(options.redirect, "error");
    assert.equal(options.body, undefined);
    return Response.json({ ...healthy, ignored: "private response" });
  });
  await worker.scheduled(event, env);
  assert.equal(fetch.mock.callCount(), 1);
  const line = JSON.stringify(log.mock.calls[0].arguments);
  assert.match(line, /"synced":2/);
  assert.doesNotMatch(line, /private response|a{64}/);
});

test("missing credentials never make a request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(healthy));
  await assert.rejects(worker.scheduled(event, {}), /credential is not configured/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("HTTP or malformed ERP responses fail without exposing their body", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("private response", { status: 503 }));
  await assert.rejects(worker.scheduled(event, env), { message: "Mail sync returned HTTP 503." });
  fetch.mock.mockImplementation(async () => new Response("<html>private response</html>"));
  await assert.rejects(worker.scheduled(event, env), { message: "Invalid mail sync response." });
  fetch.mock.mockImplementation(async () => Response.json({ ...healthy, failed: 1 }));
  await assert.rejects(worker.scheduled(event, env), { message: "Invalid mail sync response." });
});
