import { DomainError, type EngineId } from "../domain.js";
import { WechatContentService, type WechatDiscoverResult } from "../services/wechat-content.js";
import type { ProviderSearchInput, ProviderSearchResponse } from "./types.js";
import type { SearchProvider } from "./types.js";

/**
 * 微信公众号搜索源：复用搜狗微信搜索/今天看啥镜像的文章发现链路。
 * 搜狗单页约 10 条且逐条直链还原需要 3 秒节流，整体耗时明显高于 HTTP 搜索源；
 * 验证码命中时立即失败并保留明确错误码。
 */
export class WechatProvider implements SearchProvider {
  readonly engine: EngineId = "wechat";
  readonly maxResults = 10;
  readonly cacheVersion = "wechat-v1";

  constructor(private readonly wechat: Pick<WechatContentService, "searchArticles"> = new WechatContentService()) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const limit = Math.max(1, Math.min(input.limit, this.maxResults));
    let result: WechatDiscoverResult;
    try {
      result = await this.wechat.searchArticles({ query: input.query.trim(), source: "sogou", limit });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", "微信公众号搜索暂时不可用", 502);
    }
    if (result.failure && result.items.every((item) => !item.resolved)) {
      throw new DomainError(result.failure.code, result.failure.message, 502);
    }
    const results = result.items.flatMap((item) => {
      if (!item.resolved || !item.sourceUrl) return [];
      const meta = [item.account ? `公众号：${item.account}` : "", item.publishedAt ?? ""].filter(Boolean).join(" · ");
      return [{ title: item.title, url: item.sourceUrl, description: meta, engines: [this.engine] as EngineId[] }];
    });
    return { results, failures: result.failure && results.length > 0 ? [{ code: result.failure.code, message: result.failure.message }] : [] };
  }
}
