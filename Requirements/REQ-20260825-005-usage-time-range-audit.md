# REQ-20260825-005 调用统计与审计日志增强

## 目标

将 Usage 页面从“最近 100 条样本与最近 8 小时”改为基于选定时间范围的完整统计，并让 Web 与 MCP 请求在同一套审计查询中可区分、可分页。

## 范围与口径

- 默认范围为当前时刻向前 7 天，范围为左闭右开 `[from, to)`。
- 支持最近 24 小时、7 天、30 天、90 天和自定义起止时间；查询最长 365 天。
- 默认包含 Web 与 MCP 的所有 Operation，筛选器支持 Channel、Operation、状态和引擎组合。
- `success`、`partial`、`error` 使用 `request_log.status` 原值汇总；成功率按 `success / total`，缓存命中率按 `cache_hits / total`。
- 最近 24 小时趋势按用户时区按小时分桶，其余范围按用户时区按日分桶。

## 数据写入、读取与状态传播

| 项目 | 约定 |
|---|---|
| 写入入口 | Web 搜索、Web 正文读取、MCP `search` 和 MCP `fetchWebContent` 继续由 `SearchService` 写入 `request_log`；MCP 分别使用 `channel=mcp` 与对应 Operation。 |
| 读取入口 | 管理员通过 `GET /api/usage` 读取选定范围的聚合指标、分布、趋势、引擎统计、分页日志和筛选项。 |
| 前端状态 | 范围或任一筛选变化时重新请求服务端并回到第 1 页；页面不再从日志样本客户端计算 KPI。 |
| 持久化 | 复用 `request_log` 及现有 `created_at`、`channel,created_at` 索引，不新增表。 |
| 失败边界 | `from >= to`、日期格式非法、超过 365 天或非法时区返回可识别的 400 错误；空范围返回零值指标与空日志，而不是错误。 |
| 安全边界 | 继续使用管理员鉴权；日志查询不返回 Token Secret、查询正文或密钥；引擎筛选通过 JSON 引擎数组匹配。 |

## 接口验收矩阵

| 场景 | 验收 |
|---|---|
| 范围汇总 | 总量、状态、Channel、Operation、引擎、缓存、延迟和结果数均只统计 `[from,to)` 内记录。 |
| 分页筛选 | `channel`、`operation`、`status`、`engine` 可组合，`page/pageSize` 返回稳定分页与总记录数。 |
| 时区趋势 | `timeZone` 改变后日/小时桶按该时区边界生成，24 小时范围使用小时桶。 |
| MCP 纳入 | MCP 搜索和正文读取出现在对应 Channel/Operation，并参与所有汇总。 |
| 页面状态 | 默认 7 天、切换预设、自定义日期、空数据、只有 MCP、只有错误、英文切换均可见且不出现 Top 100 误导文案。 |

