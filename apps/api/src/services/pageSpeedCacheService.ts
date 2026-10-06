import type {
  PageSpeedCache,
  PsiStrategy,
  PsiStrategyResult,
} from '../analyzers/pageSpeedAnalyzer.js';
import { PageSpeedCacheModel } from '../models/PageSpeedCache.js';

export class MongoPageSpeedCache implements PageSpeedCache {
  constructor(private readonly ttlDays: number) {}

  async get(url: string, strategy: PsiStrategy): Promise<PsiStrategyResult | null> {
    const doc = await PageSpeedCacheModel.findOne({
      url,
      strategy,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!doc) return null;
    const r = doc.result as PsiStrategyResult;
    return { ...r, fetchedAt: new Date(r.fetchedAt) };
  }

  async set(url: string, strategy: PsiStrategy, result: PsiStrategyResult): Promise<void> {
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000);
    await PageSpeedCacheModel.updateOne(
      { url, strategy },
      { $set: { result, expiresAt } },
      { upsert: true },
    );
  }
}
