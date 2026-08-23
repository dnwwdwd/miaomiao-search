import { lookup as nodeLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { DomainError } from "../domain.js";

type Resolver = (hostname: string) => Promise<{ address: string }[]>;

const defaultResolver: Resolver = async (hostname) => nodeLookup(hostname, { all: true, verbatim: true });

function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6") {
      const ipv6 = parsed as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) return isPublicAddress(ipv6.toIPv4Address().toString());
    }
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

export async function validatePublicHttpUrl(value: string, resolver: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("INVALID_URL", "URL 格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DomainError("URL_SCHEME_NOT_ALLOWED", "仅允许 HTTP(S) URL");
  }
  if (url.username || url.password) {
    throw new DomainError("URL_CREDENTIALS_NOT_ALLOWED", "URL 不能包含凭据");
  }
  if (url.hostname.endsWith(".local") || url.hostname === "localhost") {
    throw new DomainError("SSRF_BLOCKED", "不允许访问本地地址", 403);
  }
  if (ipaddr.isValid(url.hostname)) {
    if (!isPublicAddress(url.hostname)) throw new DomainError("SSRF_BLOCKED", "不允许访问私有网络地址", 403);
    return url;
  }

  let answers: { address: string }[];
  try {
    answers = await resolver(url.hostname);
  } catch {
    throw new DomainError("DNS_RESOLUTION_FAILED", "无法解析目标域名", 422);
  }
  if (answers.length === 0 || answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new DomainError("SSRF_BLOCKED", "目标域名解析到了非公网地址", 403);
  }
  return url;
}
