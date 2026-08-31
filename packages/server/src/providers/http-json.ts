import { DomainError } from "../domain.js";

const defaultMaxBytes = 2_000_000;
const maxTimeoutMs = 60_000;

export type HttpFetchOptions<T> = {
  timeoutMs: number;
  maxBytes?: number;
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } };
  fetch?: typeof fetch;
};

export type HttpFetchResult<T> = { status: number; headers: Headers; data?: T };
export type HttpTextResult = { status: number; headers: Headers; text: string };

export async function fetchJson<T>(url: string, init: RequestInit, options: HttpFetchOptions<T>): Promise<HttpFetchResult<T>> {
  const response = await fetchBounded(url, init, options.timeoutMs, options.maxBytes ?? defaultMaxBytes, options.fetch);
  if (!response.text.trim()) return { status: response.status, headers: response.headers };
  let parsed: unknown;
  try { parsed = JSON.parse(response.text); } catch {
    if (!response.ok) return { status: response.status, headers: response.headers };
    throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游响应格式无效", 502);
  }
  if (!response.ok) {
    const checked = options.schema.safeParse(parsed);
    return { status: response.status, headers: response.headers, ...(checked.success ? { data: checked.data } : {}) };
  }
  const checked = options.schema.safeParse(parsed);
  if (!checked.success) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "上游响应格式无效", 502);
  return { status: response.status, headers: response.headers, data: checked.data };
}

export async function fetchText(url: string, init: RequestInit = {}, options: { timeoutMs: number; maxBytes?: number; fetch?: typeof fetch }): Promise<HttpTextResult> {
  const response = await fetchBounded(url, init, options.timeoutMs, options.maxBytes ?? defaultMaxBytes, options.fetch);
  return { status: response.status, headers: response.headers, text: response.text };
}

async function fetchBounded(url: string, init: RequestInit, timeoutMs: number, maxBytes: number, fetchImpl: typeof fetch = fetch): Promise<{ status: number; headers: Headers; text: string; ok: boolean }> {
  const boundedTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(Math.floor(timeoutMs), maxTimeoutMs)) : maxTimeoutMs;
  const boundedMaxBytes = Number.isFinite(maxBytes) ? Math.max(1, Math.min(Math.floor(maxBytes), defaultMaxBytes)) : defaultMaxBytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedTimeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > boundedMaxBytes) throw new DomainError("UPSTREAM_RESPONSE_TOO_LARGE", "上游响应过大", 502);
    return { status: response.status, headers: response.headers, ok: response.ok, text: await readBody(response, boundedMaxBytes) };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new DomainError("UPSTREAM_TIMEOUT", "上游服务超时", 504);
    throw new DomainError("UPSTREAM_UNAVAILABLE", "上游服务不可用", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new DomainError("UPSTREAM_RESPONSE_TOO_LARGE", "上游响应过大", 502);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
