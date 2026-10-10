import { DomainError } from "../domain.js";
import { fetchText } from "../providers/http-json.js";
import type { SettingsService } from "./settings.js";

type OAuthToken = { accessToken: string; refreshToken: string; expiresAt: number };
type PendingAuth = { deviceCode: string; interval: number; expiresAt: number; nextPollAt: number };
type ApiObject = Record<string, unknown>;

const scopes = "search:docs:read docx:document:readonly wiki:node:read wiki:node:retrieve offline_access";

export class FeishuConnectionService {
  constructor(private readonly settings: SettingsService, private readonly fetchImpl: typeof fetch = fetch) {}

  status() {
    const appId = this.settings.get<string>("feishu.appId") ?? "";
    const token = this.settings.get<OAuthToken>("feishu.oauthToken");
    const pending = this.settings.get<PendingAuth>("feishu.oauthPending");
    return { configured: Boolean(appId && this.settings.get<string>("feishu.appSecret")), appId, connected: Boolean(token?.refreshToken), pending: Boolean(pending && pending.expiresAt > Date.now()) };
  }

  configure(appId: string, appSecret: string): void {
    const id = appId.trim();
    const secret = appSecret.trim();
    if (!/^cli_[a-zA-Z0-9]{5,100}$/.test(id) || !secret || secret.length > 500) throw new DomainError("FEISHU_APP_INVALID", "飞书应用凭据格式无效", 400);
    if (this.settings.get<string>("feishu.appId") !== id || this.settings.get<string>("feishu.appSecret") !== secret) this.disconnect();
    this.settings.set("feishu.appId", id);
    this.settings.set("feishu.appSecret", secret);
  }

  disconnect(): void {
    this.settings.delete("feishu.oauthToken");
    this.settings.delete("feishu.oauthPending");
  }

  clear(): void {
    this.disconnect();
    this.settings.delete("feishu.appId");
    this.settings.delete("feishu.appSecret");
  }

  async begin(): Promise<{ verificationUrl: string; userCode: string; expiresIn: number }> {
    const { appId, appSecret } = this.credentials();
    const data = await this.postForm("https://accounts.feishu.cn/oauth/v1/device_authorization", { client_id: appId, client_secret: appSecret, scope: scopes });
    const deviceCode = stringField(data, "device_code");
    const userCode = stringField(data, "user_code");
    const verificationUrl = stringField(data, "verification_uri_complete") || stringField(data, "verification_uri");
    const interval = numberField(data, "interval", 5);
    const expiresIn = numberField(data, "expires_in", 300);
    if (!deviceCode || !userCode || !verificationUrl || !isOfficialAuthUrl(verificationUrl)) throw new DomainError("FEISHU_OAUTH_INVALID_RESPONSE", "飞书授权响应无效", 502);
    this.settings.set("feishu.oauthPending", { deviceCode, interval, expiresAt: Date.now() + expiresIn * 1000, nextPollAt: 0 } satisfies PendingAuth);
    return { verificationUrl, userCode, expiresIn };
  }

  async poll(): Promise<{ status: "pending" | "connected"; retryAfter: number }> {
    const pending = this.settings.get<PendingAuth>("feishu.oauthPending");
    if (!pending || pending.expiresAt <= Date.now()) {
      this.settings.delete("feishu.oauthPending");
      throw new DomainError("FEISHU_OAUTH_EXPIRED", "飞书授权已过期，请重新连接", 400);
    }
    if (pending.nextPollAt > Date.now()) return { status: "pending", retryAfter: Math.ceil((pending.nextPollAt - Date.now()) / 1000) };
    const { appId, appSecret } = this.credentials();
    const data = await this.postForm("https://open.feishu.cn/open-apis/authen/v2/oauth/token", { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: appId, client_secret: appSecret, device_code: pending.deviceCode }, true);
    const accessToken = stringField(data, "access_token");
    if (accessToken) {
      this.saveToken(data);
      this.settings.delete("feishu.oauthPending");
      return { status: "connected", retryAfter: 0 };
    }
    const error = stringField(data, "error") || String(data.code ?? "");
    if (error === "authorization_pending" || error === "91031" || error === "slow_down" || error === "91032") {
      const interval = pending.interval + (error === "slow_down" || error === "91032" ? 5 : 0);
      this.settings.set("feishu.oauthPending", { ...pending, interval, nextPollAt: Date.now() + interval * 1000 });
      return { status: "pending", retryAfter: interval };
    }
    this.settings.delete("feishu.oauthPending");
    throw new DomainError(error === "access_denied" ? "FEISHU_OAUTH_DENIED" : "FEISHU_OAUTH_FAILED", "飞书授权未完成", 400);
  }

