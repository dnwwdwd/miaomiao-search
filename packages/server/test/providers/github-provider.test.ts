import assert from "node:assert/strict";
import test from "node:test";
import { GithubProvider, type GithubSearchClient } from "../../src/providers/github-provider.js";
import type { SettingsService } from "../../src/services/settings.js";

function settings(values: Record<string, unknown>): SettingsService {
  return { get: <T>(key: string) => values[key] as T | undefined } as unknown as SettingsService;
}

function client(items: Array<Record<string, unknown>>): GithubSearchClient {
  return { rest: { search: { repos: async () => ({ data: { items } }) } } } as GithubSearchClient;
}

test("GitHub searches public repositories once and filters private or invalid entries", async () => {
  let calls = 0;
  let query = "";
  const provider = new GithubProvider(settings({ "engine.github.apiKey": "ghp-test" }), () => ({ rest: { search: { repos: async (input) => {
    calls += 1;
    query = input.q;
    return { data: { items: [{ full_name: "org/public", html_url: "https://github.com/org/public", description: "A repo", private: false }, { full_name: "org/private", html_url: "https://github.com/org/private", private: true }, { full_name: "org/external", html_url: "https://example.com/repo" }] } };
  } } } }));
  const result = await provider.search({ query: "search", limit: 100 });
  assert.equal(calls, 1);
  assert.equal(query, "search is:public");
  assert.deepEqual(result.results.map((item) => item.url), ["https://github.com/org/public"]);
});

test("GitHub recreates the client when the token changes and maps rate limits", async () => {
  const tokens: Array<string | undefined> = [];
  const rateLimited = Object.assign(new Error("API rate limit exceeded"), { status: 403, response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2000000000" } } });
  const tokenState: { value?: string } = {};
  const provider = new GithubProvider({ get: <T>() => tokenState.value as T | undefined } as unknown as SettingsService, (token) => { tokens.push(token); return client([]); });
  await provider.search({ query: "one", limit: 1 });
  tokenState.value = "ghp-new";
  await provider.search({ query: "two", limit: 1 });
  assert.deepEqual(tokens, [undefined, "ghp-new"]);

  const limitedProvider = new GithubProvider(settings({ "engine.github.apiKey": "ghp-test" }), () => ({ rest: { search: { repos: async () => { throw rateLimited; } } } }));
  await assert.rejects(limitedProvider.search({ query: "x", limit: 1 }), (error: unknown) => error instanceof Error && "code" in error && error.code === "GITHUB_RATE_LIMITED");
});

test("GitHub maps secondary 403 limits and Retry-After hints", async () => {
  const limited = Object.assign(new Error("Forbidden"), { status: 403, response: { headers: { "retry-after": "60" } } });
  const provider = new GithubProvider(settings({}), () => ({ rest: { search: { repos: async () => { throw limited; } } } }));
  await assert.rejects(provider.search({ query: "x", limit: 1 }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "GITHUB_RATE_LIMITED");
    assert.match(String((error as Error).message), /预计/);
    return true;
  });
});
