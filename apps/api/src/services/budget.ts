/** Pure budget arithmetic, used by the usage service and unit-tested directly. */
export interface BudgetCheckInput {
  dailyUsed: number;
  monthlyUsed: number;
  dailyCap: number;
  monthlyCap: number;
  requested: number;
}

export type BudgetCheck =
  | { allowed: true; dailyRemaining: number; monthlyRemaining: number }
  | {
      allowed: false;
      reason: 'dailyCap' | 'monthlyCap';
      message: string;
      dailyRemaining: number;
      monthlyRemaining: number;
    };

export function checkBudget(i: BudgetCheckInput): BudgetCheck {
  const dailyRemaining = Math.max(0, i.dailyCap - i.dailyUsed);
  const monthlyRemaining = Math.max(0, i.monthlyCap - i.monthlyUsed);
  if (i.requested > dailyRemaining) {
    return {
      allowed: false,
      reason: 'dailyCap',
      message: `Daily cap of ${i.dailyCap} reached (${i.dailyUsed} used)`,
      dailyRemaining,
      monthlyRemaining,
    };
  }
  if (i.requested > monthlyRemaining) {
    return {
      allowed: false,
      reason: 'monthlyCap',
      message: `Monthly cap of ${i.monthlyCap} reached (${i.monthlyUsed} used)`,
      dailyRemaining,
      monthlyRemaining,
    };
  }
  return { allowed: true, dailyRemaining, monthlyRemaining };
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function utcMonthPrefix(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}
