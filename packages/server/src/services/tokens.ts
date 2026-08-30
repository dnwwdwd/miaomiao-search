import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { accessTokens } from "../db/schema.js";
import { DomainError } from "../domain.js";

export type TokenScope = "all" | "search" | "fetch";
export type CreatedToken = { id: string; secret: string; prefix: string; expiresAt: string | null };
export type VerifiedToken = { id: string; prefix: string; scope: TokenScope };

export type TokenOwnerIndex = {
  register: (input: { tokenHash: string; tokenId: string; gatewayUserId: string; ownerId: string }) => void;
  remove: (tokenId: string) => void;
};

export class TokenService {
  private readonly pendingReservations = new Map<string, number[]>();
  constructor(private readonly database: AppDatabase, private readonly hmacKey: string, private readonly owner?: { gatewayUserId: string; ownerId: string }, private readonly ownerIndex?: TokenOwnerIndex) {}

  create(input: { name: string; scope?: TokenScope; rpmLimit?: number; dailyLimit?: number; expiresAt?: Date | null }): CreatedToken {
    if (!input.name.trim()) throw new DomainError("TOKEN_NAME_REQUIRED", "Token 名称不能为空");
    if (input.rpmLimit !== undefined && input.rpmLimit < 1) throw new DomainError("INVALID_RATE_LIMIT", "每分钟限额必须大于零");
    if (input.dailyLimit !== undefined && input.dailyLimit < 1) throw new DomainError("INVALID_DAILY_LIMIT", "每日限额必须大于零");
    const secret = `lcs_${randomBytes(32).toString("base64url")}`;
    const prefix = secret.slice(0, 12);
    const id = randomUUID();
    const expiresAt = input.expiresAt?.toISOString() ?? null;
    const now = new Date().toISOString();
    const tokenHash = this.hash(secret);
    this.database.orm.insert(accessTokens).values({
      id,
      name: input.name.trim(),
      prefix,
      hash: tokenHash,
      scope: input.scope ?? "all",
      rpmLimit: input.rpmLimit ?? null,
      dailyLimit: input.dailyLimit ?? null,
      expiresAt,
      lastUsedAt: null,
      status: "active",
      createdAt: now,
    }).run();
    if (this.owner && this.ownerIndex) this.ownerIndex.register({ tokenHash, tokenId: id, gatewayUserId: this.owner.gatewayUserId, ownerId: this.owner.ownerId });
    return { id, secret, prefix, expiresAt };
  }

  verify(secret: string, requiredScope: Exclude<TokenScope, "all">): VerifiedToken {
    const token = this.database.orm.select().from(accessTokens).where(eq(accessTokens.hash, this.hash(secret))).get();
    const verified = this.assertActive(token);
    if (verified.scope !== "all" && verified.scope !== requiredScope) throw new DomainError("TOKEN_SCOPE_DENIED", "Token 没有此操作权限", 403);
    this.assertWithinLimits(verified.id, token!.rpmLimit, token!.dailyLimit);
    this.database.orm.update(accessTokens).set({ lastUsedAt: new Date().toISOString() }).where(and(eq(accessTokens.id, verified.id), eq(accessTokens.status, "active"))).run();
    return verified;
  }

  authenticate(secret: string): VerifiedToken {
    return this.assertActive(this.database.orm.select().from(accessTokens).where(eq(accessTokens.hash, this.hash(secret))).get());
  }

  verifyTokenContext(token: VerifiedToken, requiredScope: Exclude<TokenScope, "all">, maximumRpm?: number): () => void {
    if (token.scope !== "all" && token.scope !== requiredScope) throw new DomainError("TOKEN_SCOPE_DENIED", "Token 没有此操作权限", 403);
    const row = this.database.orm.select().from(accessTokens).where(eq(accessTokens.id, token.id)).get();
    this.assertActive(row);
    const rpmLimit = row!.rpmLimit === null ? (maximumRpm ?? null) : maximumRpm === undefined ? row!.rpmLimit : Math.min(row!.rpmLimit, maximumRpm);
    this.assertWithinLimits(token.id, rpmLimit, row!.dailyLimit);
    const reservation = Date.now() + Math.random();
    const pending = this.pendingReservations.get(token.id) ?? [];
    pending.push(reservation);
    this.pendingReservations.set(token.id, pending);
    this.database.orm.update(accessTokens).set({ lastUsedAt: new Date().toISOString() }).where(and(eq(accessTokens.id, token.id), eq(accessTokens.status, "active"))).run();
    return () => {
      const remaining = (this.pendingReservations.get(token.id) ?? []).filter((time) => time !== reservation);
      if (remaining.length) this.pendingReservations.set(token.id, remaining); else this.pendingReservations.delete(token.id);
    };
  }

