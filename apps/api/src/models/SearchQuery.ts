import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const SearchQuerySchema = new Schema(
  {
    niche: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    textQuery: { type: String, required: true },
    resultsCount: { type: Number, default: 0 },
    placesRequestsUsed: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
SearchQuerySchema.index({ createdAt: -1 });

export type SearchQueryShape = InferSchemaType<typeof SearchQuerySchema>;
export const SearchQueryModel: Model<SearchQueryShape> =
  (mongoose.models.SearchQuery as Model<SearchQueryShape> | undefined) ??
  mongoose.model('SearchQuery', SearchQuerySchema);
