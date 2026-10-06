import type { ListLeadsQuery } from '@lead/shared';

type Filter = Record<string, unknown>;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pure: translate validated list query params into a MongoDB filter. */
export function buildLeadFilter(q: ListLeadsQuery): Filter {
  const f: Filter = {};
  if (q.priority) f.priority = q.priority;
  if (q.city) f.city = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
  if (q.status) f.analysisStatus = q.status;
  if (q.leadStatus) f.leadStatus = q.leadStatus;
  if (q.technology)
    f['technology.detectedSignatures.name'] = new RegExp(`^${escapeRegex(q.technology)}$`, 'i');
  if (q.bookingStatus) f['features.onlineBooking.bookingQuality'] = q.bookingStatus;
  if (q.whatsapp) f['features.whatsapp.status'] = q.whatsapp;
  if (q.minScore !== undefined) f.score = { $gte: q.minScore };
  if (q.maxMobileScore !== undefined) f['performance.mobileScore'] = { $lte: q.maxMobileScore };
  if (q.minReviews !== undefined) f.reviewCount = { $gte: q.minReviews };
  if (q.hasWebsite !== undefined)
    f.website = q.hasWebsite ? { $nin: [null, ''] } : { $in: [null, ''] };
  if (q.search) f.$text = { $search: q.search };
  return f;
}

const SORT_FIELD: Record<ListLeadsQuery['sort'], string> = {
  score: 'score',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  reviewCount: 'reviewCount',
  rating: 'rating',
  mobileScore: 'performance.mobileScore',
  businessName: 'businessName',
};

export function buildLeadSort(q: ListLeadsQuery): Record<string, 1 | -1> {
  const dir = q.order === 'asc' ? 1 : -1;
  // _id tiebreaker keeps pagination stable.
  return { [SORT_FIELD[q.sort]]: dir, _id: dir };
}
