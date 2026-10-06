import { classifyBooking, type BookingClassification } from './bookingClassifier.js';
import { inspectSite, type SiteInspection, type SiteInspectorOptions } from './siteInspector.js';

export interface BookingDetectorResult {
  booking: BookingClassification;
  inspection: SiteInspection | null;
  error: string | null;
}

/**
 * Playwright-backed booking detection: inspect the site, then classify (pure).
 * Never throws; a browser failure yields bookingQuality "unknown".
 */
export async function detectBooking(
  url: string,
  leadId: string,
  opts: SiteInspectorOptions,
): Promise<BookingDetectorResult> {
  try {
    const inspection = await inspectSite(url, leadId, opts);
    return {
      booking: classifyBooking(inspection.observation),
      inspection,
      error: inspection.homepage.error,
    };
  } catch (err) {
    const message =
      err instanceof Error ? (err.message.split('\n')[0] ?? 'browser failure') : String(err);
    return {
      booking: {
        status: 'unknown',
        bookingQuality: 'unknown',
        evidence: `Browser inspection failed: ${message}`,
        platforms: [],
        bookingUrl: null,
      },
      inspection: null,
      error: message,
    };
  }
}
