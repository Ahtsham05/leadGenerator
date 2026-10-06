/**
 * Enumerations shared by the API and the web app.
 * Each is exported both as a readonly tuple (for zod / Mongoose enums) and as a type.
 */

/** A signal that could be proven present, proven absent, or not determined. */
export const TRI_STATES = ['yes', 'no', 'unknown'] as const;
export type TriState = (typeof TRI_STATES)[number];

export const BOOKING_QUALITIES = ['none', 'basic', 'good', 'unknown'] as const;
export type BookingQuality = (typeof BOOKING_QUALITIES)[number];

/** We never claim "no AI" with certainty, hence `notDetected` rather than `no`. */
export const AI_ASSISTANT_STATES = ['detected', 'notDetected', 'unknown'] as const;
export type AiAssistantState = (typeof AI_ASSISTANT_STATES)[number];

export const WEBSITE_QUALITIES = [
  'none',
  'poor',
  'average',
  'good',
  'excellent',
  'unknown',
] as const;
export type WebsiteQuality = (typeof WEBSITE_QUALITIES)[number];

export const PERFORMANCE_STATUSES = ['ok', 'unavailable', 'failed'] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUSES)[number];

export const ANALYSIS_STATUSES = [
  'pending',
  'analyzing',
  'completed',
  'partial',
  'failed',
  'blocked',
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const PRIORITIES = ['hot', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const LEAD_STATUSES = [
  'new',
  'reviewed',
  'contacted',
  'replied',
  'meeting',
  'won',
  'lost',
  'doNotContact',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const SOURCE_TYPES = ['placesApi', 'csv', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SERVICE_TYPES = [
  'website',
  'booking',
  'whatsapp',
  'aiAssistant',
  'automation',
  'payments',
  'performance',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const TECH_CATEGORIES = [
  'cms',
  'builder',
  'framework',
  'ecommerce',
  'hosting',
  'cdn',
  'analytics',
  'payment',
  'booking',
  'chat',
  'marketing',
  'other',
] as const;
export type TechCategory = (typeof TECH_CATEGORIES)[number];

/** Pipeline stages, used for error records and per-stage duration metrics. */
export const ANALYSIS_STAGES = [
  'fetchPage',
  'parseHtml',
  'techDetector',
  'siteSignals',
  'whatsappDetector',
  'chatbotDetector',
  'pageSpeed',
  'bookingDetector',
  'qualityClassifier',
  'scoring',
  'opportunities',
  'save',
] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

/** Fields the lead list can be sorted by. */
export const LEAD_SORT_FIELDS = [
  'score',
  'createdAt',
  'updatedAt',
  'reviewCount',
  'rating',
  'mobileScore',
  'businessName',
] as const;
