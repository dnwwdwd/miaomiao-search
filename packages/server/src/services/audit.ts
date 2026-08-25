import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client.js";
import { DomainError, engineIds, type Channel, type EngineId, type EngineSearchResultGroup, type SearchFailure, type SearchResult } from "../domain.js";
import { requestLogs, searchHistory } from "../db/schema.js";

export type SearchHistorySnapshot = { results: SearchResult[]; failures: SearchFailure[]; engineResults?: EngineSearchResultGroup[] };

export type UsageQueryInput = {
  from?: string;
  to?: string;
  channel?: "all" | Channel;
  operation?: string;
  status?: "all" | "success" | "partial" | "error";
  engine?: EngineId;
  page?: number;
  pageSize?: number;
  timeZone?: string;
};

export type UsageResponse = {
  range: { from: string; to: string; timeZone: string; bucket: "hour" | "day" };
  summary: { total: number; success: number; partial: number; errors: number; cacheHits: number; avgLatencyMs: number; p95LatencyMs: number; avgResultCount: number };
  channels: { web: number; mcp: number };
  series: Array<{ bucket: string; total: number; web: number; mcp: number; success: number; partial: number; errors: number; cacheHits: number; avgLatencyMs: number; avgResultCount: number }>;
  operations: Array<{ name: string; count: number; avgLatencyMs: number }>;
  engines: Array<{ engine: EngineId; calls: number; success: number; cacheHits: number; avgLatencyMs: number; avgResultCount: number }>;
  facets: { operations: string[]; engines: EngineId[] };
  logs: Array<{ id: string; channel: Channel; operation: string; tokenPrefix: string | null; engines: EngineId[]; latencyMs: number; cacheHit: boolean; resultCount: number | null; status: "success" | "partial" | "error"; errorCode: string | null; createdAt: string }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

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

  saveHistory(query: string, engines: EngineId[], resultCount: number, snapshot?: SearchHistorySnapshot): void {
    this.database.orm.insert(searchHistory).values({ query, engines: JSON.stringify(engines), resultCount, resultSnapshot: snapshot ? JSON.stringify(snapshot) : null, createdAt: new Date().toISOString() }).run();
  }

  listLogs(limit = 100): Array<{ id: string; channel: Channel; operation: string; tokenPrefix: string | null; engines: EngineId[]; latencyMs: number; cacheHit: boolean; resultCount: number | null; status: "success" | "partial" | "error"; errorCode: string | null; createdAt: string }> {
    const rows = this.database.sqlite.prepare("SELECT id, channel, operation, token_prefix, engines, latency_ms, cache_hit, result_count, status, error_code, created_at FROM request_log ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), channel: row.channel as Channel, operation: String(row.operation), tokenPrefix: row.token_prefix as string | null,
      engines: parseEngineList(row.engines ? JSON.parse(String(row.engines)) : []), latencyMs: Number(row.latency_ms), cacheHit: Boolean(row.cache_hit), resultCount: row.result_count === null ? null : Number(row.result_count), status: row.status as "success" | "partial" | "error", errorCode: row.error_code as string | null, createdAt: String(row.created_at),
    }));
  }

  listHistory(limit = 100): Array<{ id: number; query: string; engines: EngineId[]; resultCount: number; snapshot: SearchHistorySnapshot | null; createdAt: string }> {
    const rows = this.database.sqlite.prepare("SELECT id, query, engines, result_count, result_snapshot, created_at FROM search_history ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: Number(row.id), query: String(row.query), engines: parseEngineList(JSON.parse(String(row.engines))), resultCount: Number(row.result_count), snapshot: parseSnapshot(row.result_snapshot), createdAt: String(row.created_at) }));
  }

  pruneHistory(retentionDays: number): void {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
    const cutoff = new Date(Date.now() - Math.floor(retentionDays) * 24 * 60 * 60 * 1_000).toISOString();
    this.database.sqlite.prepare("DELETE FROM search_history WHERE created_at < ?").run(cutoff);
  }

  clearHistory(): void { this.database.sqlite.prepare("DELETE FROM search_history").run(); }

  usage(input: UsageQueryInput = {}): UsageResponse {
    const query = normalizeUsageQuery(input);
    const where = buildUsageWhere(query);
    const whereSql = where.clauses.join(" AND ");
    const totalRow = this.database.sqlite.prepare(`SELECT COUNT(*) total FROM request_log WHERE ${whereSql}`).get(...where.params) as Record<string, unknown>;
    const total = Number(totalRow.total ?? 0);
    const summaryRow = this.database.sqlite.prepare(`SELECT
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) success,
      SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) partial,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) errors,
      SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) cacheHits,
      AVG(latency_ms) avgLatencyMs,
      AVG(result_count) avgResultCount
      FROM request_log WHERE ${whereSql}`).get(...where.params) as Record<string, unknown>;
    const p95Row = total > 0
      ? this.database.sqlite.prepare(`SELECT latency_ms FROM request_log WHERE ${whereSql} ORDER BY latency_ms LIMIT 1 OFFSET ?`).get(...where.params, Math.max(0, Math.ceil(total * 0.95) - 1)) as Record<string, unknown>
      : undefined;
    const success = Number(summaryRow.success ?? 0);
    const partial = Number(summaryRow.partial ?? 0);
    const errors = Number(summaryRow.errors ?? 0);
    const channelRows = this.database.sqlite.prepare(`SELECT channel, COUNT(*) count FROM request_log WHERE ${whereSql} GROUP BY channel`).all(...where.params) as Array<Record<string, unknown>>;
    const channels = { web: 0, mcp: 0 };
    for (const row of channelRows) if (row.channel === "web" || row.channel === "mcp") channels[row.channel] = Number(row.count ?? 0);

    const operationRows = this.database.sqlite.prepare(`SELECT operation, COUNT(*) count, AVG(latency_ms) avgLatencyMs FROM request_log WHERE ${whereSql} GROUP BY operation ORDER BY count DESC, operation ASC`).all(...where.params) as Array<Record<string, unknown>>;
    const operations = operationRows.map((row) => ({ name: String(row.operation), count: Number(row.count ?? 0), avgLatencyMs: roundNumber(row.avgLatencyMs) }));
    const engineRows = this.database.sqlite.prepare(`SELECT selected_engine.value engine, COUNT(*) calls,
      SUM(CASE WHEN request_log.status IN ('success', 'partial') THEN 1 ELSE 0 END) success,
      SUM(CASE WHEN request_log.cache_hit = 1 THEN 1 ELSE 0 END) cacheHits,
      AVG(request_log.latency_ms) avgLatencyMs,
      AVG(request_log.result_count) avgResultCount
      FROM request_log JOIN json_each(COALESCE(request_log.engines, '[]')) selected_engine
      WHERE ${whereSql}
      GROUP BY selected_engine.value ORDER BY calls DESC, engine ASC`).all(...where.params) as Array<Record<string, unknown>>;
    const engines = engineRows.filter((row) => isEngineId(row.engine)).map((row) => ({ engine: row.engine as EngineId, calls: Number(row.calls ?? 0), success: Number(row.success ?? 0), cacheHits: Number(row.cacheHits ?? 0), avgLatencyMs: roundNumber(row.avgLatencyMs), avgResultCount: roundDecimal(row.avgResultCount) }));

    const seriesRows = this.database.sqlite.prepare(`SELECT channel, status, cache_hit, latency_ms, result_count, created_at FROM request_log WHERE ${whereSql} ORDER BY created_at ASC`).all(...where.params) as Array<Record<string, unknown>>;
    const seriesMap = new Map<string, { bucket: string; total: number; web: number; mcp: number; success: number; partial: number; errors: number; cacheHits: number; latencyTotal: number; resultTotal: number; resultCount: number }>();
    for (const row of seriesRows) {
      const bucket = formatBucket(String(row.created_at), query.timeZone, query.bucket);
      const point = seriesMap.get(bucket) ?? { bucket, total: 0, web: 0, mcp: 0, success: 0, partial: 0, errors: 0, cacheHits: 0, latencyTotal: 0, resultTotal: 0, resultCount: 0 };
      point.total += 1;
      if (row.channel === "web" || row.channel === "mcp") point[row.channel] += 1;
      if (row.status === "success" || row.status === "partial" || row.status === "error") point[row.status === "error" ? "errors" : row.status] += 1;
      if (row.cache_hit) point.cacheHits += 1;
      point.latencyTotal += Number(row.latency_ms ?? 0);
      if (row.result_count !== null && row.result_count !== undefined) { point.resultTotal += Number(row.result_count); point.resultCount += 1; }
      seriesMap.set(bucket, point);
    }
    const series = [...seriesMap.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)).map((point) => ({ bucket: point.bucket, total: point.total, web: point.web, mcp: point.mcp, success: point.success, partial: point.partial, errors: point.errors, cacheHits: point.cacheHits, avgLatencyMs: point.total ? Math.round(point.latencyTotal / point.total) : 0, avgResultCount: point.resultCount ? roundDecimal(point.resultTotal / point.resultCount) : 0 }));

    const facetWhere = buildUsageWhere({ ...query, channel: "all", operation: null, status: "all", engine: null });
    const facetWhereSql = facetWhere.clauses.join(" AND ");
    const operationFacets = this.database.sqlite.prepare(`SELECT DISTINCT operation FROM request_log WHERE ${facetWhereSql} ORDER BY operation ASC`).all(...facetWhere.params) as Array<Record<string, unknown>>;
    const engineFacets = this.database.sqlite.prepare(`SELECT DISTINCT selected_engine.value engine FROM request_log JOIN json_each(COALESCE(request_log.engines, '[]')) selected_engine WHERE ${facetWhereSql} ORDER BY engine ASC`).all(...facetWhere.params) as Array<Record<string, unknown>>;
    const offset = (query.page - 1) * query.pageSize;
    const logRows = this.database.sqlite.prepare(`SELECT id, channel, operation, token_prefix, engines, latency_ms, cache_hit, result_count, status, error_code, created_at FROM request_log WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...where.params, query.pageSize, offset) as Array<Record<string, unknown>>;

    return {
      range: { from: query.from, to: query.to, timeZone: query.timeZone, bucket: query.bucket },
      summary: { total, success, partial, errors, cacheHits: Number(summaryRow.cacheHits ?? 0), avgLatencyMs: roundNumber(summaryRow.avgLatencyMs), p95LatencyMs: Number(p95Row?.latency_ms ?? 0), avgResultCount: roundDecimal(summaryRow.avgResultCount) },
      channels,
      series,
      operations,
      engines,
      facets: { operations: operationFacets.map((row) => String(row.operation)), engines: engineFacets.filter((row) => isEngineId(row.engine)).map((row) => row.engine as EngineId) },
      logs: logRows.map(toAuditLog),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  overview(): { total: number; mcpToday: number; webToday: number; successful: number } {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString();
    const row = this.database.sqlite.prepare("SELECT COUNT(*) total, SUM(CASE WHEN channel = 'mcp' AND created_at >= ? THEN 1 ELSE 0 END) mcpToday, SUM(CASE WHEN channel = 'web' AND created_at >= ? THEN 1 ELSE 0 END) webToday, SUM(CASE WHEN status IN ('success', 'partial') THEN 1 ELSE 0 END) successful FROM request_log").get(start, start) as Record<string, unknown>;
    return { total: Number(row.total ?? 0), mcpToday: Number(row.mcpToday ?? 0), webToday: Number(row.webToday ?? 0), successful: Number(row.successful ?? 0) };
  }
}

type NormalizedUsageQuery = Required<Omit<UsageQueryInput, "operation" | "engine">> & { operation: string | null; engine: EngineId | null; bucket: "hour" | "day" };
type SqlParam = string | number;

function normalizeUsageQuery(input: UsageQueryInput): NormalizedUsageQuery {
  const toDate = input.to ? new Date(input.to) : new Date();
  const fromDate = input.from ? new Date(input.from) : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1_000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) throw new DomainError("USAGE_RANGE_INVALID", "统计时间范围无效");
  if (toDate.getTime() - fromDate.getTime() > 365 * 24 * 60 * 60 * 1_000) throw new DomainError("USAGE_RANGE_TOO_LARGE", "统计时间范围不能超过 365 天");
  const timeZone = input.timeZone ?? "Asia/Shanghai";
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); } catch { throw new DomainError("USAGE_TIMEZONE_INVALID", "统计时区无效"); }
  const channel = input.channel ?? "all";
  const status = input.status ?? "all";
  const engine = input.engine ?? null;
  if (engine && !isEngineId(engine)) throw new DomainError("USAGE_ENGINE_INVALID", "统计引擎无效");
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 20)));
  return { from: fromDate.toISOString(), to: toDate.toISOString(), channel, operation: input.operation && input.operation !== "all" ? input.operation : null, status, engine, page, pageSize, timeZone, bucket: toDate.getTime() - fromDate.getTime() <= 24 * 60 * 60 * 1_000 ? "hour" : "day" };
}

function buildUsageWhere(query: NormalizedUsageQuery): { clauses: string[]; params: SqlParam[] } {
  const clauses = ["request_log.created_at >= ?", "request_log.created_at < ?"];
  const params: SqlParam[] = [query.from, query.to];
  if (query.channel !== "all") { clauses.push("request_log.channel = ?"); params.push(query.channel); }
  if (query.operation) { clauses.push("request_log.operation = ?"); params.push(query.operation); }
  if (query.status !== "all") { clauses.push("request_log.status = ?"); params.push(query.status); }
  if (query.engine) { clauses.push("EXISTS (SELECT 1 FROM json_each(COALESCE(request_log.engines, '[]')) AS filter_engine WHERE filter_engine.value = ?)"); params.push(query.engine); }
  return { clauses, params };
}

function toAuditLog(row: Record<string, unknown>) {
  return { id: String(row.id), channel: row.channel as Channel, operation: String(row.operation), tokenPrefix: row.token_prefix as string | null, engines: parseEngineList(row.engines), latencyMs: Number(row.latency_ms), cacheHit: Boolean(row.cache_hit), resultCount: row.result_count === null ? null : Number(row.result_count), status: row.status as "success" | "partial" | "error", errorCode: row.error_code as string | null, createdAt: String(row.created_at) };
}

function roundNumber(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0; }
function roundDecimal(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : 0; }

function formatBucket(value: string, timeZone: string, bucket: "hour" | "day"): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", ...(bucket === "hour" ? { hour: "2-digit", hourCycle: "h23" as const } : {}) }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return bucket === "hour" ? `${day}T${get("hour")}:00` : day;
}

function parseSnapshot(value: unknown): SearchHistorySnapshot | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SearchHistorySnapshot>;
    if (!Array.isArray(parsed.results) || !Array.isArray(parsed.failures)) return null;
    const results = (parsed.results as SearchResult[]).map((result) => ({ ...result, engines: parseEngineList(result.engines) }));
    const failures = (parsed.failures as SearchFailure[]).filter((failure) => isEngineId(failure.engine));
    const engineResults = Array.isArray(parsed.engineResults)
      ? (parsed.engineResults as EngineSearchResultGroup[]).filter((group) => isEngineId(group.engine)).map((group) => ({
        ...group,
        results: group.results.map((result) => ({ ...result, engines: parseEngineList(result.engines) })),
        failure: group.failure && isEngineId(group.failure.engine) ? group.failure : undefined,
      }))
      : undefined;
    return { results, failures, engineResults };
  } catch {
    return null;
  }
}

function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && engineIds.includes(value as EngineId);
}

function parseEngineList(value: unknown): EngineId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isEngineId))];
}
