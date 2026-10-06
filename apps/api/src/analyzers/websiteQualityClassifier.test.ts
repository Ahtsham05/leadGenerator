import { describe, expect, it } from 'vitest';
import { classifyWebsiteQuality, type QualityInput } from './websiteQualityClassifier.js';

const base: QualityInput = {
  hasWebsite: true,
  reachable: true,
  isHttps: true,
  hasViewportMeta: true,
  horizontalOverflowPx: 0,
  mobileScore: 70,
  copyrightYear: 2026,
  builder: null,
  cms: 'WordPress',
  framework: null,
  bookingQuality: 'basic',
  callToAction: 'Button "Book now"',
  now: new Date('2026-06-01'),
};

describe('websiteQualityClassifier', () => {
  it('none when there is no website', () => {
    expect(classifyWebsiteQuality({ ...base, hasWebsite: false }).websiteQuality).toBe('none');
  });

  it('unknown when unreachable or too few signals', () => {
    expect(classifyWebsiteQuality({ ...base, reachable: false }).websiteQuality).toBe('unknown');
    expect(
      classifyWebsiteQuality({
        ...base,
        isHttps: null,
        hasViewportMeta: null,
        mobileScore: null,
        copyrightYear: null,
        bookingQuality: 'unknown',
        callToAction: undefined,
      }).websiteQuality,
    ).toBe('unknown');
  });

  it('poor: http, no viewport, very slow, old, no booking, dated builder', () => {
    const r = classifyWebsiteQuality({
      ...base,
      isHttps: false,
      hasViewportMeta: false,
      mobileScore: 22,
      copyrightYear: 2012,
      builder: 'GoDaddy Website Builder',
      bookingQuality: 'none',
    });
    expect(r.websiteQuality).toBe('poor');
    expect(r.isMobileFriendly).toBe(false);
    expect(r.qualityReasons).toEqual(
      expect.arrayContaining([
        'Not served over HTTPS (-2)',
        'No responsive viewport meta tag (-3)',
      ]),
    );
  });

  it('average: slow and dated but otherwise ok', () => {
    expect(
      classifyWebsiteQuality({ ...base, mobileScore: 40, copyrightYear: 2022, callToAction: null })
        .websiteQuality,
    ).toBe('average');
  });

  it('good: decent site', () => {
    expect(classifyWebsiteQuality(base).websiteQuality).toBe('good');
  });

  it('excellent requires fast mobile', () => {
    expect(
      classifyWebsiteQuality({
        ...base,
        mobileScore: 95,
        bookingQuality: 'good',
        framework: 'Next.js',
      }).websiteQuality,
    ).toBe('excellent');
  });

  it('flags horizontal overflow as not mobile friendly', () => {
    const r = classifyWebsiteQuality({ ...base, horizontalOverflowPx: 710 });
    expect(r.isMobileFriendly).toBe(false);
    expect(r.qualityReasons.some((x) => x.includes('710px'))).toBe(true);
  });

  it('is deterministic', () => {
    expect(classifyWebsiteQuality(base)).toEqual(classifyWebsiteQuality(base));
  });
});
