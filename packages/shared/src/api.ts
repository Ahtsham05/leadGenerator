import { z } from 'zod';
import {
  ANALYSIS_STATUSES,
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

export const LEAD_SORT_FIELDS = [
  'score',
  'createdAt',
  'updatedAt',
  'reviewCount',
  'rating',
  'mobileScore',
  'businessName',
] as const;

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
