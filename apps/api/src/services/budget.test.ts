import { describe, expect, it } from 'vitest';
import { checkBudget, utcDay, utcMonthPrefix } from './budget.js';

describe('checkBudget', () => {
  const caps = { dailyCap: 100, monthlyCap: 1000 };
  it('allows within caps', () => {
    expect(checkBudget({ ...caps, dailyUsed: 10, monthlyUsed: 10, requested: 5 })).toMatchObject({
      allowed: true,
      dailyRemaining: 90,
      monthlyRemaining: 990,
    });
  });
  it('allows using exactly the remaining budget', () => {
    expect(checkBudget({ ...caps, dailyUsed: 99, monthlyUsed: 0, requested: 1 }).allowed).toBe(
      true,
    );
  });
  it('refuses when the daily cap would be exceeded', () => {
    expect(checkBudget({ ...caps, dailyUsed: 100, monthlyUsed: 0, requested: 1 })).toMatchObject({
      allowed: false,
      reason: 'dailyCap',
    });
  });
  it('refuses when the monthly cap would be exceeded', () => {
    expect(checkBudget({ ...caps, dailyUsed: 0, monthlyUsed: 999, requested: 2 })).toMatchObject({
      allowed: false,
      reason: 'monthlyCap',
    });
  });
  it('a zero cap disables the API', () => {
    expect(
      checkBudget({ dailyCap: 0, monthlyCap: 0, dailyUsed: 0, monthlyUsed: 0, requested: 1 })
        .allowed,
    ).toBe(false);
  });
  it('UTC day/month keys', () => {
    const d = new Date('2026-03-31T23:30:00Z');
    expect(utcDay(d)).toBe('2026-03-31');
    expect(utcMonthPrefix(d)).toBe('2026-03');
  });
});
