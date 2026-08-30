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

test("MCP Token 表单支持无限制、手动限额和一键复制", async () => {
  const [page, api] = await Promise.all([read("src/components/portal/pages/mcp-page.tsx"), read("src/lib/api.ts")]);
  assert.match(page, /rpmUnlimited/);
  assert.match(page, /dailyUnlimited/);
  assert.match(page, /无限制/);
  assert.match(page, /手动输入数值/);
  assert.match(page, /复制 Access Token/);
  assert.match(page, /rpmLimit: rpm/);
  assert.match(page, /dailyLimit: daily/);
  assert.match(api, /rpmLimit: typeof item\.rpmLimit === "number" \? item\.rpmLimit : null/);
  assert.match(api, /dailyLimit: typeof item\.dailyLimit === "number" \? item\.dailyLimit : null/);
});

test("MCP Token 名称默认为空且 Secret 与复制按钮同行", async () => {
  const page = await read("src/components/portal/pages/mcp-page.tsx");
  assert.match(page, /const \[name, setName\] = useState\(""\)/);
  assert.match(page, /onClick=\{openCreate\}/);
  assert.match(page, /flex items-center gap-2 rounded-2xl bg-slate-900/);
  assert.match(page, /复制 Access Token/);
});

test("DuckDuckGo 只提示 TUN/VPN 代理而不要求代理 URL", async () => {
  const [route, engines, settings, packageFile] = await Promise.all([
    read("packages/server/src/routes.ts"),
    read("src/components/portal/pages/engines-page.tsx"),
    read("src/components/portal/pages/settings-page.tsx"),
    read("package.yml"),
  ]);
  assert.doesNotMatch(route, /ENGINE_PROXY_REQUIRED/);
  assert.match(engines, /请确认系统代理已开启/);
  assert.doesNotMatch(engines, /无需填写代理地址/);
  assert.doesNotMatch(engines, /requires the proxy switch to be enabled first/);
  assert.doesNotMatch(settings, /Network access|网络访问|Enable proxy|开启代理/);
  assert.match(packageFile, /name: 喵喵搜索/);
});

