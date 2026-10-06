import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const PageSpeedCacheSchema = new Schema({
  url: { type: String, required: true },
  strategy: { type: String, enum: ['mobile', 'desktop'], required: true },
  result: { type: Schema.Types.Mixed, required: true },
  /** Mongo TTL monitor deletes the entry at this time. */
  expiresAt: { type: Date, required: true },
});
PageSpeedCacheSchema.index({ url: 1, strategy: 1 }, { unique: true });
PageSpeedCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PageSpeedCacheShape = InferSchemaType<typeof PageSpeedCacheSchema>;
export const PageSpeedCacheModel: Model<PageSpeedCacheShape> =
  (mongoose.models.PageSpeedCache as Model<PageSpeedCacheShape> | undefined) ??
  mongoose.model('PageSpeedCache', PageSpeedCacheSchema);
