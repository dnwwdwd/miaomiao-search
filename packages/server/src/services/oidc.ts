import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { OidcConfig } from "../config.js";
import { DomainError } from "../domain.js";

const encoder = new TextEncoder();
const stateMaxAgeMs = 10 * 60 * 1_000;

export type OidcState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export type PortalUser = {
  id: string;
  account: string;
  name: string;
  role: "ADMIN" | "NORMAL";
  loginMethod: "oidc" | "local";
};

export type SessionBinding = { gatewayUserId: string; ownerId: string };
export type VerifiedSession = { user: PortalUser; gatewayUserId?: string; ownerId?: string };

export type LazycatIdentityHints = {
  account?: string;
  role?: string;
};

export class OidcService {
  private readonly sessionKey: Uint8Array;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: OidcConfig, sessionSecret: string) {
    this.sessionKey = encoder.encode(sessionSecret);
  }

  begin(): { authorizationUrl: string; state: OidcState } {
    const state: OidcState = {
      state: randomBytes(32).toString("base64url"),
      nonce: randomBytes(32).toString("base64url"),
      codeVerifier: randomBytes(64).toString("base64url"),
      createdAt: Date.now(),
    };
    const authorizationUrl = new URL(this.config.authorizationUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", this.config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", this.config.redirectUri);
    authorizationUrl.searchParams.set("scope", "openid profile email groups");
    authorizationUrl.searchParams.set("state", state.state);
    authorizationUrl.searchParams.set("nonce", state.nonce);
    authorizationUrl.searchParams.set("code_challenge", createHash("sha256").update(state.codeVerifier).digest("base64url"));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    return { authorizationUrl: authorizationUrl.toString(), state };
  }

  async complete(code: string, returnedState: string, state: OidcState, hints: LazycatIdentityHints = {}): Promise<PortalUser> {
    if (Date.now() - state.createdAt > stateMaxAgeMs || returnedState !== state.state) {
      throw new DomainError("OIDC_STATE_INVALID", "登录状态已失效，请重新发起登录", 401);
    }
    const response = await fetch(this.config.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code_verifier: state.codeVerifier,
      }),
    });
    if (!response.ok) throw new DomainError("OIDC_TOKEN_EXCHANGE_FAILED", "登录授权未完成，请重试", 401);
    const tokens = await response.json() as { id_token?: unknown; access_token?: unknown };
    if (typeof tokens.id_token !== "string") throw new DomainError("OIDC_ID_TOKEN_MISSING", "登录授权未返回身份信息", 401);
    const verified = await jwtVerify(tokens.id_token, await this.getJwks(), {
      issuer: this.config.issuerUri.toString().replace(/\/$/, ""),
      audience: this.config.clientId,
    });
    if (verified.payload.nonce !== state.nonce || typeof verified.payload.sub !== "string" || !verified.payload.sub) {
      throw new DomainError("OIDC_ID_TOKEN_INVALID", "登录身份校验失败", 401);
    }
    const userinfo = typeof tokens.access_token === "string" ? await this.fetchUserinfo(tokens.access_token) : {};
    const role = hints.role === "ADMIN" || (hints.role !== "NORMAL" && Array.isArray(verified.payload.groups) && verified.payload.groups.includes("ADMIN")) ? "ADMIN" : "NORMAL";
    const account = resolveOidcAccount(hints.account, userinfo, verified.payload);
    const displayName = firstClaim(userinfo, ["name", "preferred_username", "username", "user_name", "email"]) || firstClaim(verified.payload, ["name", "preferred_username", "username", "user_name", "email"]) || account;
    return { id: verified.payload.sub, account, name: displayName, role, loginMethod: "oidc" };
  }

  async createSession(user: PortalUser, binding?: SessionBinding): Promise<string> {
    return new SignJWT({ account: user.account, name: user.name, role: user.role, loginMethod: user.loginMethod, ...(binding ? { gatewayUserId: binding.gatewayUserId, ownerId: binding.ownerId } : {}) })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(this.sessionKey);
  }

  createLogoutUrl(postLogoutRedirectUri: string): string | null {
    if (this.config.issuerUri.hostname === "oidc.invalid") return null;
    const issuer = this.config.issuerUri.toString().replace(/\/$/, "");
    const logoutUrl = new URL(`${issuer}/logout`);
    logoutUrl.searchParams.set("client_id", this.config.clientId);
    logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    logoutUrl.searchParams.set("redirect_uri", postLogoutRedirectUri);
    return logoutUrl.toString();
  }

  async verifySession(token: string, currentGatewayUserId?: string): Promise<PortalUser> {
    return (await this.verifySessionContext(token, currentGatewayUserId)).user;
  }

  async verifySessionContext(token: string, currentGatewayUserId?: string): Promise<VerifiedSession> {
    try {
      const verified = await jwtVerify(token, this.sessionKey, { algorithms: ["HS256"] });
      if (typeof verified.payload.sub !== "string" || !verified.payload.sub || typeof verified.payload.name !== "string" || (verified.payload.role !== "ADMIN" && verified.payload.role !== "NORMAL")) throw new Error("invalid session");
      const account = typeof verified.payload.account === "string" && verified.payload.account ? verified.payload.account : verified.payload.name;
      const loginMethod = verified.payload.loginMethod === "local" ? "local" : "oidc";
      const gatewayUserId = typeof verified.payload.gatewayUserId === "string" && verified.payload.gatewayUserId ? verified.payload.gatewayUserId : undefined;
      const ownerId = typeof verified.payload.ownerId === "string" && verified.payload.ownerId ? verified.payload.ownerId : undefined;
      if (currentGatewayUserId !== undefined && (!gatewayUserId || gatewayUserId !== currentGatewayUserId || !ownerId)) throw new DomainError("GATEWAY_USER_MISMATCH", "当前懒猫用户已切换，请重新登录", 401);
      return { user: { id: verified.payload.sub, account, name: verified.payload.name, role: verified.payload.role, loginMethod }, gatewayUserId, ownerId };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("SESSION_UNAUTHORIZED", "登录会话无效", 401);
    }
  }

  private async getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (this.jwks) return this.jwks;
    const issuer = this.config.issuerUri.toString().replace(/\/$/, "");
    const discoveryUrl = new URL(".well-known/openid-configuration", `${issuer}/`);
    const response = await fetch(discoveryUrl, { headers: { accept: "application/json" } });
    if (!response.ok) throw new DomainError("OIDC_DISCOVERY_FAILED", "无法读取登录服务配置", 503);
    const discovery = await response.json() as { issuer?: unknown; jwks_uri?: unknown };
    if (discovery.issuer !== issuer || typeof discovery.jwks_uri !== "string") throw new DomainError("OIDC_DISCOVERY_INVALID", "登录服务配置无效", 503);
    this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    return this.jwks;
  }

  private async fetchUserinfo(accessToken: string): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(this.config.userinfoUri, { headers: { accept: "application/json", authorization: `Bearer ${accessToken}` } });
      if (!response.ok) return {};
      const body = await response.json();
      return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}

export function resolveOidcAccount(...sources: Array<Record<string, unknown> | string | undefined>): string {
  for (const source of sources) {
    if (typeof source === "string") {
      const value = source.trim();
      if (value) return value.toLowerCase();
      continue;
    }
    if (!source) continue;
    const value = firstClaim(source, ["preferred_username", "username", "user_name", "account", "uid", "user_id", "email"]);
    if (value) return value.toLowerCase();
  }
  for (const source of sources) {
    if (typeof source === "string" || !source) continue;
    const subject = source.sub;
    if (typeof subject === "string" && subject.trim()) return subject.trim().toLowerCase();
  }
  throw new DomainError("OIDC_ACCOUNT_MISSING", "懒猫登录未返回账号信息", 401);
}

function firstClaim(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