test("登录页使用无彩色边框的高保真布局", async () => {
  const portal = await read("src/components/portal/portal-app.tsx");
  assert.match(portal, /login-screen/);
  assert.match(portal, /login-panel/);
  assert.doesNotMatch(portal, /login-panel[^\n]*border-/);
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

test("门户认证支持用户触发的 OIDC 与本地账号密码登录", async () => {
  const [portal, loginEntry, routes, api, settings] = await Promise.all([
    read("src/components/portal/portal-app.tsx"),
    read("app/login/page.tsx"),
    read("packages/server/src/routes.ts"),
    read("src/lib/api.ts"),
    read("src/components/portal/pages/settings-page.tsx"),
  ]);
  assert.match(portal, /\/api\/auth\/oidc\/start/);
  assert.match(api, /\/api\/auth\/local\/login/);
  assert.match(settings, /loginMethod/);
  assert.match(routes, /\/api\/auth\/oidc\/callback/);
  assert.match(routes, /\/api\/auth\/local\/login/);
  assert.match(routes, /\/api\/auth\/password/);
  assert.match(routes, /reloginRequired: true/);
  assert.match(routes, /\/api\/auth\/logout/);
  assert.match(api, /logout: \(\) => request<\{ ok: true \}>\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(loginEntry, /<PortalApp loginOnly \/>/);
  assert.match(portal, /window\.location\.replace\(new URL\("\/login", window\.location\.origin\)/);
  assert.match(settings, /window\.location\.replace\(new URL\("\/login", window\.location\.origin\)/);
  assert.match(routes, /reply\.redirect\("\/login"\)/);
  assert.doesNotMatch(routes, /\/api\/auth\/login/);
});

test("引擎单独测试会把具体失败留在测试弹窗", async () => {
  const [page, api, search] = await Promise.all([
    read("src/components/portal/pages/engines-page.tsx"),
    read("src/lib/api.ts"),
    read("packages/server/src/services/search.ts"),
  ]);
  assert.match(page, /testError/);
  assert.match(page, /role="alert"/);
  assert.match(api, /failure\?: \{ code: string; message: string \}/);
  assert.match(search, /const singleFailure = engineResults\.length === 1/);
});

test("Open-WebSearch patches guard current upstream failure boundaries", async () => {
  const patch = await read("patches/open-websearch@2.1.11.patch");
  assert.match(patch, /anubis_version/);
  assert.match(patch, /EXA_SEARCH_API_URL/);
  assert.match(patch, /throw new Error\(message\)/);
  assert.match(patch, /BING_BASE_URL/);
  assert.ok(patch.includes("https://www.bing.com/search"));
  assert.match(patch, /fetchBaiduSearchPage/);
  assert.match(patch, /isBaiduHost/);
  assert.match(patch, /allowedRedirectHosts: \['www\.bing\.com', 'cn\.bing\.com'\]/);
  assert.match(patch, /cookieJar/);
  assert.match(patch, /disableProxy: true/);
  assert.match(patch, /extractStructuredTextFromHtml/);
  assert.match(patch, /extractionMethod/);
  assert.match(patch, /content_not_extracted/);
});

test("正文读取失败使用可恢复的状态契约", async () => {
  const [api, page, service] = await Promise.all([
    read("src/lib/api.ts"),
    read("src/components/portal/pages/search-page.tsx"),
    read("packages/server/src/services/search.ts"),
  ]);
  assert.match(api, /statusCode\?: number/);
  assert.match(page, /页面已访问，但未识别到可读正文/);
  assert.match(page, /重试/);
  assert.match(page, /打开源站查看/);
  assert.match(service, /multi-strategy-v3/);
});

test("正文阅读器和上游错误摘要保留可操作的前端状态", async () => {
  const [page, errors, engines] = await Promise.all([
    read("src/components/portal/pages/search-page.tsx"),
    read("src/components/portal/error-message.tsx"),
    read("src/components/portal/pages/engines-page.tsx"),
  ]);
  assert.match(page, /ReaderSkeleton/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /<EngineTag engine=\{reader\.sourceEngine\}/);
  assert.doesNotMatch(page, /Content-Type: \{reader\.contentType\}/);
  assert.doesNotMatch(page, /正在抓取并提取网页正文/);
  assert.match(page, /border-blue-300/);
  assert.match(page, /ErrorDisclosure/);
  assert.match(errors, /UPSTREAM_REDIRECT/);
  assert.match(errors, /UPSTREAM_INVALID_URL/);
  assert.match(errors, /engine_error/);
  assert.match(errors, /request failed with status code 30\\d/);
  assert.match(engines, /homeEngineOrder/);
  assert.match(engines, /mcpEngineOrder/);
  assert.match(engines, /draggable/);
  assert.match(engines, /<Tag tone=\{healthTone\[engine\.health\]\}>\{healthLabel\(engine\.health, english\)\}<\/Tag>/);
  assert.match(engines, /testSearch/);
  assert.match(engines, /openTest/);
});

test("MCP search exposes identical nested JSON and structured content", async () => {
  const mcp = await read("packages/server/src/mcp.ts");
  assert.match(mcp, /JSON\.stringify\(result\)/);
  assert.match(mcp, /structuredContent: result/);
});

test("LPK exports the MCP provider resource for Lazycat agents", async () => {
  const [build, packageFile, provider] = await Promise.all([
    read("lzc-build.yml"),
    read("package.yml"),
    read("resources/mcp-providers/miaomiao-search/mcp.yml"),
  ]);
  assert.match(build, /kind: mcp-providers/);
  assert.match(build, /source: \.\/resources\/mcp-providers/);
  assert.match(packageFile, /min_os_version: ["']?1\.5\.2["']?/);
  assert.doesNotMatch(packageFile, /import_resources:/);
  assert.match(provider, /^endpoint:\s*\/mcp\s*$/m);
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

test("Usage audit layout keeps its horizontal scroll at the card bottom", async () => {
  const page = await read("src/components/portal/pages/usage-page.tsx");
  assert.match(page, /audit-table-scroll table-scroll overflow-x-auto/);
  assert.match(page, /min-w-\[1100px\]/);
  assert.match(page, /grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4/);
  assert.match(page, /enginesTitle: "引擎统计"/);
  assert.match(page, /allChannels: "全部来源"/);
  assert.match(page, /requestId: "请求 ID"/);
});

test("Settings page no longer renders the default search parameters card", async () => {
  const page = await read("src/components/portal/pages/settings-page.tsx");
  assert.doesNotMatch(page, /默认搜索参数/);
  assert.doesNotMatch(page, /EngineDefaultButton/);
});

test("DuckDuckGo engine tags use the stable official icon asset", async () => {
  const catalog = await read("src/lib/engine-catalog.ts");
  assert.match(catalog, /\/engine-icons\/duckduckgo\.png/);
});

test("Bing advanced search mode is scoped to Bing selections", async () => {
  const page = await read("src/components/portal/pages/search-page.tsx");
  assert.match(page, /active\.includes\("bing"\)/);
});
