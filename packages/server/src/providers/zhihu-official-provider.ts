import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DomainError } from "../domain.js";
import { engineApiKeySetting } from "../engine-catalog.js";
import type { SettingsService } from "../services/settings.js";
import { cleanText, normalizeHttpUrl } from "./text.js";
import type { ProviderSearchInput, ProviderSearchResponse, SearchProvider } from "./types.js";

const execFileAsync = promisify(execFile);
type CliRunner = (query: string, count: number, secret: string) => Promise<string>;

export async function runZhihuOfficialCli(query: string, count: number, secret: string): Promise<string> {
  const binary = process.env.ZHIHU_CLI_PATH || "zhihu-cli";
  try {
    const { stdout } = await execFileAsync(binary, ["search", "zhihu", "--query", query, "--count", String(count), "--timeout", "15s"], {
      env: { ...process.env, ZHIHU_ACCESS_SECRET: secret },
      timeout: 18_000,
      maxBuffer: 1_000_000,
      encoding: "utf8",
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    // CLI diagnostics may contain upstream data. Never pass stderr, stdout or
    // the child-process error through to API responses or persisted health logs.
    const failed = error as NodeJS.ErrnoException & { stdout?: string };
    const code = failed.code;
    if (code === "ENOENT") throw new DomainError("ZHIHU_CLI_UNAVAILABLE", "知乎官方 CLI 未安装", 503);
    if (code === "ETIMEDOUT") throw new DomainError("UPSTREAM_TIMEOUT", "知乎官方 CLI 搜索超时", 504);
    let body: Record<string, unknown> = {};
    try { body = record(JSON.parse(failed.stdout || "")); } catch { /* discard untrusted diagnostics */ }
    const cliCode = record(body.error).code;
    const upstreamCode = Number(body.Code || record(body.error).upstream_code || cliCode);
    if (cliCode === "AUTH_REQUIRED" || cliCode === "AUTH_INVALID" || upstreamCode === 20001) throw new DomainError("ZHIHU_AUTH_FAILED", "知乎 Access Secret 无效或无权限", 502);
    if (upstreamCode === 30001) throw new DomainError("ZHIHU_RATE_LIMITED", "知乎官方接口请求过于频繁", 429);
    if (upstreamCode === 30002) throw new DomainError("ZHIHU_QUOTA_EXHAUSTED", "知乎官方接口额度已用尽", 502);
    if (cliCode === "TIMEOUT") throw new DomainError("UPSTREAM_TIMEOUT", "知乎官方 CLI 搜索超时", 504);
    throw new DomainError("ZHIHU_CLI_FAILED", "知乎官方 CLI 搜索失败，请检查 Access Secret、额度及网络", 502);
  }
}

export class ZhihuOfficialProvider implements SearchProvider {
  readonly engine = "zhihu_official" as const;
  readonly maxResults = 10;
  readonly cacheVersion = "zhihu-official-cli-0.6.0-v2";

  constructor(private readonly settings: SettingsService, private readonly run: CliRunner = runZhihuOfficialCli) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const secret = this.settings.get<string>(engineApiKeySetting(this.engine))?.trim();
    if (!secret) throw new DomainError("ENGINE_API_KEY_REQUIRED", "知乎官方 CLI 需要 Access Secret");
    const count = Math.max(1, Math.min(this.maxResults, input.limit));
    const output = await this.run(input.query.trim(), count, secret);
    let parsed: unknown;
    try { parsed = JSON.parse(output); }
    catch { throw new DomainError("UPSTREAM_INVALID_RESPONSE", "知乎官方 CLI 返回的数据无效", 502); }
    const envelope = record(parsed);
    if (envelope.Code !== 0) {
      const code = Number(envelope.Code);
      if (code === 20001) throw new DomainError("ZHIHU_AUTH_FAILED", "知乎 Access Secret 无效或无权限", 502);
      if (code === 30001) throw new DomainError("ZHIHU_RATE_LIMITED", "知乎官方接口请求过于频繁", 429);
      if (code === 30002) throw new DomainError("ZHIHU_QUOTA_EXHAUSTED", "知乎官方接口额度已用尽", 502);
      throw new DomainError("ZHIHU_CLI_FAILED", "知乎官方 CLI 搜索失败", 502);
    }
    const items = record(envelope.Data).Items;
    if (!Array.isArray(items)) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "知乎官方 CLI 返回的数据无效", 502);
    const results: ProviderSearchResponse["results"] = [];
    for (const item of items) {
      const value = record(item);
      const url = normalizeHttpUrl(value.Url);
      if (!url) continue;
      results.push({
        title: cleanText(value.Title).slice(0, 500) || url,
        url,
        description: cleanText(value.ContentText).slice(0, 1_000),
        faviconUrl: "https://www.zhihu.com/favicon.ico",
        zhihuMeta: {
          contentType: cleanText(value.ContentType).slice(0, 40) || undefined,
          author: cleanText(value.AuthorName).slice(0, 120) || undefined,
          voteUpCount: nonNegativeInteger(value.VoteUpCount),
          commentCount: nonNegativeInteger(value.CommentCount),
          editedAt: validTimestamp(value.EditTime),
        },
        engines: [this.engine],
      });
      if (results.length >= count) break;
    }
    return { results, failures: [] };
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonNegativeInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function validTimestamp(value: unknown): number | undefined {
  const timestamp = nonNegativeInteger(value);
  return timestamp && timestamp <= 4_102_444_800 ? timestamp : undefined;
}
