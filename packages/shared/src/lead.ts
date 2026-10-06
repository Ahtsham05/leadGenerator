import { z } from 'zod';
import {
  AI_ASSISTANT_STATES,
  ANALYSIS_STAGES,
  ANALYSIS_STATUSES,
  BOOKING_QUALITIES,
  LEAD_STATUSES,
  PERFORMANCE_STATUSES,
  PRIORITIES,
  SERVICE_TYPES,
  SOURCE_TYPES,
  TECH_CATEGORIES,
  TRI_STATES,
  WEBSITE_QUALITIES,
} from './enums.js';

/**
 * Bump this whenever a detector, classifier or scoring rule changes in a way
 * that would produce different output for the same site. Leads analysed with an
 * older version can then be re-analysed selectively.
 */
export const ANALYSIS_VERSION = 1;

export const TriStateSchema = z.enum(TRI_STATES);

/** A feature signal: tri-state plus the human-readable evidence that justified it. */
export const FeatureSignalSchema = z.object({
  status: TriStateSchema,
  evidence: z.string().nullable(),
});
export type FeatureSignal = z.infer<typeof FeatureSignalSchema>;

export const DetectedSignatureSchema = z.object({
  name: z.string(),
  category: z.enum(TECH_CATEGORIES),
  evidence: z.string(),
});
export type DetectedSignature = z.infer<typeof DetectedSignatureSchema>;

export const TechnologySchema = z.object({
  framework: z.string().nullable(),
  cms: z.string().nullable(),
  /** Hosted site builder (Wix, Squarespace, GoDaddy...). Kept separate from CMS. */
  builder: z.string().nullable(),
  ecommerce: z.string().nullable(),
  hosting: z.string().nullable(),
  cdn: z.string().nullable(),
  analytics: z.array(z.string()),
  paymentProviders: z.array(z.string()),
  detectedSignatures: z.array(DetectedSignatureSchema),
});
export type Technology = z.infer<typeof TechnologySchema>;

export const PerformanceSchema = z.object({
  mobileScore: z.number().min(0).max(100).nullable(),
  desktopScore: z.number().min(0).max(100).nullable(),
  /** Core metrics are taken from the mobile run (Google ranks mobile-first). */
  lcpMs: z.number().nullable(),
  /** INP when available in field data, otherwise lab TBT as a proxy (see inpSource). */
  inpMs: z.number().nullable(),
  inpSource: z.enum(['inp', 'tbt']).nullable(),
  cls: z.number().nullable(),
  ttfbMs: z.number().nullable(),
  desktopLcpMs: z.number().nullable(),
  performanceStatus: z.enum(PERFORMANCE_STATUSES),
  performanceError: z.string().nullable(),
  fetchedAt: z.coerce.date().nullable(),
});
export type Performance = z.infer<typeof PerformanceSchema>;

export const FeaturesSchema = z.object({
  onlineBooking: FeatureSignalSchema.extend({
    bookingQuality: z.enum(BOOKING_QUALITIES),
    platforms: z.array(z.string()),
    bookingUrl: z.string().nullable(),
  }),
  whatsapp: FeatureSignalSchema,
  chatbot: FeatureSignalSchema.extend({ chatbotProvider: z.string().nullable() }),
  liveChat: FeatureSignalSchema,
  onlinePayment: FeatureSignalSchema,
  contactForm: FeatureSignalSchema,
  /** Email marketing / CRM / SMS automation signatures (Mailchimp, Klaviyo...). */
  automatedFollowUp: FeatureSignalSchema,
  aiAssistant: z.object({
    status: z.enum(AI_ASSISTANT_STATES),
    evidence: z.string().nullable(),
  }),
});
export type Features = z.infer<typeof FeaturesSchema>;

export const AnalysisErrorSchema = z.object({
  stage: z.string(),
  message: z.string(),
  at: z.coerce.date(),
});
export type AnalysisError = z.infer<typeof AnalysisErrorSchema>;

export const StageDurationSchema = z.object({
  stage: z.enum(ANALYSIS_STAGES),
  ms: z.number(),
});
export type StageDuration = z.infer<typeof StageDurationSchema>;

