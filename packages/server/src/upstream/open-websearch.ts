import { z } from "zod";
import type { FetchContent, SearchInput, UpstreamSearchResponse } from "../domain.js";
import { DomainError, engineIds } from "../domain.js";

const resultSchema = z.object({
  title: z.string().default(""),
  url: z.string().url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "result URLs must use HTTP(S)"),
  description: z.string().default(""),
  engine: z.string().optional(),
  engines: z.array(z.string()).optional(),
});
const searchResponseSchema = z.union([
  z.array(resultSchema).transform((results) => ({ results, failures: [] as Array<{ engine: string; code: string; message: string }> })),
  z.object({
    results: z.array(resultSchema),
    partialFailures: z.array(z.object({ engine: z.string(), code: z.string().default("UPSTREAM_ERROR"), message: z.string().default("上游引擎失败") })).default([]),
  }).transform((value) => ({ results: value.results, failures: value.partialFailures })),
]);
const envelopeSchema = z.object({
  status: z.enum(["ok", "error"]),
  data: z.unknown().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
});
const statusSchema = z.object({
  version: z.string(),
  configSummary: z.object({
    effectiveSearchMode: z.string().optional(),
    searchMode: z.string().optional(),
    fetchWebAllowInsecureTls: z.boolean(),
  }),
});

export interface OpenWebSearchClient {
  search(input: SearchInput): Promise<UpstreamSearchResponse>;
  fetchWebContent(input: { url: string; maxChars: number }): Promise<FetchContent>;
  fetchGithubReadme(input: { url: string }): Promise<string | null>;
  fetchCsdnArticle(input: { url: string }): Promise<string>;
  fetchJuejinArticle(input: { url: string }): Promise<string>;
  fetchLinuxDoArticle(input: { url: string }): Promise<string>;
  health(): Promise<void>;
  assertSecureRuntime(): Promise<void>;
}

export class HttpOpenWebSearchClient implements OpenWebSearchClient {
  constructor(private readonly baseUrl: URL, private readonly expectedVersion: string, private readonly timeoutMs = 20_000, private readonly allowUnknownVersion = false) {}

  async health(): Promise<void> {
    await this.request("health", undefined, "GET");
  }

  async assertSecureRuntime(): Promise<void> {
    let status: z.infer<typeof statusSchema>;
    try {
      status = statusSchema.parse(await this.request("status", undefined, "GET"));
    } catch (error) {
      if (error instanceof z.ZodError) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      throw error;
    }
    // The current daemon reports `unknown` when it is installed from npm; the exact
    // workspace dependency remains the source of version pinning in that case.
    if ((status.version === "unknown" && !this.allowUnknownVersion) || (status.version !== "unknown" && status.version !== this.expectedVersion)) throw new DomainError("UPSTREAM_VERSION_MISMATCH", "上游服务版本不匹配", 503);
    const searchMode = status.configSummary.effectiveSearchMode ?? status.configSummary.searchMode;
    if (searchMode !== "request") throw new DomainError("UPSTREAM_SEARCH_MODE_UNSAFE", "上游未处于 request 搜索模式", 503);
    if (status.configSummary.fetchWebAllowInsecureTls) throw new DomainError("UPSTREAM_TLS_UNSAFE", "上游不能关闭 TLS 证书校验", 503);
  }

  async search(input: SearchInput): Promise<UpstreamSearchResponse> {
    let payload: z.infer<typeof searchResponseSchema>;
    try {
      payload = searchResponseSchema.parse(await this.request("search", input));
    } catch (error) {
      if (error instanceof z.ZodError) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      throw error;
    }
    return {
      results: payload.results.map((result) => ({
        title: result.title,
        url: result.url,
        description: result.description,
        faviconUrl: faviconUrl(result.url),
        engines: this.resultEngines(result),
      })),
      failures: payload.failures.filter((failure): failure is { engine: SearchInput["engines"][number]; code: string; message: string } => engineIds.includes(failure.engine as SearchInput["engines"][number])),
    };
  }

