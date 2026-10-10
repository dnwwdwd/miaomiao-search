import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DomainError } from "../../src/domain.js";
import { ZhihuOfficialProvider, runZhihuOfficialCli } from "../../src/providers/zhihu-official-provider.js";
import type { SettingsService } from "../../src/services/settings.js";

function settings(secret?: string): SettingsService {
  return { get: (key: string) => key === "engine.zhihu_official.apiKey" ? secret : undefined } as SettingsService;
}

test("official CLI search maps results and clamps the request to ten", async () => {
  let received: unknown[] = [];
  const provider = new ZhihuOfficialProvider(settings("user-secret"), async (...args) => {
    received = args;
    return JSON.stringify({ Code: 0, Data: { Items: [
      { Title: "<em>文章</em>", ContentText: "<em>摘要</em>", Url: "https://zhuanlan.zhihu.com/p/123", ContentType: "Article", AuthorName: "<em>作者</em>", VoteUpCount: 128, CommentCount: 15, EditTime: 1710000000 },
      { Title: "invalid", Url: "http://127.0.0.1:80/" },
    ] } });
  });
  const result = await provider.search({ query: "  测试  ", limit: 50 });
  assert.deepEqual(received, ["测试", 10, "user-secret"]);
  assert.equal(result.results[0]?.title, "文章");
  assert.equal(result.results[0]?.description, "摘要");
  assert.equal(result.results[0]?.engines[0], "zhihu_official");
  assert.deepEqual(result.results[0]?.zhihuMeta, { contentType: "Article", author: "作者", voteUpCount: 128, commentCount: 15, editedAt: 1710000000 });
});

test("official CLI requires a per-user secret and hides upstream errors", async () => {
  await assert.rejects(new ZhihuOfficialProvider(settings()).search({ query: "test", limit: 1 }), (error: unknown) => error instanceof DomainError && error.code === "ENGINE_API_KEY_REQUIRED");
  const provider = new ZhihuOfficialProvider(settings("private"), async () => JSON.stringify({ Code: 20001, Message: "private" }));
  await assert.rejects(provider.search({ query: "test", limit: 1 }), (error: unknown) => error instanceof DomainError && error.code === "ZHIHU_AUTH_FAILED" && !error.message.includes("private"));
});

test("official CLI maps documented search limit errors without returning upstream messages", async () => {
  const provider = new ZhihuOfficialProvider(settings("private"), async () => JSON.stringify({ Code: 30001, Message: "private upstream response" }));
  await assert.rejects(provider.search({ query: "test", limit: 1 }), (error: unknown) => error instanceof DomainError && error.code === "ZHIHU_RATE_LIMITED" && !error.message.includes("private"));
  const quotaProvider = new ZhihuOfficialProvider(settings("private"), async () => JSON.stringify({ Code: 30002, Message: "private upstream response" }));
  await assert.rejects(quotaProvider.search({ query: "test", limit: 1 }), (error: unknown) => error instanceof DomainError && error.code === "ZHIHU_QUOTA_EXHAUSTED" && !error.message.includes("private"));
});

test("official binary receives secret only through its child environment", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zhihu-cli-test-"));
  const binary = join(directory, "zhihu-cli");
  const previous = process.env.ZHIHU_CLI_PATH;
  try {
    writeFileSync(binary, "#!/bin/sh\n[ \"$ZHIHU_ACCESS_SECRET\" = 'private-secret' ] || exit 1\n[ \"$1\" = 'search' ] || exit 1\nprintf '{\"Code\":0,\"Data\":{\"Items\":[]}}'\n");
    chmodSync(binary, 0o755);
    process.env.ZHIHU_CLI_PATH = binary;
    assert.match(await runZhihuOfficialCli("test", 1, "private-secret"), /"Code":0/);
    assert.equal(process.env.ZHIHU_ACCESS_SECRET, undefined);
  } finally {
    if (previous === undefined) delete process.env.ZHIHU_CLI_PATH;
    else process.env.ZHIHU_CLI_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("official CLI failures expose a fixed message without raw diagnostics", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zhihu-cli-error-"));
  const binary = join(directory, "zhihu-cli");
  const previous = process.env.ZHIHU_CLI_PATH;
  try {
    writeFileSync(binary, "#!/bin/sh\nprintf '{\"ok\":false,\"error\":{\"code\":\"AUTH_INVALID\",\"message\":\"private-secret\"}}'\nexit 2\n");
    chmodSync(binary, 0o755);
    process.env.ZHIHU_CLI_PATH = binary;
    await assert.rejects(runZhihuOfficialCli("test", 1, "private-secret"), (error: unknown) => error instanceof DomainError && error.code === "ZHIHU_AUTH_FAILED" && !error.message.includes("private-secret"));
  } finally {
    if (previous === undefined) delete process.env.ZHIHU_CLI_PATH;
    else process.env.ZHIHU_CLI_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("official CLI subprocess limit errors use stable codes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zhihu-cli-limit-"));
  const binary = join(directory, "zhihu-cli");
  const previous = process.env.ZHIHU_CLI_PATH;
  try {
    writeFileSync(binary, "#!/bin/sh\nprintf '{\"ok\":false,\"error\":{\"code\":\"API_ERROR\",\"upstream_code\":30001,\"message\":\"private-secret\"}}'\nexit 2\n");
    chmodSync(binary, 0o755);
    process.env.ZHIHU_CLI_PATH = binary;
    await assert.rejects(runZhihuOfficialCli("test", 1, "private-secret"), (error: unknown) => error instanceof DomainError && error.code === "ZHIHU_RATE_LIMITED" && !error.message.includes("private-secret"));
  } finally {
    if (previous === undefined) delete process.env.ZHIHU_CLI_PATH;
    else process.env.ZHIHU_CLI_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
