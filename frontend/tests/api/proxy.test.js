import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../functions/api/[[path]].js";

test("returns 503 when API_ORIGIN is not configured", async () => {
  const response = await onRequest({ request: new Request("https://pos.example.com/api/health"), env: {} });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /API no configurada/);
});

test("rejects API_ORIGIN containing a path", async () => {
  const response = await onRequest({
    request: new Request("https://pos.example.com/api/health"),
    env: { API_ORIGIN: "https://api.example.com/private" },
  });
  assert.equal(response.status, 500);
});

test("forwards API path, query, method and authorization without caching", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const request = new Request("https://pos.example.com/api/ventas?page=2", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ total: 12.5 }),
    });
    const response = await onRequest({ request, env: { API_ORIGIN: "https://api.example.com" } });
    assert.equal(response.status, 200);
    assert.equal(captured.url, "https://api.example.com/api/ventas?page=2");
    assert.equal(captured.init.method, "POST");
    assert.equal(captured.init.headers.get("authorization"), "Bearer test-token");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