export const ScoreBreakdownItemSchema = z.object({
  rule: z.string(),
  category: z.string(),
  points: z.number(),
  evidence: z.string(),
});
export type ScoreBreakdownItem = z.infer<typeof ScoreBreakdownItemSchema>;

export const OpportunitySchema = z.object({
  title: z.string(),
  serviceType: z.enum(SERVICE_TYPES),
  reason: z.string(),
  evidence: z.array(z.string()),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const NoteSchema = z.object({ text: z.string(), at: z.coerce.date() });
export type Note = z.infer<typeof NoteSchema>;

export const LeadSchema = z.object({
  id: z.string(),

  // Identity and source
  placeId: z.string().nullable(),
  businessName: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  googleMapsUri: z.string().nullable(),
  businessStatus: z.string().nullable(),
  primaryType: z.string().nullable(),
  types: z.array(z.string()),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  priceLevel: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  /** Only ever an address found published on the business's own site. */
  email: z.string().nullable(),
  emailSourceUrl: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  sourceType: z.enum(SOURCE_TYPES),
  searchQueryId: z.string().nullable(),

  technology: TechnologySchema,
  performance: PerformanceSchema,
  features: FeaturesSchema,

  // Website quality
  websiteQuality: z.enum(WEBSITE_QUALITIES),
  qualityReasons: z.array(z.string()),
  isHttps: z.boolean().nullable(),
  isMobileFriendly: z.boolean().nullable(),
  lastModifiedHint: z.string().nullable(),
  copyrightYear: z.number().nullable(),
  finalUrl: z.string().nullable(),
  httpStatus: z.number().nullable(),
  screenshotPath: z.string().nullable(),

  // Analysis state
  analysisStatus: z.enum(ANALYSIS_STATUSES),
  analysisErrors: z.array(AnalysisErrorSchema),
  stageDurations: z.array(StageDurationSchema),
  analyzedAt: z.coerce.date().nullable(),
  analysisVersion: z.number().int(),

  // Scoring and report
  score: z.number().min(0).max(100).nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  scoreConfidence: z.number().min(0).max(1).nullable(),
  scoreNotes: z.array(z.string()),
  scoreBreakdown: z.array(ScoreBreakdownItemSchema),
  opportunities: z.array(OpportunitySchema),
  outreachAngle: z.string().nullable(),
  outreachGeneratedAt: z.coerce.date().nullable(),

  // CRM
  leadStatus: z.enum(LEAD_STATUSES),
  notes: z.array(NoteSchema),
  lastContactedAt: z.coerce.date().nullable(),
  tags: z.array(z.string()),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Lead = z.infer<typeof LeadSchema>;

/** Neutral defaults for a lead that has not been analysed yet. */
export function unknownSignal(): FeatureSignal {
  return { status: 'unknown', evidence: null };
}

export function emptyFeatures(): Features {
  return {
    onlineBooking: {
      ...unknownSignal(),
      bookingQuality: 'unknown',
      platforms: [],
      bookingUrl: null,
    },
    whatsapp: unknownSignal(),
    chatbot: { ...unknownSignal(), chatbotProvider: null },
    liveChat: unknownSignal(),
    onlinePayment: unknownSignal(),
    contactForm: unknownSignal(),
    automatedFollowUp: unknownSignal(),
    aiAssistant: { status: 'unknown', evidence: null },
  };
}

export function emptyTechnology(): Technology {
  return {
    framework: null,
    cms: null,
    builder: null,
    ecommerce: null,
    hosting: null,
    cdn: null,
    analytics: [],
    paymentProviders: [],
    detectedSignatures: [],
  };
}

export function emptyPerformance(): Performance {
  return {
    mobileScore: null,
    desktopScore: null,
    lcpMs: null,
    inpMs: null,
    inpSource: null,
    cls: null,
    ttfbMs: null,
    desktopLcpMs: null,
    performanceStatus: 'unavailable',
    performanceError: null,
    fetchedAt: null,
  };
}
