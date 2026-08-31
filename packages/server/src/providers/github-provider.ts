import { Octokit } from "@octokit/rest";
import { DomainError } from "../domain.js";
import { engineApiKeySetting } from "../engine-catalog.js";
import type { SettingsService } from "../services/settings.js";
import { cleanText, normalizeHttpUrl } from "./text.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

export type GithubRepository = { full_name?: string; html_url?: string; description?: string | null; private?: boolean };
export type GithubSearchClient = { rest: { search: { repos: (input: { q: string; per_page: number; page: number }) => Promise<{ data?: { items?: GithubRepository[] } }> } } };
export type GithubClientFactory = (token?: string) => GithubSearchClient;

const defaultFactory: GithubClientFactory = (token) => new Octokit({ auth: token || undefined, userAgent: "miaomiao-search/0.1.0", request: { timeout: 15_000 } }) as unknown as GithubSearchClient;

export class GithubProvider implements SearchProvider {
  readonly engine = "github" as const;
  readonly maxResults = 50;
  readonly cacheVersion = "github-v1";
  private client?: GithubSearchClient;
  private clientToken?: string;

  constructor(private readonly settings: SettingsService, private readonly createClient: GithubClientFactory = defaultFactory) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const token = this.settings.get<string>(engineApiKeySetting(this.engine))?.trim() || undefined;
    if (!this.client || this.clientToken !== token) { this.client = this.createClient(token); this.clientToken = token; }
    try {
      const response = await this.client.rest.search.repos({ q: `${input.query} is:public`, per_page: Math.min(input.limit, this.maxResults), page: 1 });
      const items = response.data?.items;
      if (!Array.isArray(items)) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "GitHub 响应格式无效", 502);
      const results = items.flatMap((repository) => {
        if (repository.private === true) return [];
        const url = normalizeGithubUrl(repository.html_url);
        const title = cleanText(repository.full_name);
        if (!url || !title) return [];
        return [{ title, url, description: cleanText(repository.description), faviconUrl: "https://github.com/favicon.ico", engines: [this.engine] as ["github"] }];
      });
      return { results, failures: [] };
    } catch (error) {
      throw mapGithubError(error);
    }
  }
}

function normalizeGithubUrl(value: unknown): string | null {
  const url = normalizeHttpUrl(value);
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") ? parsed.toString() : null; } catch { return null; }
}

function mapGithubError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : 0;
  const response = typeof error === "object" && error && "response" in error ? (error as { response?: { headers?: Record<string, string | number | undefined> | Headers } }).response : undefined;
  const headers = response?.headers;
  const header = (name: string): string => {
    if (!headers) return "";
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? "";
    const expected = name.toLowerCase();
    const key = Object.keys(headers as Record<string, unknown>).find((candidate) => candidate.toLowerCase() === expected);
    return key ? String((headers as Record<string, unknown>)[key] ?? "") : "";
  };
  if (status === 401) return new DomainError("GITHUB_AUTH_FAILED", "GitHub Token 无效或无权限", 502);
  if (status === 403 || status === 429) {
    // GitHub's search endpoint uses 403 for both primary and secondary rate
    // limits. Treat it as rate limiting unless it is a more specific status
    // (401/422 above), and surface whichever reset hint the API provided.
    const reset = Number(header("x-ratelimit-reset"));
    const retryAfter = Number(header("retry-after"));
    const resetAt = reset > 0
      ? new Date(reset * 1_000).toISOString()
      : retryAfter > 0
        ? new Date(Date.now() + retryAfter * 1_000).toISOString()
        : "";
    const suffix = resetAt ? `，预计 ${resetAt} 后恢复` : "";
    return new DomainError("GITHUB_RATE_LIMITED", `GitHub 请求触发限流${suffix}`, 429);
  }
  if (status === 422) return new DomainError("GITHUB_QUERY_INVALID", "GitHub 查询条件无效", 400);
  if (status >= 500) return new DomainError("UPSTREAM_UNAVAILABLE", "GitHub 服务暂时不可用", 502);
  return new DomainError("UPSTREAM_UNAVAILABLE", "GitHub 服务不可用", 502);
}