  async token(): Promise<string> {
    const saved = this.settings.get<OAuthToken>("feishu.oauthToken");
    if (!saved?.refreshToken) throw new DomainError("FEISHU_OAUTH_REQUIRED", "请先连接飞书账号", 401);
    if (saved.expiresAt > Date.now() + 5 * 60_000) return saved.accessToken;
    const { appId, appSecret } = this.credentials();
    const data = await this.postForm("https://open.feishu.cn/open-apis/authen/v2/oauth/token", { grant_type: "refresh_token", client_id: appId, client_secret: appSecret, refresh_token: saved.refreshToken }, true);
    if (!stringField(data, "access_token")) {
      this.disconnect();
      throw new DomainError("FEISHU_OAUTH_EXPIRED", "飞书授权已失效，请重新连接", 401);
    }
    this.saveToken(data, saved.refreshToken);
    return stringField(data, "access_token");
  }

  async request(path: string, init: RequestInit = {}): Promise<ApiObject> {
    if (!path.startsWith("/open-apis/")) throw new DomainError("FEISHU_API_PATH_INVALID", "飞书接口路径无效", 500);
    const accessToken = await this.token();
    const response = await fetchText(`https://open.feishu.cn${path}`, { ...init, headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) } }, { timeoutMs: 20_000, maxBytes: 2_000_000, fetch: this.fetchImpl });
    let data: ApiObject;
    try { data = JSON.parse(response.text) as ApiObject; } catch { throw new DomainError("FEISHU_API_INVALID_RESPONSE", "飞书响应格式无效", 502); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new DomainError("FEISHU_API_INVALID_RESPONSE", "飞书响应格式无效", 502);
    if (response.status === 429) throw new DomainError("FEISHU_RATE_LIMITED", "飞书请求过于频繁", 429);
    if (response.status === 401 || data.code === 99991663 || data.code === 99991668) throw new DomainError("FEISHU_OAUTH_EXPIRED", "飞书授权已失效，请重新连接", 401);
    if (response.status === 403) throw new DomainError("FEISHU_PERMISSION_DENIED", "当前飞书账号无权读取该文档", 403);
    if (response.status >= 400 || data.code !== 0) throw new DomainError("FEISHU_API_FAILED", "飞书文档请求失败", 502);
    return data;
  }

  private credentials(): { appId: string; appSecret: string } {
    const appId = this.settings.get<string>("feishu.appId") ?? "";
    const appSecret = this.settings.get<string>("feishu.appSecret") ?? "";
    if (!appId || !appSecret) throw new DomainError("FEISHU_APP_REQUIRED", "请先配置飞书应用 ID 和密钥", 400);
    return { appId, appSecret };
  }

  private saveToken(data: ApiObject, existingRefreshToken = ""): void {
    const accessToken = stringField(data, "access_token");
    const refreshToken = stringField(data, "refresh_token") || existingRefreshToken;
    if (!accessToken || !refreshToken) throw new DomainError("FEISHU_OAUTH_INVALID_RESPONSE", "飞书授权未返回完整令牌", 502);
    this.settings.set("feishu.oauthToken", { accessToken, refreshToken, expiresAt: Date.now() + numberField(data, "expires_in", 7200) * 1000 } satisfies OAuthToken);
  }

  private async postForm(url: string, body: Record<string, string>, permitError = false): Promise<ApiObject> {
    const response = await fetchText(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(body) }, { timeoutMs: 20_000, maxBytes: 50_000, fetch: this.fetchImpl });
    let data: ApiObject;
    try { data = JSON.parse(response.text) as ApiObject; } catch { throw new DomainError("FEISHU_OAUTH_INVALID_RESPONSE", "飞书授权响应无效", 502); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new DomainError("FEISHU_OAUTH_INVALID_RESPONSE", "飞书授权响应无效", 502);
    if (!permitError && (response.status >= 400 || data.error || (typeof data.code === "number" && data.code !== 0))) throw new DomainError("FEISHU_OAUTH_FAILED", "飞书授权请求失败", 502);
    return data;
  }
}

function stringField(value: ApiObject, key: string): string { return typeof value[key] === "string" ? value[key] as string : ""; }
function numberField(value: ApiObject, key: string, fallback: number): number { const n = Number(value[key]); return Number.isFinite(n) && n > 0 ? n : fallback; }
function isOfficialAuthUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "accounts.feishu.cn" || url.hostname === "open.feishu.cn"); } catch { return false; } }
