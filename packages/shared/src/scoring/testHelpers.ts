import { emptyFeatures, type Features } from '../lead.js';
import type { ScoringInput } from './scoreLead.js';

type DeepPartialFeatures = { [K in keyof Features]?: Partial<Features[K]> };

/** Build a neutral scoring input; everything known-but-unremarkable unless overridden. */
export function makeScoringInput(
  overrides: Omit<Partial<ScoringInput>, 'features' | 'performance'> & {
    features?: DeepPartialFeatures;
    performance?: Partial<ScoringInput['performance']>;
  } = {},
): ScoringInput {
  const base = emptyFeatures();
  const features = { ...base } as Features;
  for (const [k, v] of Object.entries(overrides.features ?? {})) {
    const key = k as keyof Features;
    // Object spread over a union-keyed record needs a cast; shapes are validated by the type above.
    (features as Record<string, unknown>)[key] = { ...base[key], ...v };
  }
  return {
    businessName: 'Acme Car Hire',
    types: ['car_rental'],
    primaryType: 'car_rental',
    rating: null,
    reviewCount: null,
    instagramUrl: null,
    websiteQuality: 'good',
    ...overrides,
    performance: {
      performanceStatus: 'ok',
      mobileScore: 90,
      lcpMs: 1500,
      cls: 0.01,
      ...overrides.performance,
    },
    features,
  };
}
