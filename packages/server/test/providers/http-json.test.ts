import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson, fetchText } from "../../src/providers/http-json.js";

const schema = { safeParse: (value: unknown) => ({ success: typeof value === "object" && value !== null, data: value as { ok: boolean } }) };

test("bounded HTTP helpers preserve non-2xx status and headers without following redirects", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify({ error: "no" }), { status: 429, headers: { "x-reset": "10" } });
  };
  const result = await fetchJson("https://example.test/api", {}, { timeoutMs: 100, schema, fetch: fetchImpl });
  assert.equal(result.status, 429);
  assert.equal(result.headers.get("x-reset"), "10");
  assert.equal(result.data?.ok, undefined);
});

test("bounded HTTP helpers reject oversized bodies", async () => {
  const fetchImpl: typeof fetch = async () => new Response("123456789", { status: 200 });
  await assert.rejects(fetchText("https://example.test/api", {}, { timeoutMs: 100, maxBytes: 4, fetch: fetchImpl }), (error: unknown) => error instanceof Error && "code" in error && error.code === "UPSTREAM_RESPONSE_TOO_LARGE");
});
