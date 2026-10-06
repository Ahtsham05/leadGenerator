import { describe, expect, it } from 'vitest';
import { fixtureAssets } from '../../../test/fixtures.js';
import { detectTechnologies, summarizeTechnology } from './techDetector.js';

const detect = (name: string, headers: Record<string, string> = {}, setCookies: string[] = []) =>
  detectTechnologies({ assets: fixtureAssets(name, 'https://site.example/'), headers, setCookies });
const names = (sigs: ReturnType<typeof detect>) => sigs.map((s) => s.name).sort();

describe('techDetector', () => {
  it('WordPress + Elementor + GA + Pixel with exact evidence', () => {
    const sigs = detect(
      'wordpress-elementor.html',
      { server: 'cloudflare', 'cf-ray': '8a1b2c-MIA' },
      ['__cf_bm=abc; path=/'],
    );
    expect(names(sigs)).toEqual(
      expect.arrayContaining([
        'WordPress',
        'Elementor',
        'Google Analytics',
        'Facebook Pixel',
        'Cloudflare',
      ]),
    );
    const wp = sigs.find((s) => s.name === 'WordPress');
    expect(wp?.evidence).toBe('meta generator="WordPress 6.4.3"');
    expect(sigs.find((s) => s.name === 'Cloudflare')?.evidence).toBe(
      'response header server: cloudflare',
    );
    const t = summarizeTechnology(sigs);
    expect(t).toMatchObject({ cms: 'WordPress', builder: 'Elementor', cdn: 'Cloudflare' });
    expect(t.analytics).toEqual(expect.arrayContaining(['Google Analytics', 'Facebook Pixel']));
  });

  it('Wix', () => {
    const t = summarizeTechnology(detect('wix.html'));
    expect(t.builder).toBe('Wix');
    expect(t.hosting).toBe('Wix');
    expect(t.detectedSignatures.find((s) => s.name === 'Wix')?.evidence).toBe(
      'meta generator="Wix.com Website Builder"',
    );
  });

  it('Squarespace + Stripe', () => {
    const t = summarizeTechnology(detect('tidio-squarespace.html'));
    expect(t.builder).toBe('Squarespace');
    expect(t.paymentProviders).toEqual(['Stripe']);
  });

  it('Next.js implies React; Klaviyo is marketing', () => {
    const sigs = detect('booking-form.html', { 'x-vercel-id': 'iad1::abc', server: 'Vercel' });
    const t = summarizeTechnology(sigs);
    expect(t.framework).toBe('Next.js');
    expect(t.hosting).toBe('Vercel');
    expect(sigs.find((s) => s.name === 'React')?.evidence).toBe('implied by Next.js');
    expect(sigs.find((s) => s.name === 'Klaviyo')?.category).toBe('marketing');
  });

  it('GoDaddy Website Builder', () => {
    expect(summarizeTechnology(detect('no-booking.html')).builder).toBe('GoDaddy Website Builder');
  });

  it('GTM detected from inline loader', () => {
    expect(names(detect('whatsapp.html'))).toContain('Google Tag Manager');
  });

  it('does not report technologies that are absent', () => {
    expect(names(detect('no-booking.html'))).not.toContain('WordPress');
    expect(names(detect('wix.html'))).not.toContain('Shopify');
  });

  it('headers-only detections: Netlify, Shopify', () => {
    const empty = fixtureAssets('no-booking.html');
    const sigs = detectTechnologies({
      assets: { ...empty, scriptSrcs: [], metas: [], html: '' },
      headers: { server: 'Netlify', 'x-shopid': '123' },
      setCookies: [],
    });
    expect(names(sigs)).toEqual(['Netlify', 'Shopify']);
  });
});
