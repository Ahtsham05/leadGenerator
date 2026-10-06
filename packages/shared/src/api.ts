import { z } from 'zod';
import type { WEBSITE_QUALITIES } from './enums.js';
import {
  ANALYSIS_STATUSES,
  LEAD_SORT_FIELDS,
  BOOKING_QUALITIES,
  LEAD_STATUSES,
  PRIORITIES,
  TRI_STATES,
} from './enums.js';
import type { Lead } from './lead.js';

/** POST /api/leads/analyze */
export const AnalyzeLeadBodySchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  website: z.string().trim().min(3).max(2048),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  /** Re-analyse even if a fresh analysis exists. */
  force: z.boolean().optional(),
});
export type AnalyzeLeadBody = z.infer<typeof AnalyzeLeadBodySchema>;

export interface AnalyzeLeadResponse {
  id: string;
  jobId: string | null;
  analysisStatus: Lead['analysisStatus'];
  enqueued: boolean;
}

/** Query string booleans arrive as strings. */
const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');
const queryNumber = z.coerce.number().finite();

/** GET /api/leads */
export const ListLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(LEAD_SORT_FIELDS).default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
  priority: z.enum(PRIORITIES).optional(),
  city: z.string().trim().max(120).optional(),
  /** Analysis status filter. */
  status: z.enum(ANALYSIS_STATUSES).optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  /** Matches any detected technology name (case-insensitive exact name). */
  technology: z.string().trim().max(80).optional(),
  bookingStatus: z.enum(BOOKING_QUALITIES).optional(),
  whatsapp: z.enum(TRI_STATES).optional(),
  minScore: queryNumber.min(0).max(100).optional(),
  maxMobileScore: queryNumber.min(0).max(100).optional(),
  minReviews: queryNumber.min(0).optional(),
  search: z.string().trim().max(200).optional(),
  hasWebsite: queryBool.optional(),
});
export type ListLeadsQuery = z.infer<typeof ListLeadsQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Consistent error shape returned by every endpoint. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** PATCH /api/leads/:id. CRM fields only; analysis output is never editable. */
export const UpdateLeadBodySchema = z
  .object({
    leadStatus: z.enum(LEAD_STATUSES).optional(),
    /** Replaces the whole tag list. */
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    /** Appends one timestamped note. */
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((v) => v.leadStatus !== undefined || v.tags !== undefined || v.note !== undefined, {
    message: 'Provide at least one of leadStatus, tags or note',
  });
export type UpdateLeadBody = z.infer<typeof UpdateLeadBodySchema>;

export interface CountBucket {
  key: string;
  count: number;
}

/** GET /api/leads/stats. Everything the overview screen needs in one call. */
export interface LeadStats {
  total: number;
  /** completed + partial */
  analyzed: number;
  /** pending + analyzing */
  inProgress: number;
  /** failed + blocked */
  needsAttention: number;
  averageScore: number | null;
  averageMobileScore: number | null;
  byPriority: Record<(typeof PRIORITIES)[number], number>;
  byLeadStatus: Record<(typeof LEAD_STATUSES)[number], number>;
  byAnalysisStatus: Record<(typeof ANALYSIS_STATUSES)[number], number>;
  byBooking: Record<(typeof BOOKING_QUALITIES)[number], number>;
  byWebsiteQuality: Record<(typeof WEBSITE_QUALITIES)[number], number>;
  byWhatsapp: Record<(typeof TRI_STATES)[number], number>;
  /** Ten buckets of ten points each: "0-9", "10-19", ... "90-100". */
  scoreDistribution: CountBucket[];
  topCities: CountBucket[];
  topTechnologies: CountBucket[];
  /** Leads created per UTC day for the last 30 days, oldest first, zero days included. */
  createdPerDay: CountBucket[];
}
