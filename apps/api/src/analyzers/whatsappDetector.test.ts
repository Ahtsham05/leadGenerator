import { describe, expect, it } from 'vitest';
import { fixtureAssets } from '../../test/fixtures.js';
import { detectWhatsapp } from './whatsappDetector.js';

describe('whatsappDetector', () => {
  it('finds a wa.me link with exact evidence', () => {
    const r = detectWhatsapp({
      static: fixtureAssets('whatsapp.html'),
      staticComplete: true,
      rendered: null,
    });
    expect(r.status).toBe('yes');
    expect(r.evidence).toContain('https://wa.me/447700900123');
  });

  it('returns "no" when the complete page was analysed and nothing found', () => {
    const page = fixtureAssets('wordpress-elementor.html');
    const r = detectWhatsapp({ static: page, staticComplete: true, rendered: page });
    expect(r.status).toBe('no');
  });

  it('returns "unknown" when static is incomplete and nothing rendered', () => {
    const r = detectWhatsapp({
      static: fixtureAssets('wordpress-elementor.html'),
      staticComplete: false,
      rendered: null,
    });
    expect(r.status).toBe('unknown');
  });

  it('returns "unknown" for GTM sites when the rendered page is unavailable', () => {
    const page = fixtureAssets('whatsapp.html');
    const noLink = { ...page, anchors: page.anchors.filter((a) => !a.href.includes('wa.me')) };
    const r = detectWhatsapp({ static: noLink, staticComplete: true, rendered: null });
    expect(r.status).toBe('unknown');
    expect(r.evidence).toMatch(/Tag Manager/);
  });

  it('detects widget plugins', () => {
    const page = fixtureAssets('wordpress-elementor.html');
    const withPlugin = {
      ...page,
      scriptSrcs: [
        ...page.scriptSrcs,
        'https://x.com/wp-content/plugins/creame-whatsapp-me/public/js/joinchat.min.js',
      ],
    };
    const r = detectWhatsapp({ static: withPlugin, staticComplete: true, rendered: null });
    expect(r).toMatchObject({ status: 'yes', provider: 'Joinchat (WordPress)' });
  });

  it('finds links only present in the rendered DOM', () => {
    const page = fixtureAssets('wordpress-elementor.html');
    const rendered = {
      ...page,
      anchors: [
        ...page.anchors,
        {
          href: 'https://api.whatsapp.com/send?phone=14075550100',
          url: 'https://api.whatsapp.com/send?phone=14075550100',
          text: '',
        },
      ],
    };
    const r = detectWhatsapp({ static: page, staticComplete: true, rendered });
    expect(r.status).toBe('yes');
    expect(r.evidence).toContain('rendered page');
  });
});
