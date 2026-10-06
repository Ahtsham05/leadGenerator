import { describe, expect, it } from 'vitest';
import { emptyFeatures, type Features } from '../lead.js';
import { NICHE_PROFILES } from '../niche.js';
import { buildOpportunities, type OpportunityInput } from './opportunities.js';

function input(
  over: Partial<OpportunityInput> & { f?: (f: Features) => void } = {},
): OpportunityInput {
  const features = emptyFeatures();
  over.f?.(features);
  return {
    website: 'https://example.com',
    websiteQuality: 'average',
    isHttps: true,
    isMobileFriendly: true,
    technology: { cms: null, builder: null },
    performance: { performanceStatus: 'ok', mobileScore: 90, lcpMs: 1200 },
    features,
    ...over,
  };
}

describe('buildOpportunities', () => {
  it('no booking + slow mobile + WordPress => modern rental website', () => {
    const ops = buildOpportunities(
      input({
        technology: { cms: 'WordPress', builder: 'Elementor' },
        performance: { performanceStatus: 'ok', mobileScore: 31, lcpMs: 6000 },
        f: (f) => {
          f.onlineBooking.bookingQuality = 'none';
          f.onlineBooking.evidence = 'No booking path found';
        },
      }),
    );
    const op = ops.find((o) => o.title === 'Modern rental website with online booking');
    expect(op).toBeDefined();
    expect(op?.evidence).toEqual(
      expect.arrayContaining([
        'No booking path found',
        'PageSpeed mobile score 31/100',
        'Site built with WordPress (Elementor)',
      ]),
    );
  });

  it('no WhatsApp => WhatsApp automation', () => {
    const ops = buildOpportunities(
      input({ f: (f) => (f.whatsapp = { status: 'no', evidence: 'none found' }) }),
    );
    expect(ops.map((o) => o.serviceType)).toContain('whatsapp');
  });

  it('chatbot "no" => AI assistant, but unknown produces nothing', () => {
    const yes = buildOpportunities(
      input({ f: (f) => (f.chatbot = { status: 'no', evidence: 'x', chatbotProvider: null }) }),
    );
    expect(yes.find((o) => o.serviceType === 'aiAssistant')?.title).toMatch(
      /^AI assistant for common rental questions/,
    );
    const unknown = buildOpportunities(input());
    expect(unknown).toEqual([]);
  });

  it('existing widget with unknown AI => phrased as upgrade, not as a claim', () => {
    const ops = buildOpportunities(
      input({
        f: (f) => {
          f.chatbot = { status: 'yes', evidence: 'Tidio script', chatbotProvider: 'Tidio' };
          f.aiAssistant = { status: 'unknown', evidence: null };
        },
      }),
    );
    expect(ops[0]?.title).toBe('AI answers for the existing chat widget');
  });

  it('no website => professional website', () => {
    const ops = buildOpportunities(input({ website: null, websiteQuality: 'none' }));
    expect(ops[0]?.serviceType).toBe('website');
  });

  it('uses the niche vocabulary', () => {
    const ops = buildOpportunities(
      input({ website: null, websiteQuality: 'none' }),
      NICHE_PROFILES.generic,
    );
    expect(ops[0]?.title).toBe('Professional business website with online booking');
  });

  it('every opportunity carries evidence', () => {
    const ops = buildOpportunities(
      input({
        f: (f) => {
          f.onlineBooking.bookingQuality = 'basic';
          f.whatsapp.status = 'no';
          f.chatbot.status = 'no';
          f.onlinePayment.status = 'no';
          f.contactForm.status = 'yes';
          f.automatedFollowUp.status = 'no';
        },
      }),
    );
    expect(ops.length).toBe(5);
    for (const o of ops) expect(o.evidence.length).toBeGreaterThan(0);
  });
});
