import { describe, expect, it } from 'vitest';
import { fixtureAssets } from '../../test/fixtures.js';
import {
  detectContactForm,
  findBusinessEmails,
  findCallToAction,
  findCopyrightYear,
  findLastModifiedHint,
  findSocialLinks,
} from './siteSignals.js';

describe('siteSignals', () => {
  const wp = fixtureAssets('wordpress-elementor.html', 'https://sunshinecarrental.com/');

  it('finds a Contact Form 7 form', () => {
    const r = detectContactForm(
      { static: wp, staticComplete: true, rendered: wp },
      { contactPageInspected: null },
    );
    expect(r.status).toBe('yes');
    expect(r.evidence).toContain('name, email, phone, message');
  });

  it('a search box is not a contact form', () => {
    const page = fixtureAssets('no-booking.html');
    expect(
      detectContactForm(
        { static: page, staticComplete: true, rendered: page },
        { contactPageInspected: null },
      ).status,
    ).toBe('no');
  });

  it('unknown when not rendered, or when a contact page could not be inspected', () => {
    const page = fixtureAssets('no-booking.html');
    expect(
      detectContactForm(
        { static: page, staticComplete: true, rendered: null },
        { contactPageInspected: null },
      ).status,
    ).toBe('unknown');
    expect(
      detectContactForm(
        { static: page, staticComplete: true, rendered: page },
        { contactPageInspected: false },
      ).status,
    ).toBe('unknown');
  });

  it('social links skip share links', () => {
    expect(findSocialLinks([wp])).toEqual({
      instagramUrl: 'https://www.instagram.com/sunshinecarrental/',
      facebookUrl: 'https://www.facebook.com/SunshineCarRentalOrlando',
    });
  });

  it('only emails on the business domain', () => {
    const page = {
      ...wp,
      bodyText: `${wp.bodyText} webmaster@agency-example.com sales@sunshinecarrental.com`,
    };
    expect(
      findBusinessEmails([page], 'https://www.sunshinecarrental.com/').map((e) => e.email),
    ).toEqual(['info@sunshinecarrental.com', 'sales@sunshinecarrental.com']);
  });

  it('copyright year: picks the latest year in a range and ignores implausible years', () => {
    const now = new Date('2026-06-01');
    expect(findCopyrightYear('© 2018 Sunshine', now)).toBe(2018);
    expect(findCopyrightYear('Copyright © 2016 - 2023 Kent', now)).toBe(2023);
    expect(findCopyrightYear('© 1888 history', now)).toBeNull();
    expect(findCopyrightYear('no notice here 2020', now)).toBeNull();
  });

  it('last modified hint ignores "now" headers', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(findLastModifiedHint(null, { 'last-modified': now.toUTCString() }, now)).toBeNull();
    expect(
      findLastModifiedHint(null, { 'last-modified': 'Tue, 02 Mar 2021 10:00:00 GMT' }, now),
    ).toBe('Last-Modified header 2021-03-02');
  });

  it('call to action', () => {
    expect(findCallToAction([wp])).toMatch(/Call Now/);
  });
});
