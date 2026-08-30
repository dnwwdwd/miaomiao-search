# REQ-20260825-008：默认搜索引擎初始启用范围

## 状态

已完成。用户确认默认可用引擎在新实例中自动启用；Exa 和需要 Proxy 的引擎保持关闭。

## 范围

- 新实例默认启用并设为默认：Bing、Baidu、CSDN、Juejin、Sogou。
- Exa 因需要 API Key 保持关闭；DuckDuckGo 因需要 Proxy 保持关闭。
- `search.defaultEngines` 与 `engine.enabled`、`engine.is_default` 使用同一组默认引擎。

## 写入与恢复

- 初始化入口为 `packages/server/src/services/bootstrap.ts`。
- 已存在旧版 `search.defaultEngines` 时，启动阶段执行一次默认范围迁移；迁移完成后保留用户后续对引擎开关和默认标记的修改。
- 不改变启用 Exa/API Key 或代理引擎/Proxy 的服务端前置校验。

## 验收

- 新数据库的启用且默认引擎为 `baidu`、`bing`、`csdn`、`juejin`、`sogou`。
- 旧版默认列表迁移后得到同一组引擎；重复启动不会覆盖用户手动调整。
- Exa 与 DuckDuckGo 默认关闭；相关 API 启用校验测试继续通过。
