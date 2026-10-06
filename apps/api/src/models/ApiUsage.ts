import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const API_SERVICES = ['places', 'pagespeed', 'anthropic'] as const;
export type ApiService = (typeof API_SERVICES)[number];

/** One document per (UTC day, service). `date` is "YYYY-MM-DD". */
const ApiUsageSchema = new Schema({
  date: { type: String, required: true },
  service: { type: String, enum: API_SERVICES, required: true },
  count: { type: Number, default: 0 },
});
ApiUsageSchema.index({ date: 1, service: 1 }, { unique: true });

export type ApiUsageShape = InferSchemaType<typeof ApiUsageSchema>;
export const ApiUsageModel: Model<ApiUsageShape> =
  (mongoose.models.ApiUsage as Model<ApiUsageShape> | undefined) ??
  mongoose.model('ApiUsage', ApiUsageSchema);
