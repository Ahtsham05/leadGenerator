import mongoose, { Schema, type InferSchemaType, type Model, type Types } from 'mongoose';
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
  type Lead,
} from '@lead/shared';

const str = { type: String, default: null };
const num = { type: Number, default: null };
const triState = { type: String, enum: TRI_STATES, default: 'unknown' };

const signal = (extra: Record<string, unknown> = {}) =>
  new Schema({ status: triState, evidence: str, ...extra }, { _id: false });

const FeaturesSchema = new Schema(
  {
    onlineBooking: {
      type: signal({
        bookingQuality: { type: String, enum: BOOKING_QUALITIES, default: 'unknown' },
        platforms: { type: [String], default: [] },
        bookingUrl: str,
      }),
      default: () => ({}),
    },
    whatsapp: { type: signal(), default: () => ({}) },
    chatbot: { type: signal({ chatbotProvider: str }), default: () => ({}) },
    liveChat: { type: signal(), default: () => ({}) },
    onlinePayment: { type: signal(), default: () => ({}) },
    contactForm: { type: signal(), default: () => ({}) },
    automatedFollowUp: { type: signal(), default: () => ({}) },
    aiAssistant: {
      type: new Schema(
        { status: { type: String, enum: AI_ASSISTANT_STATES, default: 'unknown' }, evidence: str },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { _id: false },
);

const TechnologySchema = new Schema(
  {
    framework: str,
    cms: str,
    builder: str,
    ecommerce: str,
    hosting: str,
    cdn: str,
    analytics: { type: [String], default: [] },
    paymentProviders: { type: [String], default: [] },
    detectedSignatures: {
      type: [
        new Schema(
          { name: String, category: { type: String, enum: TECH_CATEGORIES }, evidence: String },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const PerformanceSchema = new Schema(
  {
    mobileScore: num,
    desktopScore: num,
    lcpMs: num,
    inpMs: num,
    inpSource: { type: String, enum: ['inp', 'tbt', null], default: null },
    cls: num,
    ttfbMs: num,
    desktopLcpMs: num,
    performanceStatus: { type: String, enum: PERFORMANCE_STATUSES, default: 'unavailable' },
    performanceError: str,
    fetchedAt: { type: Date, default: null },
  },
  { _id: false },
);

const LeadMongooseSchema = new Schema(
  {
    placeId: { type: String, default: null },
    businessName: { type: String, required: true, trim: true },
    address: str,
    city: str,
    country: str,
    latitude: num,
    longitude: num,
    googleMapsUri: str,
    businessStatus: str,
    primaryType: str,
    types: { type: [String], default: [] },
    rating: num,
    reviewCount: num,
    priceLevel: str,
    phone: str,
    website: str,
    /** Normalised host+path used to find an existing lead for the same website. */
    websiteKey: str,
    email: str,
    emailSourceUrl: str,
    instagramUrl: str,
    facebookUrl: str,
    sourceType: { type: String, enum: SOURCE_TYPES, default: 'manual' },
    searchQueryId: { type: Schema.Types.ObjectId, ref: 'SearchQuery', default: null },

    technology: { type: TechnologySchema, default: () => ({}) },
    performance: { type: PerformanceSchema, default: () => ({}) },
    features: { type: FeaturesSchema, default: () => ({}) },

    websiteQuality: { type: String, enum: WEBSITE_QUALITIES, default: 'unknown' },
    qualityReasons: { type: [String], default: [] },
    isHttps: { type: Boolean, default: null },
    isMobileFriendly: { type: Boolean, default: null },
    lastModifiedHint: str,
    copyrightYear: num,
    finalUrl: str,
    httpStatus: num,
    screenshotPath: str,

    analysisStatus: { type: String, enum: ANALYSIS_STATUSES, default: 'pending' },
    analysisErrors: {
      type: [new Schema({ stage: String, message: String, at: Date }, { _id: false })],
      default: [],
    },
    stageDurations: {
      type: [
        new Schema({ stage: { type: String, enum: ANALYSIS_STAGES }, ms: Number }, { _id: false }),
      ],
      default: [],
    },
    analyzedAt: { type: Date, default: null },
    analysisVersion: { type: Number, default: 0 },

    score: num,
    priority: { type: String, enum: [...PRIORITIES, null], default: null },
    scoreConfidence: num,
    scoreNotes: { type: [String], default: [] },
    scoreBreakdown: {
      type: [
        new Schema(
          { rule: String, category: String, points: Number, evidence: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    opportunities: {
      type: [
        new Schema(
          {
            title: String,
            serviceType: { type: String, enum: SERVICE_TYPES },
            reason: String,
            evidence: [String],
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    outreachAngle: str,
    outreachGeneratedAt: { type: Date, default: null },

    leadStatus: { type: String, enum: LEAD_STATUSES, default: 'new' },
    notes: { type: [new Schema({ text: String, at: Date }, { _id: false })], default: [] },
    lastContactedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
  },
  { timestamps: true, minimize: false },
);

// Unique only when a placeId exists (manual/CSV leads have none).
LeadMongooseSchema.index(
  { placeId: 1 },
  { unique: true, partialFilterExpression: { placeId: { $type: 'string' } } },
);
LeadMongooseSchema.index({ websiteKey: 1 });
// Filterable fields, each paired with the default score sort.
LeadMongooseSchema.index({ score: -1, _id: -1 });
LeadMongooseSchema.index({ priority: 1, score: -1 });
LeadMongooseSchema.index({ city: 1, score: -1 });
LeadMongooseSchema.index({ analysisStatus: 1, score: -1 });
LeadMongooseSchema.index({ leadStatus: 1, score: -1 });
LeadMongooseSchema.index({ 'technology.detectedSignatures.name': 1 });
LeadMongooseSchema.index({ 'features.onlineBooking.bookingQuality': 1, score: -1 });
LeadMongooseSchema.index({ 'features.whatsapp.status': 1, score: -1 });
LeadMongooseSchema.index({ 'performance.mobileScore': 1 });
LeadMongooseSchema.index({ reviewCount: -1 });
LeadMongooseSchema.index({ websiteQuality: 1 });
LeadMongooseSchema.index({ tags: 1 });
LeadMongooseSchema.index({ searchQueryId: 1 });
LeadMongooseSchema.index(
  { businessName: 'text', city: 'text', address: 'text' },
  { weights: { businessName: 5, city: 2, address: 1 } },
);

LeadMongooseSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.websiteKey;
    if (ret.searchQueryId) ret.searchQueryId = String(ret.searchQueryId);
    return ret;
  },
});

export type LeadDocShape = InferSchemaType<typeof LeadMongooseSchema>;
export type LeadModelType = Model<LeadDocShape>;

export const LeadModel: LeadModelType =
  (mongoose.models.Lead as LeadModelType | undefined) ?? mongoose.model('Lead', LeadMongooseSchema);

/** Convert a lean document into the shared wire type. */
export function toLeadDto(doc: Record<string, unknown> & { _id: Types.ObjectId | string }): Lead {
  const { _id, __v: _v, websiteKey: _wk, searchQueryId, ...rest } = doc;
  return {
    ...(rest as unknown as Omit<Lead, 'id' | 'searchQueryId'>),
    id: String(_id),
    searchQueryId: searchQueryId ? String(searchQueryId) : null,
  };
}
