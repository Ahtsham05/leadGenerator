import { describe, expect, it } from 'vitest';
import { emptyFeatures, emptyPerformance, emptyTechnology } from '@lead/shared';
import { csvCell, hostOf, shortDay, timeAgo } from './format';
import { groupBreakdown, rateVital, scoreBand, weakPoints } from './leadView';
import type { LeadDto } from './types';

function lead(over: Partial<LeadDto> = {}): LeadDto {
  return {
    technology: emptyTechnology(),
    performance: { ...emptyPerformance(), fetchedAt: null },
    features: emptyFeatures(),
    websiteQuality: 'unknown',
    analysisStatus: 'completed',
    score: 70,
    scoreBreakdown: [],
    ...over,
  } as unknown as LeadDto;
}

describe('weakPoints', () => {
  it('never turns an unknown signal into a gap', () => {
    expect(weakPoints(lead())).toEqual([]);
  });

  it('lists only proven gaps', () => {
    const features = emptyFeatures();
    features.onlineBooking.bookingQuality = 'none';
    features.whatsapp.status = 'no';
    features.chatbot.status = 'unknown';
    const out = weakPoints(
      lead({
        websiteQuality: 'poor',
        features,
        performance: { ...emptyPerformance(), mobileScore: 31, fetchedAt: null },
      }),
    );
    expect(out).toEqual([
      'Poor website',
      'Slow on mobile (31)',
      'No online booking',
      'No WhatsApp',
    ]);
  });

  it('shows nothing while the first analysis is still running', () => {
    expect(weakPoints(lead({ analysisStatus: 'analyzing', score: null }))).toEqual([]);
  });
});

describe('rateVital', () => {
  it('uses the published Core Web Vitals thresholds', () => {
    expect(rateVital('lcp', 2500)).toBe('good');
    expect(rateVital('lcp', 3200)).toBe('needs-work');
    expect(rateVital('lcp', 4001)).toBe('poor');
    expect(rateVital('cls', 0.1)).toBe('good');
    expect(rateVital('cls', 0.3)).toBe('poor');
    expect(rateVital('inp', null)).toBeNull();
  });
});

describe('scoreBand', () => {
  it('matches the priority thresholds', () => {
    expect(scoreBand(null)).toBeNull();
    expect(scoreBand(80)).toBe('hot');
    expect(scoreBand(79)).toBe('high');
    expect(scoreBand(40)).toBe('medium');
    expect(scoreBand(39)).toBe('low');
  });
});

describe('groupBreakdown', () => {
  it('totals each category including its cap line', () => {
    const groups = groupBreakdown([
      { rule: 'website.poor', category: 'website', points: 25, evidence: 'a' },
      { rule: 'booking.none', category: 'booking', points: 15, evidence: 'b' },
      { rule: 'booking.noForm', category: 'booking', points: 8, evidence: 'c' },
      { rule: 'booking.cap', category: 'booking', points: -3, evidence: 'd' },
    ]);
    expect(groups.map((g) => [g.category, g.total])).toEqual([
      ['website', 25],
      ['booking', 20],
    ]);
  });
});

describe('format helpers', () => {
  it('extracts a readable host', () => {
    expect(hostOf('https://www.Example.com/path?q=1')).toBe('example.com');
    expect(hostOf(null)).toBe('');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-06T12:00:00Z');
    expect(timeAgo(null, now)).toBe('never');
    expect(timeAgo('2026-10-06T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-10-06T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-10-06T07:00:00Z', now)).toBe('5 h ago');
    expect(timeAgo('2026-10-03T12:00:00Z', now)).toBe('3 d ago');
  });

  it('labels days', () => {
    expect(shortDay('2026-10-06')).toBe('6 Oct');
  });

  it('escapes CSV and blocks spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe('');
  });
});
