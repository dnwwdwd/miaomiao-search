import { assertHttpUrlWithoutCredentials, DomainError } from "../domain.js";

const namedEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function cleanText(value: unknown): string {
  // Decode first so encoded tags/control characters are normalized by the
  // same sanitization pass as their literal forms.
  return decodeEntities(String(value ?? ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripBilibiliMarkup(value: unknown): string {
  return cleanText(value);
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi, (full, token: string) => {
    if (token.toLowerCase().startsWith("#x")) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : full;
    }
    if (token.startsWith("#")) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : full;
    }
    return namedEntities[token.toLowerCase()] ?? full;
  });
}

export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return assertHttpUrlWithoutCredentials(value.trim()).toString(); } catch { return null; }
}

export function faviconFromUrl(value: string): string {
  try { return `${new URL(value).origin}/favicon.ico`; } catch { return ""; }
}

export function normalizeBilibiliUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const raw = value.trim().startsWith("//") ? `https:${value.trim()}` : value.trim();
    const url = assertHttpUrlWithoutCredentials(raw);
    const host = url.hostname.toLowerCase();
    if (host !== "www.bilibili.com" && host !== "bilibili.com") return null;
    url.protocol = "https:";
    return url.toString();
  } catch { return null; }
}

export function bilibiliVideoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bvid = value.trim();
  if (!/^BV[0-9A-Za-z]+$/.test(bvid)) return null;
  return `https://www.bilibili.com/video/${bvid}`;
}

export function officialBilibiliThumbnail(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const candidate = value.trim().startsWith("//") ? `https:${value.trim()}` : value.trim();
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase();
    if (!host.endsWith(".hdslb.com")) return undefined;
    return url.toString();
  } catch { return undefined; }
}

export function safeErrorMessage(fallback: string): string {
  return fallback;
}

export function invalidProviderUrl(): DomainError {
  return new DomainError("UPSTREAM_INVALID_URL", "上游返回了无效链接", 502);
}
