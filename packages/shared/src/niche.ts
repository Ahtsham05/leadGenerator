/**
 * Niche vocabulary used to phrase opportunities and (in Phase 2) build search queries.
 * Add a new entry to support another vertical; nothing else needs to change.
 */
export interface NicheProfile {
  id: string;
  label: string;
  /** Noun used in opportunity titles, e.g. "rental" -> "Modern rental website". */
  serviceNoun: string;
  /** e.g. "common rental questions" */
  faqPhrase: string;
}

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  carRental: {
    id: 'carRental',
    label: 'Independent car rental',
    serviceNoun: 'rental',
    faqPhrase: 'common rental questions (availability, deposits, insurance, pickup)',
  },
  generic: {
    id: 'generic',
    label: 'Local service business',
    serviceNoun: 'business',
    faqPhrase: 'common customer questions',
  },
};

export const DEFAULT_NICHE_ID = 'carRental';

export function getNicheProfile(id: string | undefined): NicheProfile {
  return (id && NICHE_PROFILES[id]) || NICHE_PROFILES[DEFAULT_NICHE_ID]!;
}