  async fetchWebContent(input: { url: string; maxChars: number }): Promise<FetchContent> {
    try {
      return z.object({
      url: z.string().url(),
      finalUrl: z.string().url().optional(),
      title: z.string().default(""),
      contentType: z.string().default("text/plain"),
      truncated: z.boolean().default(false),
      content: z.string(),
      readableHtml: z.string().optional(),
      retrievalMethod: z.string().optional(),
      extractionMethod: z.string().optional(),
      readabilityApplied: z.boolean().optional(),
    }).transform((value) => {
      const content = readableTextFromHtml(value.readableHtml, value.content);
      return {
        url: value.url,
        finalUrl: value.finalUrl ?? value.url,
        title: value.title,
        contentType: value.contentType,
        truncated: value.truncated || content.length > input.maxChars,
        content: content.slice(0, input.maxChars),
        ...(value.retrievalMethod ? { retrievalMethod: value.retrievalMethod } : {}),
        ...(value.extractionMethod ? { extractionMethod: value.extractionMethod } : {}),
        ...(value.readabilityApplied !== undefined ? { readabilityApplied: value.readabilityApplied } : {}),
      };
    }).parse(await this.request("fetch-web", { ...input, renderMode: "request", readability: true }));
    } catch (error) {
      if (error instanceof z.ZodError) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      throw error;
    }
  }

  async fetchGithubReadme(input: { url: string }): Promise<string | null> {
    return this.fetchSpecializedContent("fetch-github-readme", input.url, true);
  }

  async fetchCsdnArticle(input: { url: string }): Promise<string> {
    return (await this.fetchSpecializedContent("fetch-csdn", input.url)) ?? "";
  }

  async fetchJuejinArticle(input: { url: string }): Promise<string> {
    return (await this.fetchSpecializedContent("fetch-juejin", input.url)) ?? "";
  }

  async fetchLinuxDoArticle(input: { url: string }): Promise<string> {
    return (await this.fetchSpecializedContent("fetch-linuxdo", input.url)) ?? "";
  }

  private resultEngines(result: z.infer<typeof resultSchema>): SearchInput["engines"] {
    const candidates = result.engines ?? (result.engine ? [result.engine] : []);
    return candidates.filter((engine): engine is SearchInput["engines"][number] => engineIds.includes(engine as SearchInput["engines"][number]));
  }

  private async fetchSpecializedContent(path: string, url: string, nullable = false): Promise<string | null> {
    try {
      const data = z.object({ url: z.string().url(), content: nullable ? z.string().nullable() : z.string() }).parse(await this.request(path, { url }));
      return data.content;
    } catch (error) {
      if (error instanceof z.ZodError) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      throw error;
    }
  }

  private async request(path: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > 2_000_000) throw new DomainError("UPSTREAM_RESPONSE_TOO_LARGE", "上游响应过大", 502);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await this.readBody(response));
      } catch {
        throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      }
      const envelope = envelopeSchema.safeParse(parsed);
      if (!envelope.success) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      if (!response.ok) {
        const code = envelope.data.error?.code?.replace(/[^a-z0-9_]+/gi, "_").toUpperCase() || "UNAVAILABLE";
        if (code === "CONTENT_NOT_EXTRACTED" || envelope.data.error?.message === "No readable content was extracted from this URL") {
          throw new DomainError("CONTENT_NOT_EXTRACTED", "页面已访问，但未识别到可读正文", 422);
        }
        throw new DomainError(`UPSTREAM_${code}`, envelope.data.error?.message || "上游服务返回异常", response.status >= 500 ? 502 : 400);
      }
      if (envelope.data.status === "error") {
        const code = envelope.data.error?.code?.replace(/[^a-z0-9_]+/gi, "_").toUpperCase() || "ERROR";
        throw new DomainError(`UPSTREAM_${code}`, envelope.data.error?.message || "上游服务失败", 502);
      }
      return envelope.data.data;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof z.ZodError) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游服务返回格式无效", 502);
      if (error instanceof Error && error.name === "AbortError") throw new DomainError("UPSTREAM_TIMEOUT", "上游服务超时", 504);
      throw new DomainError("UPSTREAM_UNAVAILABLE", "上游服务不可用", 502);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBody(response: Response): Promise<string> {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new DomainError("UPSTREAM_RESPONSE_TOO_LARGE", "上游响应过大", 502);
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
}

function faviconUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}/favicon.ico`;
}

function readableTextFromHtml(html: string | undefined, fallback = ""): string {
  if (!html) return fallback;
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:p|div|section|article|h[1-6]|li|br)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || fallback;
}
