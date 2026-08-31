import assert from "node:assert/strict";
import test from "node:test";
import { TavilyProvider } from "../../src/providers/tavily-provider.js";
import type { SettingsService } from "../../src/services/settings.js";

function settings(values: Record<string, unknown>): SettingsService {
  return { get: <T>(key: string) => values[key] as T | undefined } as unknown as SettingsService;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Tavily maps titles, content and favicons", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new TavilyProvider(settings({ "engine.tavily.apiKey": "tvly-test" }), async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response({ results: [{ title: "A <b>result</b>", url: "https://example.com/a", content: "Summary &amp; text", favicon: "https://example.com/favicon.ico" }] });
  });
  const result = await provider.search({ query: "lazycat", limit: 50 });
  assert.equal(requestBody?.max_results, 20);
  assert.deepEqual(result.results[0] && { title: result.results[0].title, description: result.results[0].description, faviconUrl: result.results[0].faviconUrl }, { title: "A result", description: "Summary & text", faviconUrl: "https://example.com/favicon.ico" });
});

test("Tavily maps authentication, quota, and rate errors", async () => {
  for (const [status, code] of [[401, "TAVILY_AUTH_FAILED"], [402, "TAVILY_QUOTA_EXHAUSTED"], [429, "TAVILY_RATE_LIMITED"]] as const) {
    const provider = new TavilyProvider(settings({ "engine.tavily.apiKey": "tvly-test" }), async () => response({}, status));
    await assert.rejects(provider.search({ query: "x", limit: 1 }), (error: unknown) => error instanceof Error && "code" in error && error.code === code);
  }
});
