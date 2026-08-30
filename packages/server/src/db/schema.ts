import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const localAccounts = sqliteTable("local_account", {
  id: text("id").primaryKey(),
  gatewayUserId: text("gateway_user_id").notNull(),
  ownerId: text("owner_id").notNull(),
  account: text("account").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["ADMIN", "NORMAL"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("local_account_account_idx").on(table.account)]);

export const tokenOwners = sqliteTable("token_owner", {
  tokenHash: text("token_hash").primaryKey(),
  tokenId: text("token_id").notNull().unique(),
  gatewayUserId: text("gateway_user_id").notNull(),
  ownerId: text("owner_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("token_owner_token_id_idx").on(table.tokenId),
  index("token_owner_owner_id_idx").on(table.ownerId),
]);

export const accessTokens = sqliteTable("access_token", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hash: text("hash").notNull().unique(),
  scope: text("scope", { enum: ["all", "search", "fetch"] }).notNull(),
  rpmLimit: integer("rpm_limit"),
  dailyLimit: integer("daily_limit"),
  expiresAt: text("expires_at"),
  lastUsedAt: text("last_used_at"),
  status: text("status", { enum: ["active", "disabled", "revoked"] }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("access_token_hash_idx").on(table.hash)]);

export const engines = sqliteTable("engine", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  searchMode: text("search_mode", { enum: ["auto", "request"] }),
  resultLimit: integer("result_limit"),
  lastTestAt: text("last_test_at"),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
});

export const searchHistory = sqliteTable("search_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  query: text("query").notNull(),
  engines: text("engines").notNull(),
  resultCount: integer("result_count").notNull(),
  resultSnapshot: text("result_snapshot"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("search_history_created_at_idx").on(table.createdAt)]);

export const requestLogs = sqliteTable("request_log", {
  id: text("id").primaryKey(),
  channel: text("channel", { enum: ["web", "mcp"] }).notNull(),
  operation: text("operation").notNull(),
  tokenId: text("token_id"),
  tokenPrefix: text("token_prefix"),
  query: text("query"),
  engines: text("engines"),
  latencyMs: integer("latency_ms").notNull(),
  cacheHit: integer("cache_hit", { mode: "boolean" }).notNull(),
  resultCount: integer("result_count"),
  status: text("status", { enum: ["success", "partial", "error"] }).notNull(),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("request_log_created_at_idx").on(table.createdAt),
  index("request_log_channel_created_at_idx").on(table.channel, table.createdAt),
  index("request_log_token_created_at_idx").on(table.tokenId, table.createdAt),
]);

export const settings = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: integer("encrypted", { mode: "boolean" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});
