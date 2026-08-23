import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client.js";
import type { Channel, EngineId } from "../domain.js";
import { requestLogs, searchHistory } from "../db/schema.js";

export class AuditService {
  constructor(private readonly database: AppDatabase) {}

  record(input: { channel: Channel; operation: string; tokenId?: string; tokenPrefix?: string; query?: string; engines?: EngineId[]; latencyMs: number; cacheHit: boolean; resultCount?: number; status: "success" | "partial" | "error"; errorCode?: string }): string {
    const id = randomUUID();
    this.database.orm.insert(requestLogs).values({
      id,
      channel: input.channel,
      operation: input.operation,
      tokenId: input.tokenId ?? null,
      tokenPrefix: input.tokenPrefix ?? null,
      query: input.query ?? null,
      engines: input.engines ? JSON.stringify(input.engines) : null,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      cacheHit: input.cacheHit,
      resultCount: input.resultCount ?? null,
      status: input.status,
      errorCode: input.errorCode ?? null,
      createdAt: new Date().toISOString(),
    }).run();
    return id;
  }

  saveHistory(query: string, engines: EngineId[], resultCount: number): void {
    this.database.orm.insert(searchHistory).values({ query, engines: JSON.stringify(engines), resultCount, createdAt: new Date().toISOString() }).run();
  }

  listLogs(limit = 100): Array<{ id: string; channel: Channel; operation: string; tokenPrefix: string | null; engines: EngineId[]; latencyMs: number; cacheHit: boolean; resultCount: number | null; status: "success" | "partial" | "error"; errorCode: string | null; createdAt: string }> {
    const rows = this.database.sqlite.prepare("SELECT id, channel, operation, token_prefix, engines, latency_ms, cache_hit, result_count, status, error_code, created_at FROM request_log ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), channel: row.channel as Channel, operation: String(row.operation), tokenPrefix: row.token_prefix as string | null,
      engines: row.engines ? JSON.parse(String(row.engines)) as EngineId[] : [], latencyMs: Number(row.latency_ms), cacheHit: Boolean(row.cache_hit), resultCount: row.result_count === null ? null : Number(row.result_count), status: row.status as "success" | "partial" | "error", errorCode: row.error_code as string | null, createdAt: String(row.created_at),
    }));
  }

  listHistory(limit = 100): Array<{ id: number; query: string; engines: EngineId[]; resultCount: number; createdAt: string }> {
    const rows = this.database.sqlite.prepare("SELECT id, query, engines, result_count, created_at FROM search_history ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: Number(row.id), query: String(row.query), engines: JSON.parse(String(row.engines)) as EngineId[], resultCount: Number(row.result_count), createdAt: String(row.created_at) }));
  }

  clearHistory(): void { this.database.sqlite.prepare("DELETE FROM search_history").run(); }

  overview(): { total: number; mcpToday: number; webToday: number; successful: number } {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString();
    const row = this.database.sqlite.prepare("SELECT COUNT(*) total, SUM(CASE WHEN channel = 'mcp' AND created_at >= ? THEN 1 ELSE 0 END) mcpToday, SUM(CASE WHEN channel = 'web' AND created_at >= ? THEN 1 ELSE 0 END) webToday, SUM(CASE WHEN status IN ('success', 'partial') THEN 1 ELSE 0 END) successful FROM request_log").get(start, start) as Record<string, unknown>;
    return { total: Number(row.total ?? 0), mcpToday: Number(row.mcpToday ?? 0), webToday: Number(row.webToday ?? 0), successful: Number(row.successful ?? 0) };
  }
}
