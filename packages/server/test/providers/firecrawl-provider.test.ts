import assert from "node:assert/strict";
import test from "node:test";
import { FirecrawlProvider } from "../../src/providers/firecrawl-provider.js";
import type { SettingsService } from "../../src/services/settings.js";

function settings(values: Record<string, unknown>): SettingsService {
  return { get: <T>(key: string) => values[key] as T | undefined } as unknown as SettingsService;
}

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(headers ?? {}) }});
}

test("Firecrawl maps web results and skips invalid URLs", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return response({ success: true, data: [{ title: "<b>One</b>", description: "A &amp; B", url: "https://example.com/one" }, { title: "Bad", url: "javascript:alert(1)" }] });
  };
  const provider = new FirecrawlProvider(settings({ "engine.firecrawl.apiKey": "fc-test" }), fetchImpl);
  const result = await provider.search({ query: "lazycat", limit: 10 });
  assert.equal(calls[0], "https://api.firecrawl.dev/v2/search");
  assert.deepEqual(result.results.map(({ title, url, description }) => ({ title, url, description })), [{ title: "One", url: "https://example.com/one", description: "A & B" }]);
});

test("Firecrawl maps authentication, quota, and rate errors", async () => {
  for (const [status, code] of [[401, "FIRECRAWL_AUTH_FAILED"], [402, "FIRECRAWL_QUOTA_EXHAUSTED"], [429, "FIRECRAWL_RATE_LIMITED"]] as const) {
    const provider = new FirecrawlProvider(settings({ "engine.firecrawl.apiKey": "fc-test" }), async () => response({ success: false }, status));
    await assert.rejects(provider.search({ query: "x", limit: 1 }), (error: unknown) => error instanceof Error && "code" in error && error.code === code);
  }
});