  setStatus(id: string, status: "active" | "disabled" | "revoked"): void {
    const result = this.database.orm.update(accessTokens).set({ status }).where(eq(accessTokens.id, id)).run();
    if (result.changes !== 1) throw new DomainError("TOKEN_NOT_FOUND", "Token 不存在", 404);
  }

  list(): Array<{ id: string; name: string; prefix: string; scope: TokenScope; rpmLimit: number | null; dailyLimit: number | null; expiresAt: string | null; lastUsedAt: string | null; status: "active" | "disabled" | "revoked"; createdAt: string; usageToday: number }> {
    const startOfDay = this.startOfUtcDay();
    const usageRows = this.database.sqlite.prepare("SELECT token_id, COUNT(*) AS count FROM request_log WHERE token_id IS NOT NULL AND created_at >= ? GROUP BY token_id").all(startOfDay) as Array<{ token_id: string; count: number }>;
    const usageByToken = new Map(usageRows.map((row) => [row.token_id, Number(row.count)]));
    return this.database.orm.select().from(accessTokens).all().map((token) => ({ ...token, scope: token.scope as TokenScope, status: token.status as "active" | "disabled" | "revoked", usageToday: usageByToken.get(token.id) ?? 0 }));
  }

  remove(id: string): void {
    const result = this.database.orm.delete(accessTokens).where(eq(accessTokens.id, id)).run();
    if (result.changes !== 1) throw new DomainError("TOKEN_NOT_FOUND", "Token 不存在", 404);
    this.ownerIndex?.remove(id);
  }

  private assertActive(token: typeof accessTokens.$inferSelect | undefined): VerifiedToken {
    if (!token || token.status !== "active") throw new DomainError("TOKEN_UNAUTHORIZED", "Token 无效", 401);
    if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) throw new DomainError("TOKEN_EXPIRED", "Token 已过期", 401);
    return { id: token.id, prefix: token.prefix, scope: token.scope as TokenScope };
  }

  private hash(secret: string): string {
    return createHmac("sha256", this.hmacKey).update(secret).digest("hex");
  }

  private assertWithinLimits(tokenId: string, rpmLimit: number | null, dailyLimit: number | null): void {
    const now = new Date();
    const pending = (this.pendingReservations.get(tokenId) ?? []).filter((time) => time > now.getTime() - 86_400_000);
    this.pendingReservations.set(tokenId, pending);
    if (rpmLimit !== null) {
      const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
      const row = this.database.sqlite.prepare("SELECT COUNT(*) AS count FROM request_log WHERE token_id = ? AND created_at >= ?").get(tokenId, minuteAgo) as { count: number };
      const pendingMinute = pending.filter((time) => time > now.getTime() - 60_000).length;
      if (row.count + pendingMinute >= rpmLimit) throw new DomainError("TOKEN_RATE_LIMITED", "Token 每分钟调用次数已达上限", 429);
    }
    if (dailyLimit !== null) {
      const startOfDay = this.startOfUtcDay(now);
      const row = this.database.sqlite.prepare("SELECT COUNT(*) AS count FROM request_log WHERE token_id = ? AND created_at >= ?").get(tokenId, startOfDay) as { count: number };
      if (row.count + pending.length >= dailyLimit) throw new DomainError("TOKEN_DAILY_LIMITED", "Token 当日调用次数已达上限", 429);
    }
  }

  private startOfUtcDay(date = new Date()): string {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
  }
}
