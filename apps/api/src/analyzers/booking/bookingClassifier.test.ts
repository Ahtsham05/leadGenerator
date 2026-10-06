import { describe, expect, it } from 'vitest';
import { fixtureAssets } from '../../../test/fixtures.js';
import {
  classifyBooking,
  type BookingObservation,
  type InspectedPage,
} from './bookingClassifier.js';

const page = (
  name: string,
  role: InspectedPage['role'] = 'homepage',
  extra: Partial<InspectedPage> = {},
): InspectedPage => {
  const url = `https://site.example/${role === 'homepage' ? '' : role}`;
  return {
    url,
    role,
    assets: fixtureAssets(name, url),
    frames: [],
    uninspectableFrames: [],
    loginWall: false,
    ...extra,
  };
};
const obs = (
  pages: InspectedPage[],
  extra: Partial<BookingObservation> = {},
): BookingObservation => ({
  homepageInspected: true,
  homepageBlocked: false,
  homepageError: null,
  complete: true,
  pages,
  ...extra,
});

describe('classifyBooking', () => {
  it('good: dates + vehicle selection + customer details', () => {
    const r = classifyBooking(obs([page('no-booking.html'), page('booking-form.html', 'booking')]));
    expect(r.bookingQuality).toBe('good');
    expect(r.status).toBe('yes');
    expect(r.evidence).toMatch(/date, pickup\/return location, vehicle selection, customer detail/);
    expect(r.bookingUrl).toBe('https://site.example/booking');
  });

  it('basic: quote form without live availability', () => {
    const r = classifyBooking(obs([page('wix.html')]));
    expect(r.bookingQuality).toBe('basic');
    expect(r.evidence).toMatch(/Request\/quote form/);
  });

  it('none: only call / contact', () => {
    const r = classifyBooking(obs([page('no-booking.html')]));
    expect(r.bookingQuality).toBe('none');
    expect(r.status).toBe('no');
  });

  it('a plain contact form is still "none"', () => {
    expect(classifyBooking(obs([page('wordpress-elementor.html')])).bookingQuality).toBe('none');
  });

  it('good: known live rental platform in an iframe', () => {
    const r = classifyBooking(
      obs([page('no-booking.html'), page('rentcentric-booking.html', 'booking')]),
    );
    expect(r.bookingQuality).toBe('good');
    expect(r.platforms).toEqual(['Rent Centric']);
    expect(r.evidence).toContain('booking.rentcentric.com');
  });

  it('basic: appointment scheduler link', () => {
    const home = page('no-booking.html');
    home.assets.anchors.push({
      href: 'https://calendly.com/joes/rental',
      url: 'https://calendly.com/joes/rental',
      text: 'Schedule',
    });
    expect(classifyBooking(obs([home]))).toMatchObject({
      bookingQuality: 'basic',
      platforms: ['Calendly'],
    });
  });

  it('good: Turo marketplace link is flagged as off-site', () => {
    const home = page('no-booking.html');
    home.assets.anchors.push({
      href: 'https://turo.com/us/en/drivers/123',
      url: 'https://turo.com/us/en/drivers/123',
      text: 'Book us on Turo',
    });
    const r = classifyBooking(obs([home]));
    expect(r.bookingQuality).toBe('good');
    expect(r.evidence).toMatch(/marketplace/);
  });

  it('unknown: blocked, not inspected, login wall, opaque frame, incomplete', () => {
    expect(classifyBooking(obs([], { homepageBlocked: true })).bookingQuality).toBe('unknown');
    expect(classifyBooking(obs([], { homepageInspected: false })).bookingQuality).toBe('unknown');
    expect(
      classifyBooking(
        obs([page('no-booking.html'), page('no-booking.html', 'booking', { loginWall: true })]),
      ).evidence,
    ).toMatch(/requires login/);
    expect(
      classifyBooking(
        obs([
          page('no-booking.html', 'homepage', {
            uninspectableFrames: ['https://widget.example/x'],
          }),
        ]),
      ).bookingQuality,
    ).toBe('unknown');
    expect(
      classifyBooking(obs([page('no-booking.html')], { complete: false })).bookingQuality,
    ).toBe('unknown');
  });
});
