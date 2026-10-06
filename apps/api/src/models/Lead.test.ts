import { describe, expect, it } from 'vitest';
import { LeadModel, toLeadDto } from './Lead.js';

/** Offline schema checks (no database connection needed). */
describe('Lead model', () => {
  it('applies tri-state "unknown" defaults and validates', () => {
    const doc = new LeadModel({ businessName: 'Acme' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.features?.whatsapp?.status).toBe('unknown');
    expect(doc.get('features.onlineBooking.bookingQuality')).toBe('unknown');
    expect(doc.features?.aiAssistant?.status).toBe('unknown');
    expect(doc.analysisStatus).toBe('pending');
    expect(doc.leadStatus).toBe('new');
    expect(doc.priority).toBeNull();
    expect(doc.performance?.inpSource).toBeNull();
  });

  it('rejects values outside the enums', () => {
    const doc = new LeadModel({
      businessName: 'Acme',
      priority: 'urgent',
      features: { whatsapp: { status: 'maybe' } },
    });
    const err = doc.validateSync();
    expect(Object.keys(err?.errors ?? {})).toEqual(
      expect.arrayContaining(['priority', 'features.whatsapp.status']),
    );
  });

  it('requires a business name', () => {
    expect(new LeadModel({}).validateSync()?.errors.businessName).toBeDefined();
  });

  it('declares a partial unique index on placeId and a text index', () => {
    const indexes = LeadModel.schema.indexes();
    const placeId = indexes.find(([fields]) => 'placeId' in fields);
    expect(placeId?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { placeId: { $type: 'string' } },
    });
    expect(indexes.some(([fields]) => Object.values(fields).includes('text'))).toBe(true);
  });

  it('serialises to the shared wire shape', () => {
    const doc = new LeadModel({ businessName: 'Acme', websiteKey: 'acme.com' });
    const json = doc.toJSON() as Record<string, unknown>;
    expect(json.id).toBe(String(doc._id));
    expect(json._id).toBeUndefined();
    expect(json.websiteKey).toBeUndefined();
    const dto = toLeadDto(doc.toObject() as unknown as Parameters<typeof toLeadDto>[0]);
    expect(dto.id).toBe(String(doc._id));
    expect('websiteKey' in dto).toBe(false);
  });
});
