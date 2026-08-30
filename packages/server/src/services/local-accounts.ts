import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { DomainError } from "../domain.js";
import { localAccounts } from "../db/schema.js";
import type { PortalUser } from "./oidc.js";

const defaultPassword = "12345678";
const minPasswordLength = 8;
const maxPasswordLength = 128;
const scryptN = 16_384;
const scryptR = 8;
const scryptP = 1;
const keyLength = 64;

export class LocalAccountService {
  constructor(private readonly database: AppDatabase) {}

  provisionFromOidc(user: PortalUser): PortalUser {
    return this.provisionFromOidcForGateway(user.id, user);
  }

  provisionFromOidcForGateway(gatewayUserId: string, user: PortalUser): PortalUser {
    const normalizedGatewayUserId = normalizeGatewayUserId(gatewayUserId);
    const normalizedUser = { ...user, account: normalizeAccount(user.account) };
    const now = new Date().toISOString();
    const existing = this.database.orm.select().from(localAccounts).where(eq(localAccounts.id, normalizedUser.id)).get();
    if (existing) {
      if (existing.gatewayUserId && existing.gatewayUserId !== normalizedGatewayUserId) {
        throw new DomainError("IDENTITY_BINDING_CONFLICT", "懒猫账号已绑定到其他身份", 409);
      }
      const accountCollision = this.database.orm.select({ id: localAccounts.id }).from(localAccounts).where(eq(localAccounts.account, normalizedUser.account)).get();
      if (accountCollision && accountCollision.id !== normalizedUser.id) throw new DomainError("LOCAL_ACCOUNT_CONFLICT", "懒猫账户无法建立本地登录，请联系管理员", 409);
      if (existing.account !== normalizedUser.account || existing.name !== normalizedUser.name || existing.role !== normalizedUser.role || existing.gatewayUserId !== normalizedGatewayUserId || existing.ownerId !== ownerIdForGateway(normalizedGatewayUserId)) {
        this.database.orm.update(localAccounts).set({ account: normalizedUser.account, name: normalizedUser.name, role: normalizedUser.role, gatewayUserId: normalizedGatewayUserId, ownerId: ownerIdForGateway(normalizedGatewayUserId), updatedAt: now }).where(eq(localAccounts.id, normalizedUser.id)).run();
      }
      return { id: normalizedUser.id, account: normalizedUser.account, name: normalizedUser.name, role: normalizedUser.role, loginMethod: "oidc" };
    }
    const gatewayCollision = this.database.orm.select({ id: localAccounts.id }).from(localAccounts).where(eq(localAccounts.gatewayUserId, normalizedGatewayUserId)).get();
    if (gatewayCollision) throw new DomainError("IDENTITY_BINDING_CONFLICT", "懒猫账号已绑定到其他 OIDC 身份", 409);
    const accountCollision = this.database.orm.select({ id: localAccounts.id }).from(localAccounts).where(eq(localAccounts.account, normalizedUser.account)).get();
    if (accountCollision) throw new DomainError("LOCAL_ACCOUNT_CONFLICT", "懒猫账户无法建立本地登录，请联系管理员", 409);
    this.database.orm.insert(localAccounts).values({ id: normalizedUser.id, gatewayUserId: normalizedGatewayUserId, ownerId: ownerIdForGateway(normalizedGatewayUserId), account: normalizedUser.account, name: normalizedUser.name, role: normalizedUser.role, passwordHash: hashPassword(defaultPassword), createdAt: now, updatedAt: now }).run();
    return normalizedUser;
  }

  authenticate(account: string, password: string): PortalUser {
    const normalizedAccount = normalizeAccount(account);
    const row = this.database.orm.select().from(localAccounts).where(eq(localAccounts.account, normalizedAccount)).get();
    if (!row || !verifyPassword(password, row.passwordHash)) throw new DomainError("LOCAL_LOGIN_INVALID", "账号或密码错误", 401);
    return { id: row.id, account: row.account, name: row.name, role: row.role, loginMethod: "local" };
  }

  authenticateForGateway(gatewayUserId: string, account: string, password: string): PortalUser {
    const normalizedGatewayUserId = normalizeGatewayUserId(gatewayUserId);
    const normalizedAccount = normalizeAccount(account);
    const row = this.database.orm.select().from(localAccounts).where(and(eq(localAccounts.account, normalizedAccount), eq(localAccounts.gatewayUserId, normalizedGatewayUserId))).get();
    if (!row || !verifyPassword(password, row.passwordHash)) throw new DomainError("LOCAL_LOGIN_INVALID", "账号或密码错误", 401);
    return { id: row.id, account: row.account, name: row.name, role: row.role, loginMethod: "local" };
  }

  getBinding(userId: string, gatewayUserId?: string): { gatewayUserId: string; ownerId: string } {
    const row = this.database.orm.select({ gatewayUserId: localAccounts.gatewayUserId, ownerId: localAccounts.ownerId }).from(localAccounts).where(eq(localAccounts.id, userId)).get();
    if (!row?.gatewayUserId || !row.ownerId) throw new DomainError("IDENTITY_NOT_FOUND", "登录身份不存在", 401);
    const normalizedGatewayUserId = normalizeGatewayUserId(gatewayUserId ?? row.gatewayUserId);
    if (normalizedGatewayUserId !== row.gatewayUserId) throw new DomainError("GATEWAY_USER_MISMATCH", "当前懒猫用户已切换，请重新登录", 401);
    return { gatewayUserId: row.gatewayUserId, ownerId: row.ownerId };
  }

  changePassword(user: PortalUser, currentPassword: string | undefined, newPassword: string): void {
    validatePassword(newPassword);
    const row = this.database.orm.select().from(localAccounts).where(eq(localAccounts.id, user.id)).get();
    if (!row) throw new DomainError("LOCAL_ACCOUNT_NOT_PROVISIONED", "请先使用懒猫 OIDC 登录一次", 409);
    if (user.loginMethod === "local" && (!currentPassword || !verifyPassword(currentPassword, row.passwordHash))) {
      throw new DomainError("CURRENT_PASSWORD_INVALID", "当前密码错误", 400);
    }
    this.database.orm.update(localAccounts).set({ passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() }).where(eq(localAccounts.id, user.id)).run();
  }
}

export function normalizeGatewayUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new DomainError("GATEWAY_USER_INVALID", "懒猫用户身份无效", 401);
  return normalized;
}

export function ownerIdForGateway(gatewayUserId: string): string {
  return createHash("sha256").update(normalizeGatewayUserId(gatewayUserId)).digest("hex");
}

export function normalizeAccount(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePassword(password: string): void {
  if (password.length < minPasswordLength || password.length > maxPasswordLength) throw new DomainError("PASSWORD_INVALID", `密码长度必须为 ${minPasswordLength}-${maxPasswordLength} 位`, 400);
}

function hashPassword(password: string): string {
  validatePassword(password);
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, keyLength, { N: scryptN, r: scryptR, p: scryptP, maxmem: 32 * 1024 * 1024 });
  return `scrypt$${scryptN}$${scryptR}$${scryptP}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [algorithm, n, r, p, saltValue, digestValue] = encoded.split("$");
    if (algorithm !== "scrypt" || !n || !r || !p || !saltValue || !digestValue) return false;
    const expected = Buffer.from(digestValue, "base64url");
    const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 32 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
