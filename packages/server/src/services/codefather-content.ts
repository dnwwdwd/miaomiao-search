import { z } from "zod";
import { DomainError } from "../domain.js";
import { fetchJson } from "../providers/http-json.js";

const contentSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    plainTextDescription: z.string().optional(),
    category: z.string().optional(),
    cover: z.string().optional(),
    thumbnailCover: z.string().optional(),
    createTime: z.union([z.number(), z.string()]).optional(),
    user: z.object({
      userName: z.string().optional(),
    }).optional(),
  }).optional(),
});

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/** Content shapes exposed by codefather.cn, each backed by its own public API. */
export type CodefatherKind = "post" | "essay" | "qa";
export type CodefatherTarget = { kind: CodefatherKind; id: string };

/**
 * Match only content URL shapes that have a dedicated codefather API. There is
 * no mobile host; `/post`, `/essay` and `/qa` are the real detail routes.
 */
export function identifyCodefatherContentUrl(input: string): CodefatherTarget | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (host !== "codefather.cn" && host !== "www.codefather.cn") return null;
    const match = /^\/(post|essay|qa)\/([0-9]+)\/?$/.exec(parsed.pathname);
    return match ? { kind: match[1] as CodefatherKind, id: match[2] } : null;
  } catch {
    return null;
  }
}

export type CodefatherArticle = {
  sourceUrl: string;
  title: string;
  author?: string;
  publishedAt?: string;
  markdown: string;
  images: string[];
  coverUrl?: string;
  truncated: boolean;
};

/** Resolve a URL or a bare numeric id (kept as a `post` for backward compatibility). */
function resolveTarget(input: string): CodefatherTarget | null {
  const fromUrl = identifyCodefatherContentUrl(input);
  if (fromUrl) return fromUrl;
  const trimmed = input.trim();
  return /^\d+$/.test(trimmed) ? { kind: "post", id: trimmed } : null;
}

/**
 * `essay` records carry no title field, so fall back to the first non-empty
 * line of the body (stripping markdown markers) before giving up.
 */
function deriveTitle(markdown: string, category?: string): string {
  const line = markdown.split("\n").map((value) => value.trim()).find(Boolean) ?? "";
  const cleaned = line.replace(/^#{1,6}\s*/, "").replace(/[*`_>]/g, "").trim();
  return cleaned.slice(0, 120) || category?.trim() || "编程导航内容";
}

export class CodefatherContentService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchArticle(input: string, maxChars = 50_000): Promise<CodefatherArticle> {
    const target = resolveTarget(input);
    if (!target) {
      throw new DomainError("CODEFATHER_URL_INVALID", "无效的编程导航链接或 ID", 400);
    }

    const apiUrl = `https://api.codefather.cn/api/${target.kind}/get/vo?id=${encodeURIComponent(target.id)}`;
    const sourceUrl = `https://www.codefather.cn/${target.kind}/${target.id}`;

    const response = await fetchJson(apiUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        origin: "https://www.codefather.cn",
        referer: "https://www.codefather.cn/",
        "user-agent": userAgent,
      },
    }, { timeoutMs: 15_000, schema: contentSchema, fetch: this.fetchImpl });

    if (response.status === 404) throw new DomainError("CONTENT_NOT_FOUND", "内容不存在", 404);
    if (response.status === 408) throw new DomainError("UPSTREAM_TIMEOUT", "编程导航请求超时", 504);
    if (response.status >= 500) throw new DomainError("UPSTREAM_UNAVAILABLE", "编程导航服务暂时不可用", 502);
    if (!response.data) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "编程导航响应格式无效", 502);

    const code = response.data.code;
    if (code === 40100) throw new DomainError("CODEFATHER_LOGIN_REQUIRED", "该内容需要登录后查看", 401);
    if (code === 40102) throw new DomainError("CODEFATHER_VIP_REQUIRED", "该内容为会员专属内容", 403);
    if (code === 40400) throw new DomainError("CONTENT_NOT_FOUND", "未找到该内容", 404);
    if (code !== 0) throw new DomainError("CODEFATHER_API_ERROR", response.data.message || "编程导航内容获取失败", 502);

    const post = response.data.data;
    const rawMarkdown = (post?.content ?? post?.plainTextDescription ?? "").trim();
    if (!post || !rawMarkdown) {
      throw new DomainError("CONTENT_NOT_FOUND", "未找到内容正文", 404);
    }

    const truncated = rawMarkdown.length > maxChars;
    const markdown = truncated ? rawMarkdown.slice(0, maxChars) : rawMarkdown;

    const images: string[] = [];
    if (post.cover && typeof post.cover === "string") images.push(post.cover);
    else if (post.thumbnailCover && typeof post.thumbnailCover === "string") images.push(post.thumbnailCover);

    const imgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(rawMarkdown)) !== null) {
      if (!images.includes(match[1])) {
        images.push(match[1]);
      }
    }

    let publishedAt: string | undefined;
    if (post.createTime != null) {
      const ts = Number(post.createTime);
      if (Number.isFinite(ts) && ts > 0) {
        publishedAt = new Date(ts).toISOString();
      }
    }

    return {
      sourceUrl,
      title: post.title?.trim() || deriveTitle(rawMarkdown, post.category),
      ...(post.user?.userName ? { author: post.user.userName } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      markdown,
      images,
      ...(post.cover ? { coverUrl: post.cover } : {}),
      truncated,
    };
  }
}
