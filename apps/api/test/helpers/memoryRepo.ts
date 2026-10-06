import { randomBytes } from 'node:crypto';
import {
  ANALYSIS_VERSION,
  emptyFeatures,
  emptyPerformance,
  emptyTechnology,
  type AnalysisError,
  type AnalysisStatus,
  type Lead,
  type ListLeadsQuery,
  type Paginated,
} from '@lead/shared';
import type {
  LeadAnalysisUpdate,
  LeadRepository,
  ManualLeadInput,
} from '../../src/services/leadRepository.js';

export function makeLead(over: Partial<Lead> = {}): Lead {
  const now = new Date();
  return {
    id: randomBytes(12).toString('hex'),
    placeId: null,
    businessName: 'Test Rentals',
    address: null,
    city: null,
    country: null,
    latitude: null,
    longitude: null,
    googleMapsUri: null,
    businessStatus: null,
    primaryType: null,
    types: [],
    rating: null,
    reviewCount: null,
    priceLevel: null,
    phone: null,
    website: null,
    email: null,
    emailSourceUrl: null,
    instagramUrl: null,
    facebookUrl: null,
    sourceType: 'manual',
    searchQueryId: null,
    technology: emptyTechnology(),
    performance: emptyPerformance(),
    features: emptyFeatures(),
    websiteQuality: 'unknown',
    qualityReasons: [],
    isHttps: null,
    isMobileFriendly: null,
    lastModifiedHint: null,
    copyrightYear: null,
    finalUrl: null,
    httpStatus: null,
    screenshotPath: null,
    analysisStatus: 'pending',
    analysisErrors: [],
    stageDurations: [],
    analyzedAt: null,
    analysisVersion: 0,
    score: null,
    priority: null,
    scoreConfidence: null,
    scoreNotes: [],
    scoreBreakdown: [],
    opportunities: [],
    outreachAngle: null,
    outreachGeneratedAt: null,
    leadStatus: 'new',
    notes: [],
    lastContactedAt: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** In-memory LeadRepository used by route, processor and orchestrator tests. */
export class MemoryLeadRepository implements LeadRepository {
  leads = new Map<string, Lead & { websiteKey?: string }>();
  statusLog: Array<[string, AnalysisStatus]> = [];

  async findById(id: string) {
    return this.leads.get(id) ?? null;
  }
  async upsertManual(input: ManualLeadInput) {
    const existing = [...this.leads.values()].find((l) => l.websiteKey === input.websiteKey);
    if (existing) {
      Object.assign(existing, {
        businessName: input.businessName,
        website: input.website,
        ...(input.city ? { city: input.city } : {}),
      });
      return { lead: existing, created: false };
    }
    const lead = {
      ...makeLead({
        businessName: input.businessName,
        website: input.website,
        city: input.city ?? null,
        rating: input.rating ?? null,
        reviewCount: input.reviewCount ?? null,
      }),
      websiteKey: input.websiteKey,
    };
    this.leads.set(lead.id, lead);
    return { lead, created: true };
  }
  async list(q: ListLeadsQuery): Promise<Paginated<Lead>> {
    const items = [...this.leads.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const page = items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    return {
      items: page,
      page: q.page,
      pageSize: q.pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / q.pageSize),
    };
  }
  private set(id: string, patch: Partial<Lead>) {
    const l = this.leads.get(id);
    if (l) Object.assign(l, patch);
    if (patch.analysisStatus) this.statusLog.push([id, patch.analysisStatus]);
  }
  async markAnalyzing(id: string) {
    this.set(id, { analysisStatus: 'analyzing' });
  }
  async setPending(id: string) {
    this.set(id, { analysisStatus: 'pending' });
  }
  async saveAnalysis(id: string, update: LeadAnalysisUpdate) {
    this.set(id, { ...update, analysisVersion: update.analysisVersion ?? ANALYSIS_VERSION });
  }
  async recordFailure(id: string, status: AnalysisStatus, error: AnalysisError) {
    const l = this.leads.get(id);
    this.set(id, { analysisStatus: status, analysisErrors: [...(l?.analysisErrors ?? []), error] });
  }
}
