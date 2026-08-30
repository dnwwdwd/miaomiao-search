import assert from "node:assert/strict";
import test from "node:test";

type AxiosOptions = { method?: string; url?: string; headers?: Record<string, string>; httpAgent?: unknown; httpsAgent?: unknown };
type AxiosResponse = { status: number; headers: Record<string, unknown>; data: unknown; request?: { res?: { responseUrl?: string } } };
type AxiosRequestStub = (options: AxiosOptions) => Promise<AxiosResponse>;
const loadModule = (specifier: string) => import(specifier) as Promise<Record<string, unknown>>;

test("patched Bing follows the regional 302, keeps cookies, and bypasses the configured proxy", async () => {
  const [bingModule, httpModule] = await Promise.all([
    loadModule("open-websearch/build/engines/bing/index.js"),
    loadModule("open-websearch/build/utils/httpRequest.js"),
  ]);
  const searchBing = bingModule.searchBing as (query: string, limit: number, options?: { searchMode?: string }) => Promise<Array<{ url: string }>>;
  const http = httpModule as { __setAxiosRequestForTests: (stub?: AxiosRequestStub) => void };
  const requests: AxiosOptions[] = [];
  http.__setAxiosRequestForTests(async (options: AxiosOptions) => {
    requests.push(options);
    if (requests.length === 1) {
      return {
        status: 302,
        headers: { location: "https://cn.bing.com/search?q=gold", "set-cookie": ["bing_region=cn; Path=/"] },
        data: "",
        request: { res: { responseUrl: options.url } },
      };
    }
    return {
      status: 200,
      headers: { "content-type": "text/html" },
      data: `<ol id="b_results"><li class="b_algo"><h2><a href="https://example.com/gold">Gold price</a></h2><div class="b_caption"><p>Latest gold price result.</p></div></li></ol>`,
      request: { res: { responseUrl: options.url } },
    };
  });
  try {
    const results = await searchBing("gold", 1, { searchMode: "request" });
    assert.equal(results.length, 1);
    assert.equal(results[0].url, "https://example.com/gold");
    assert.deepEqual(requests.map((request) => request.url), ["https://www.bing.com/search?q=gold&setlang=zh-CN&ensearch=0&first=1", "https://cn.bing.com/search?q=gold"]);
    assert.equal(requests[1]?.headers?.Cookie, "bing_region=cn");
    assert.equal(requests[0]?.httpAgent, undefined);
    assert.equal(requests[0]?.httpsAgent, undefined);
  } finally {
    http.__setAxiosRequestForTests();
  }
});

test("patched fetchWebContent extracts JSON-LD articleBody when visible HTML is empty", async () => {
  const [fetchModuleRaw, httpModule] = await Promise.all([
    loadModule("open-websearch/build/engines/web/fetchWebContent.js"),
    loadModule("open-websearch/build/utils/httpRequest.js"),
  ]);
  const html = `<!doctype html><html><head><title>Gold</title><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Gold price today is 123.45 USD per ounce. This is structured article content."}</script></head><body><div id="app"></div></body></html>`;
  const fetchModule = fetchModuleRaw as { fetchWebContent: (url: string, maxChars: number, options: { readability: boolean }) => Promise<{ content: string; extractionMethod?: string; retrievalMethod?: string }> };
  const http = httpModule as { __setAxiosRequestForTests: (stub?: AxiosRequestStub) => void };
  http.__setAxiosRequestForTests(async (options: AxiosOptions) => options.method === "HEAD"
    ? { status: 200, headers: { "content-length": String(html.length) }, data: "" }
    : { status: 200, headers: { "content-type": "text/html" }, data: html, request: { res: { responseUrl: options.url } } });
  try {
    const result = await fetchModule.fetchWebContent("https://example.com/gold", 5_000, { readability: true });
    assert.match(result.content, /Gold price today is 123\.45/);
    assert.equal(result.extractionMethod, "structured");
    assert.equal(result.retrievalMethod, "request");
  } finally {
    http.__setAxiosRequestForTests();
  }
});

test("patched fetchWebContent falls back to browser HTML for a short SPA shell", async () => {
  const [fetchModuleRaw, httpModule] = await Promise.all([
    loadModule("open-websearch/build/engines/web/fetchWebContent.js"),
    loadModule("open-websearch/build/utils/httpRequest.js"),
  ]);
  const shellHtml = `<!doctype html><html><head><title>Gold</title></head><body><div id="app">Loading…</div></body></html>`;
  const renderedHtml = `<!doctype html><html><head><title>Gold rendered</title></head><body><article><p>Rendered gold price article content is available after the client application finishes loading.</p></article></body></html>`;
  const fetchModule = fetchModuleRaw as {
    fetchWebContent: (url: string, maxChars: number, options?: { readability?: boolean }) => Promise<{ content: string; retrievalMethod?: string }>;
    __setBrowserHtmlFetcherForTests: (fetcher?: (url: string) => Promise<{ finalUrl: string; html: string; title: string }>) => void;
  };
  const http = httpModule as { __setAxiosRequestForTests: (stub?: AxiosRequestStub) => void };
  http.__setAxiosRequestForTests(async (options: AxiosOptions) => options.method === "HEAD"
    ? { status: 200, headers: { "content-length": String(shellHtml.length) }, data: "" }
    : { status: 200, headers: { "content-type": "text/html" }, data: shellHtml, request: { res: { responseUrl: options.url } } });
  fetchModule.__setBrowserHtmlFetcherForTests(async () => ({ finalUrl: "https://example.com/gold", html: renderedHtml, title: "Gold rendered" }));
  try {
    const result = await fetchModule.fetchWebContent("https://example.com/gold", 5_000);
    assert.match(result.content, /Rendered gold price article content/);
    assert.equal(result.retrievalMethod, "browser-html");
  } finally {
    fetchModule.__setBrowserHtmlFetcherForTests();
    http.__setAxiosRequestForTests();
  }
});
