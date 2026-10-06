import { Types } from 'mongoose';
import {
  ANALYSIS_VERSION,
  type AnalysisError,
  type AnalysisStatus,
  type Lead,
  type ListLeadsQuery,
  type Paginated,
} from '@lead/shared';
import { LeadModel, toLeadDto } from '../models/Lead.js';
import { buildLeadFilter, buildLeadSort } from './leadFilters.js';

export interface ManualLeadInput {
  businessName: string;
  website: string;
  websiteKey: string;
  city?: string;
  country?: string;
  rating?: number;
  reviewCount?: number;
}

/** Fields produced by an analysis run. */
export type LeadAnalysisUpdate = Pick<
  Lead,
  | 'technology'
  | 'performance'
  | 'features'
  | 'websiteQuality'
  | 'qualityReasons'
  | 'isHttps'
  | 'isMobileFriendly'
  | 'lastModifiedHint'
  | 'copyrightYear'
  | 'finalUrl'
  | 'httpStatus'
  | 'screenshotPath'
  | 'analysisStatus'
  | 'analysisErrors'
  | 'stageDurations'
  | 'analyzedAt'
  | 'analysisVersion'
  | 'score'
  | 'priority'
  | 'scoreConfidence'
  | 'scoreNotes'
  | 'scoreBreakdown'
  | 'opportunities'
  | 'email'
  | 'emailSourceUrl'
  | 'instagramUrl'
  | 'facebookUrl'
>;

export interface LeadRepository {
  findById(id: string): Promise<Lead | null>;
  upsertManual(input: ManualLeadInput): Promise<{ lead: Lead; created: boolean }>;
  list(query: ListLeadsQuery): Promise<Paginated<Lead>>;
  markAnalyzing(id: string): Promise<void>;
  saveAnalysis(id: string, update: LeadAnalysisUpdate): Promise<void>;
  recordFailure(id: string, status: AnalysisStatus, error: AnalysisError): Promise<void>;
  setPending(id: string): Promise<void>;
}

/** Heavy fields left out of list responses. */
const LIST_PROJECTION = {
  'technology.detectedSignatures': 0,
  stageDurations: 0,
  notes: 0,
} as const;

export class MongoLeadRepository implements LeadRepository {
  async findById(id: string): Promise<Lead | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LeadModel.findById(id).lean();
    return doc ? toLeadDto(doc as unknown as Parameters<typeof toLeadDto>[0]) : null;
  }

  async upsertManual(input: ManualLeadInput): Promise<{ lead: Lead; created: boolean }> {
    const set: Record<string, unknown> = {
      businessName: input.businessName,
      website: input.website,
    };
    if (input.city !== undefined) set.city = input.city;
    if (input.country !== undefined) set.country = input.country;
    if (input.rating !== undefined) set.rating = input.rating;
    if (input.reviewCount !== undefined) set.reviewCount = input.reviewCount;
    const res = await LeadModel.findOneAndUpdate(
      { websiteKey: input.websiteKey },
      { $set: set, $setOnInsert: { websiteKey: input.websiteKey, sourceType: 'manual' } },
      {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: true,
        lean: true,
        setDefaultsOnInsert: true,
      },
    );
    const doc = res.value as unknown as Parameters<typeof toLeadDto>[0];
    return { lead: toLeadDto(doc), created: !res.lastErrorObject?.updatedExisting };
  }

  async list(query: ListLeadsQuery): Promise<Paginated<Lead>> {
    const filter = buildLeadFilter(query);
    const [docs, total] = await Promise.all([
      LeadModel.find(filter, LIST_PROJECTION)
        .sort(buildLeadSort(query))
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      LeadModel.countDocuments(filter),
    ]);
    return {
      items: docs.map((d) => toLeadDto(d as unknown as Parameters<typeof toLeadDto>[0])),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async markAnalyzing(id: string): Promise<void> {
    await LeadModel.updateOne({ _id: id }, { $set: { analysisStatus: 'analyzing' } });
  }

  async setPending(id: string): Promise<void> {
    await LeadModel.updateOne({ _id: id }, { $set: { analysisStatus: 'pending' } });
  }

  async saveAnalysis(id: string, update: LeadAnalysisUpdate): Promise<void> {
    // Contact details found on the site never overwrite values that already exist.
    const { email, emailSourceUrl, instagramUrl, facebookUrl, ...rest } = update;
    const existing = await LeadModel.findById(id, {
      email: 1,
      instagramUrl: 1,
      facebookUrl: 1,
    }).lean();
    const set: Record<string, unknown> = {
      ...rest,
      analysisVersion: update.analysisVersion ?? ANALYSIS_VERSION,
    };
    if (!existing?.email && email) Object.assign(set, { email, emailSourceUrl });
    if (!existing?.instagramUrl && instagramUrl) set.instagramUrl = instagramUrl;
    if (!existing?.facebookUrl && facebookUrl) set.facebookUrl = facebookUrl;
    await LeadModel.updateOne({ _id: id }, { $set: set });
  }

  async recordFailure(id: string, status: AnalysisStatus, error: AnalysisError): Promise<void> {
    await LeadModel.updateOne(
      { _id: id },
      {
        $set: { analysisStatus: status, analyzedAt: error.at },
        $push: { analysisErrors: { $each: [error], $slice: -20 } },
      },
    );
  }
}
