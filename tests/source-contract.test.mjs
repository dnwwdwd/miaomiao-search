import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("门户入口引用 Next.js JSX 页面", async () => {
  const [entry, portal] = await Promise.all([
    read("app/page.tsx"),
    read("src/components/portal/portal-app.tsx"),
  ]);
  assert.match(entry, /PortalApp/);
  for (const component of ["SearchPage", "McpPage", "EnginesPage", "UsagePage", "SettingsPage", "LoginScreen"]) assert.match(portal, new RegExp(component));
});

test("基础组件与 mock 数据覆盖门户范围", async () => {
  const [mockData, uiFiles] = await Promise.all([
    read("src/lib/mock-data.ts"),
    Promise.all(["button", "input", "search-input", "tag", "tabs", "switch", "select", "dropdown", "radio", "modal", "toast"].map((name) => read(`src/components/ui/${name}.tsx`))),
  ]);
  for (const exportName of ["initialEngines", "initialResults", "initialHistory", "initialTokens", "initialUsageLogs", "initialSettings"]) assert.match(mockData, new RegExp(`export const ${exportName}`));
  assert.equal(uiFiles.length, 11);
});

test("Next.js 门户没有 Playwright 控件或运行时依赖", async () => {
  const files = await Promise.all([
    read("app/page.tsx"),
    read("src/components/portal/pages/search-page.tsx"),
    read("src/components/portal/pages/settings-page.tsx"),
  ]);
  assert.doesNotMatch(files.join("\n"), /playwright/i);
});

test("跨页面 mock 设置和运行指标具有明确写入路径", async () => {
  const [search, mcp, engines, context] = await Promise.all([
    read("src/components/portal/pages/search-page.tsx"),
    read("src/components/portal/pages/mcp-page.tsx"),
    read("src/components/portal/pages/engines-page.tsx"),
    read("src/components/portal/portal-context.tsx"),
  ]);
  assert.match(search, /homeRequestLimit/);
  assert.match(mcp, /rpmLimit/);
  assert.match(mcp, /dailyLimit/);
  assert.match(engines, /setUsageLogs/);
  assert.match(context, /document\.documentElement\.lang/);
});

test("中英文切换覆盖登录与五个管理页面", async () => {
  const files = await Promise.all([
    read("src/components/portal/portal-app.tsx"),
    ...["search-page", "mcp-page", "engines-page", "usage-page", "settings-page"].map((name) => read(`src/components/portal/pages/${name}.tsx`)),
  ]);
  const source = files.join("\n");
  for (const label of ["Continue with Lazycat", "Multi-engine Web Search", "MCP service management", "Search engine management", "Usage statistics and audit logs", "System settings"]) assert.match(source, new RegExp(label));
  assert.match(source, /locale === "en"/);
});

test("门户认证只通过用户触发的 OIDC 路由，不保留本地密码登录", async () => {
  const [portal, routes] = await Promise.all([
    read("src/components/portal/portal-app.tsx"),
    read("packages/server/src/routes.ts"),
  ]);
  assert.match(portal, /\/api\/auth\/oidc\/start/);
  assert.match(routes, /\/api\/auth\/oidc\/callback/);
  assert.doesNotMatch(routes, /\/api\/auth\/login/);
});

test("Open-WebSearch patches guard current upstream failure boundaries", async () => {
  const patch = await read("patches/open-websearch@2.1.11.patch");
  assert.match(patch, /anubis_version/);
  assert.match(patch, /EXA_SEARCH_API_URL/);
  assert.match(patch, /throw new Error\(message\)/);
});

test("MCP search exposes identical nested JSON and structured content", async () => {
  const mcp = await read("packages/server/src/mcp.ts");
  assert.match(mcp, /JSON\.stringify\(result\)/);
  assert.match(mcp, /structuredContent: result/);
});

test("Usage page uses range-first server statistics and pagination", async () => {
  const [page, api, route] = await Promise.all([
    read("src/components/portal/pages/usage-page.tsx"),
    read("src/lib/api.ts"),
    read("packages/server/src/routes.ts"),
  ]);
  assert.match(page, /RangePreset/);
  assert.match(page, /最近 7 天/);
  assert.match(page, /自定义/);
  assert.match(page, /pagination\.totalPages/);
  assert.doesNotMatch(page, /Top 100/);
  assert.match(api, /timeZone/);
  assert.match(api, /pageSize/);
  assert.match(route, /usageQuerySchema/);
  assert.match(route, /dependencies\.audit\.usage/);
});
