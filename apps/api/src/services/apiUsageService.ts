import { AppError } from '../lib/errors.js';
import { ApiUsageModel, type ApiService } from '../models/ApiUsage.js';
import { checkBudget, utcDay, utcMonthPrefix, type BudgetCheck } from './budget.js';

export class BudgetExceededError extends AppError {
  constructor(message: string, details: unknown) {
    super(429, 'BUDGET_EXCEEDED', message, details);
  }
}

export interface Caps {
  daily: number;
  monthly: number;
}

/** Counts paid API calls per UTC day and enforces caps. */
export class ApiUsageService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async increment(service: ApiService, count = 1): Promise<void> {
    await ApiUsageModel.updateOne(
      { date: utcDay(this.now()), service },
      { $inc: { count } },
      { upsert: true },
    );
  }

  async daily(service: ApiService): Promise<number> {
    const doc = await ApiUsageModel.findOne({ date: utcDay(this.now()), service }).lean();
    return doc?.count ?? 0;
  }

  async monthly(service: ApiService): Promise<number> {
    const [row] = await ApiUsageModel.aggregate<{ total: number }>([
      { $match: { service, date: { $regex: `^${utcMonthPrefix(this.now())}` } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]);
    return row?.total ?? 0;
  }

  async check(service: ApiService, caps: Caps, requested = 1): Promise<BudgetCheck> {
    const [dailyUsed, monthlyUsed] = await Promise.all([
      this.daily(service),
      this.monthly(service),
    ]);
    return checkBudget({
      dailyUsed,
      monthlyUsed,
      dailyCap: caps.daily,
      monthlyCap: caps.monthly,
      requested,
    });
  }

  /** Throws BudgetExceededError instead of letting a capped API be called. */
  async assertWithinCaps(service: ApiService, caps: Caps, requested = 1): Promise<void> {
    const result = await this.check(service, caps, requested);
    if (!result.allowed)
      throw new BudgetExceededError(`${service} budget exceeded: ${result.message}`, result);
  }
}
