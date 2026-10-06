import { Types } from 'mongoose';
import {
  ANALYSIS_STATUSES,
  ANALYSIS_VERSION,
  BOOKING_QUALITIES,
  LEAD_STATUSES,
  PRIORITIES,
  TRI_STATES,
  WEBSITE_QUALITIES,
  type AnalysisError,
  type AnalysisStatus,
  type Lead,
  type LeadStats,
  type ListLeadsQuery,
  type Paginated,
  type UpdateLeadBody,
} from '@lead/shared';
import { LeadModel, toLeadDto } from '../models/Lead.js';
import { buildLeadFilter, buildLeadSort } from './leadFilters.js';
import {
  STATS_DAYS,
  fillCounts,
  fillDays,
  fillScoreBuckets,
  statsWindowStart,
  topBuckets,
} from './leadStats.js';

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
  stats(): Promise<LeadStats>;
  /** Apply CRM edits. Returns the updated lead, or null when it does not exist. */
  updateCrm(id: string, patch: UpdateLeadBody): Promise<Lead | null>;
  remove(id: string): Promise<boolean>;
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

  async stats(): Promise<LeadStats> {
    const now = new Date();
    const count = { $sum: 1 };
    const [res] = await LeadModel.aggregate<Record<string, Array<{ _id: unknown; count: number }>>>(
      [
        {
          $facet: {
            total: [{ $count: 'count' }],
            averages: [
              {
                $group: {
                  _id: null,
                  score: { $avg: '$score' },
                  mobile: { $avg: '$performance.mobileScore' },
                },
              },
            ],
            priority: [{ $group: { _id: '$priority', count } }],
            leadStatus: [{ $group: { _id: '$leadStatus', count } }],
            analysisStatus: [{ $group: { _id: '$analysisStatus', count } }],
            booking: [{ $group: { _id: '$features.onlineBooking.bookingQuality', count } }],
            websiteQuality: [{ $group: { _id: '$websiteQuality', count } }],
            whatsapp: [{ $group: { _id: '$features.whatsapp.status', count } }],
            scores: [
              { $match: { score: { $type: 'number' } } },
              {
                $bucket: {
                  groupBy: '$score',
                  boundaries: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101],
                  default: 'other',
                  output: { count },
                },
              },
            ],
            cities: [
              { $match: { city: { $type: 'string', $ne: '' } } },
              { $group: { _id: '$city', count } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 50 },
            ],
            technologies: [
              { $project: { names: { $setUnion: ['$technology.detectedSignatures.name', []] } } },
              { $unwind: '$names' },
              { $group: { _id: '$names', count } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 50 },
            ],
            created: [
              { $match: { createdAt: { $gte: statsWindowStart(now, STATS_DAYS) } } },
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' },
                  },
                  count,
                },
              },
            ],
          },
        },
      ],
    );
    const facet = res ?? {};
    const rows = (k: string) => facet[k] ?? [];
    const avg = (rows('averages')[0] ?? {}) as { score?: number | null; mobile?: number | null };
    const round1 = (v: number | null | undefined) =>
      v === null || v === undefined ? null : Math.round(v * 10) / 10;

    const byAnalysisStatus = fillCounts(ANALYSIS_STATUSES, rows('analysisStatus'));
    return {
      total: rows('total')[0]?.count ?? 0,
      analyzed: byAnalysisStatus.completed + byAnalysisStatus.partial,
      inProgress: byAnalysisStatus.pending + byAnalysisStatus.analyzing,
      needsAttention: byAnalysisStatus.failed + byAnalysisStatus.blocked,
      averageScore: round1(avg.score),
      averageMobileScore: round1(avg.mobile),
      byPriority: fillCounts(PRIORITIES, rows('priority')),
      byLeadStatus: fillCounts(LEAD_STATUSES, rows('leadStatus')),
      byAnalysisStatus,
      byBooking: fillCounts(BOOKING_QUALITIES, rows('booking')),
      byWebsiteQuality: fillCounts(WEBSITE_QUALITIES, rows('websiteQuality')),
      byWhatsapp: fillCounts(TRI_STATES, rows('whatsapp')),
      scoreDistribution: fillScoreBuckets(rows('scores').filter((r) => r._id !== 'other')),
      topCities: topBuckets(rows('cities')),
      topTechnologies: topBuckets(rows('technologies')),
      createdPerDay: fillDays(rows('created'), now),
    };
  }

  async updateCrm(id: string, patch: UpdateLeadBody): Promise<Lead | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const now = new Date();
    const set: Record<string, unknown> = {};
    if (patch.leadStatus !== undefined) {
      set.leadStatus = patch.leadStatus;
      if (patch.leadStatus === 'contacted') set.lastContactedAt = now;
    }
    if (patch.tags !== undefined) {
      set.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))];
    }
    const update: Record<string, unknown> = { $set: set };
    if (patch.note !== undefined) update.$push = { notes: { text: patch.note, at: now } };
    const doc = await LeadModel.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
      lean: true,
    });
    return doc ? toLeadDto(doc as unknown as Parameters<typeof toLeadDto>[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await LeadModel.deleteOne({ _id: id });
    return res.deletedCount > 0;
  }
}
