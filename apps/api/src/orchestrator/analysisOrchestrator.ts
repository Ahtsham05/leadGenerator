import {
  ANALYSIS_VERSION,
  buildOpportunities,
  emptyFeatures,
  emptyPerformance,
  emptyTechnology,
  getNicheProfile,
  scoreLead,
  type AnalysisStatus,
  type DetectedSignature,
  type Features,
  type Lead,
  type Performance,
  type ScoringWeights,
} from '@lead/shared';
import type { BookingDetectorResult } from '../analyzers/booking/bookingDetector.js';
import { BOOKING_PLATFORMS } from '../analyzers/booking/bookingPlatforms.js';
import { detectChatbot } from '../analyzers/chatbotDetector.js';
import type { DetectionContext } from '../analyzers/detectionContext.js';
import type { FetchPageResult } from '../analyzers/fetchPage.js';
import { extractAssets, type PageAssets } from '../analyzers/html/extractAssets.js';
import type { PageSpeedAnalysis } from '../analyzers/pageSpeedAnalyzer.js';
import {
  detectContactForm,
  detectPaymentFields,
  findBusinessEmails,
  findCallToAction,
  findCopyrightYear,
  findLastModifiedHint,
  findSocialLinks,
} from '../analyzers/siteSignals.js';
import { summarizeTechnology, type TechDetectionProvider } from '../analyzers/tech/techDetector.js';
import { detectWhatsapp } from '../analyzers/whatsappDetector.js';
import { classifyWebsiteQuality } from '../analyzers/websiteQualityClassifier.js';
import { featuresWithoutWebsite, resolveWebsite } from '../analyzers/websiteDiscovery.js';
import type { Logger } from '../lib/logger.js';
import type { LeadAnalysisUpdate } from '../services/leadRepository.js';
import { StageRunner } from './stageRunner.js';

export type AnalysisTarget = Pick<
  Lead,
  | 'id'
  | 'businessName'
  | 'website'
  | 'rating'
  | 'reviewCount'
  | 'types'
  | 'primaryType'
  | 'instagramUrl'
> & {
  nicheId?: string;
};

export interface OrchestratorDeps {
  fetchPage: (url: string, signal?: AbortSignal) => Promise<FetchPageResult>;
  techProvider: TechDetectionProvider;
  pageSpeed: (url: string, signal?: AbortSignal) => Promise<PageSpeedAnalysis>;
  /** Null when the browser is disabled. */
  detectBooking:
    ((url: string, leadId: string, signal?: AbortSignal) => Promise<BookingDetectorResult>) | null;
  scoringWeights?: ScoringWeights;
  logger: Logger;
  now?: () => Date;
}

export interface RunOptions {
  /** On the last attempt we stop asking for retries and record a partial result instead. */
  isFinalAttempt: boolean;
  signal?: AbortSignal;
}

export type OrchestratorOutcome =
  | { kind: 'done'; update: LeadAnalysisUpdate }
  /** Target site rate-limited us (429/503); the queue should back off and retry. */
  | { kind: 'retry'; reason: string };

const CHAT_FOLLOW_UP_PROVIDERS = ['Podium', 'LeadConnector Chat', 'HubSpot Chat'];

function mergeSignatures(...lists: DetectedSignature[][]): DetectedSignature[] {
  const out = new Map<string, DetectedSignature>();
  for (const list of lists) for (const s of list) if (!out.has(s.name)) out.set(s.name, s);
  return [...out.values()];
}

function statusFor(blocked: boolean, errors: number, reachable: boolean): AnalysisStatus {
  if (blocked) return 'blocked';
  if (!reachable) return 'partial';
  return errors > 0 ? 'partial' : 'completed';
}

export class AnalysisOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async run(target: AnalysisTarget, opts: RunOptions): Promise<OrchestratorOutcome> {
    const now = this.deps.now ?? (() => new Date());
    const logger = this.deps.logger.child({ leadId: target.id });
    const stages = new StageRunner(logger, now);
    const niche = getNicheProfile(target.nicheId);

    const site = resolveWebsite(target.website);
    if (!site.hasWebsite) {
      if (site.invalidInput) stages.error('fetchPage', site.reason);
      return {
        kind: 'done',
        update: this.finish(target, stages, niche, {
          features: featuresWithoutWebsite(),
          websiteQuality: 'none',
          qualityReasons: [site.reason],
          noWebsite: true,
        }),
      };
    }

    // ---- 1. Static fetch
    const fetched = await stages.run('fetchPage', () => this.deps.fetchPage(site.url, opts.signal));
    if (fetched?.error) {
      if (fetched.error.code === 'RATE_LIMITED' && !opts.isFinalAttempt) {
        return { kind: 'retry', reason: fetched.error.message };
      }
      stages.error('fetchPage', `${fetched.error.code}: ${fetched.error.message}`);
    }
    const blocked = Boolean(fetched?.blocked);
    const fatal =
      fetched?.error && ['DNS_FAILURE', 'UNSAFE_HOST', 'INVALID_URL'].includes(fetched.error.code);
    const rateLimited = fetched?.error?.code === 'RATE_LIMITED';
    const pageUrl = fetched?.finalUrl ?? site.url;

    if (blocked || fatal || rateLimited) {
      // Blocked by the site (robots, 403, CAPTCHA) or rate-limited after retries: record and move on.
      return {
        kind: 'done',
        update: this.finish(target, stages, niche, {
          features: emptyFeatures(),
          websiteQuality: 'unknown',
          qualityReasons: [fetched?.error?.message ?? 'Website could not be fetched'],
          finalUrl: fetched?.finalUrl ?? null,
          httpStatus: fetched?.status ?? null,
          forcedStatus: blocked || rateLimited ? 'blocked' : 'failed',
        }),
      };
    }

    const staticAssets: PageAssets | null =
      fetched?.ok && fetched.html
        ? await stages.run('techDetector', () => extractAssets(fetched.html ?? '', pageUrl))
        : null;
    const staticComplete = Boolean(fetched?.ok && !fetched.truncated && staticAssets);

    // ---- 2. Slow stages in parallel: PageSpeed and Playwright
    const [psi, booking] = await Promise.all([
      stages.run('pageSpeed', () => this.deps.pageSpeed(pageUrl, opts.signal)),
      this.deps.detectBooking
        ? stages.run('bookingDetector', () =>
            this.deps.detectBooking!(pageUrl, target.id, opts.signal),
          )
        : Promise.resolve(null),
    ]);
    if (psi?.errors.length) for (const e of psi.errors) stages.error('pageSpeed', e);
    if (booking?.error) stages.error('bookingDetector', booking.error);
    if (!this.deps.detectBooking)
      stages.error('bookingDetector', 'Browser inspection disabled (BROWSER_ENABLED=false)');

    const inspection = booking?.inspection ?? null;
    const rendered = inspection?.homepage.assets ?? null;
    const ctx: DetectionContext = {
      static: staticAssets,
      staticComplete,
      rendered,
      extraPages: inspection?.extraPages ?? [],
    };
    const allPages = [staticAssets, rendered, ...(ctx.extraPages ?? [])].filter(
      (p): p is PageAssets => p !== null,
    );
    const headers = fetched?.headers ?? {};
    const setCookies = fetched?.setCookies ?? [];

    // ---- 3. Technology (static + rendered + linked pages)
    const signatures =
      (await stages.run('techDetector', async () => {
        const lists = await Promise.all(
          allPages.map((assets) => this.deps.techProvider.detect({ assets, headers, setCookies })),
        );
        return mergeSignatures(...lists);
      })) ?? [];

    // ---- 4. Presence detectors
    const features = emptyFeatures();
    const whatsapp = await stages.run('whatsappDetector', () => detectWhatsapp(ctx));
    if (whatsapp) features.whatsapp = { status: whatsapp.status, evidence: whatsapp.evidence };
    const chat = await stages.run('chatbotDetector', () => detectChatbot(ctx));
    if (chat) {
      features.chatbot = chat.chatbot;
      features.liveChat = chat.liveChat;
      features.aiAssistant = chat.aiAssistant;
    }
    if (booking) {
      features.onlineBooking = {
        status: booking.booking.status,
        evidence: booking.booking.evidence,
        bookingQuality: booking.booking.bookingQuality,
        platforms: booking.booking.platforms,
        bookingUrl: booking.booking.bookingUrl,
      };
    }

    const extraSigs: DetectedSignature[] = [
      ...(chat?.providers ?? []).map((name) => ({
        name,
        category: 'chat' as const,
        evidence: features.chatbot.evidence ?? 'chat widget',
      })),
      ...(booking?.booking.platforms ?? []).map((name) => ({
        name,
        category: 'booking' as const,
        evidence: booking?.booking.evidence ?? 'booking platform',
      })),
      ...(whatsapp?.provider
        ? [{ name: whatsapp.provider, category: 'chat' as const, evidence: whatsapp.evidence }]
        : []),
    ];
    const technology = summarizeTechnology(mergeSignatures(signatures, extraSigs));

    const site2 = await stages.run('siteSignals', () => {
      const fullyAnalysed = staticComplete && rendered !== null;
      const contactForm = detectContactForm(ctx, {
        contactPageInspected: inspection?.contactPageInspected ?? null,
      });
      const paymentFields = detectPaymentFields(allPages);
      const livePlatform = (booking?.booking.platforms ?? []).some((n) =>
        BOOKING_PLATFORMS.find((p) => p.name === n && p.tier !== 'scheduler'),
      );
      const onlinePayment: Features['onlinePayment'] =
        technology.paymentProviders.length > 0
          ? {
              status: 'yes',
              evidence:
                technology.detectedSignatures.find((s) => s.category === 'payment')?.evidence ??
                technology.paymentProviders.join(', '),
            }
          : paymentFields
            ? { status: 'yes', evidence: paymentFields }
            : livePlatform
              ? {
                  status: 'unknown',
                  evidence: 'Bookings run on a third-party platform that may take payment off-site',
                }
              : fullyAnalysed
                ? {
                    status: 'no',
                    evidence: `No payment provider (Stripe, PayPal, Square...) or card fields found on the analysed pages (${allPages.length})`,
                  }
                : { status: 'unknown', evidence: 'Site could not be fully analysed' };
      const marketing = technology.detectedSignatures.find((s) => s.category === 'marketing');
      const chatFollowUp = (chat?.providers ?? []).find((p) =>
        CHAT_FOLLOW_UP_PROVIDERS.includes(p),
      );
      const automatedFollowUp: Features['automatedFollowUp'] = marketing
        ? { status: 'yes', evidence: `${marketing.name}: ${marketing.evidence}` }
        : chatFollowUp
          ? { status: 'yes', evidence: `${chatFollowUp} (messaging platform with follow-up tools)` }
          : fullyAnalysed
            ? {
                status: 'no',
                evidence:
                  'No email marketing, CRM or messaging automation signatures found on the analysed pages',
              }
            : { status: 'unknown', evidence: 'Site could not be fully analysed' };
      const textSource = rendered ?? staticAssets;
      return {
        contactForm,
        onlinePayment,
        automatedFollowUp,
        social: findSocialLinks(allPages),
        emails: findBusinessEmails(allPages, pageUrl),
        copyrightYear: textSource ? findCopyrightYear(textSource.bodyText, now()) : null,
        lastModifiedHint: findLastModifiedHint(staticAssets, headers, now()),
        cta: rendered || staticComplete ? findCallToAction(allPages) : undefined,
      };
    });
    if (site2) {
      features.contactForm = site2.contactForm;
      features.onlinePayment = site2.onlinePayment;
      features.automatedFollowUp = site2.automatedFollowUp;
    }

    const performance = psi?.performance ?? emptyPerformance();
    const isHttps = fetched?.finalUrl
      ? fetched.finalUrl.startsWith('https:')
      : inspection?.homepage.finalUrl
        ? inspection.homepage.finalUrl.startsWith('https:')
        : null;
    const reachable = Boolean(staticAssets || rendered);

    const quality = await stages.run('qualityClassifier', () =>
      classifyWebsiteQuality({
        hasWebsite: true,
        reachable,
        isHttps,
        hasViewportMeta: rendered
          ? rendered.hasViewportMeta
          : staticAssets
            ? staticAssets.hasViewportMeta
            : null,
        horizontalOverflowPx: inspection?.homepage.horizontalOverflowPx ?? null,
        mobileScore: performance.performanceStatus === 'ok' ? performance.mobileScore : null,
        copyrightYear: site2?.copyrightYear ?? null,
        builder: technology.builder,
        cms: technology.cms,
        framework: technology.framework,
        bookingQuality: features.onlineBooking.bookingQuality,
        callToAction: site2?.cta,
        now: now(),
      }),
    );

    return {
      kind: 'done',
      update: this.finish(target, stages, niche, {
        features,
        technology,
        performance,
        websiteQuality: quality?.websiteQuality ?? 'unknown',
        qualityReasons: quality?.qualityReasons ?? [],
        isHttps,
        isMobileFriendly: quality?.isMobileFriendly ?? null,
        copyrightYear: site2?.copyrightYear ?? null,
        lastModifiedHint: site2?.lastModifiedHint ?? null,
        finalUrl: pageUrl,
        httpStatus: fetched?.status ?? inspection?.homepage.status ?? null,
        screenshotPath: inspection?.homepage.screenshotPath ?? null,
        email: site2?.emails[0]?.email ?? null,
        emailSourceUrl: site2?.emails[0]?.sourceUrl ?? null,
        instagramUrl: site2?.social.instagramUrl ?? null,
        facebookUrl: site2?.social.facebookUrl ?? null,
        reachable,
      }),
    };
  }

  /** Score, build opportunities and assemble the update. Synchronous and pure apart from timing. */
  private finish(
    target: AnalysisTarget,
    stages: StageRunner,
    niche: ReturnType<typeof getNicheProfile>,
    r: {
      features: Features;
      websiteQuality: LeadAnalysisUpdate['websiteQuality'];
      qualityReasons: string[];
      technology?: LeadAnalysisUpdate['technology'];
      performance?: Performance;
      isHttps?: boolean | null;
      isMobileFriendly?: boolean | null;
      copyrightYear?: number | null;
      lastModifiedHint?: string | null;
      finalUrl?: string | null;
      httpStatus?: number | null;
      screenshotPath?: string | null;
      email?: string | null;
      emailSourceUrl?: string | null;
      instagramUrl?: string | null;
      facebookUrl?: string | null;
      noWebsite?: boolean;
      reachable?: boolean;
      forcedStatus?: AnalysisStatus;
    },
  ): LeadAnalysisUpdate {
    const now = this.deps.now ?? (() => new Date());
    const technology = r.technology ?? emptyTechnology();
    const performance = r.performance ?? emptyPerformance();
    const instagramUrl = target.instagramUrl ?? r.instagramUrl ?? null;

    const scoreStart = Date.now();
    const scored = scoreLead(
      {
        businessName: target.businessName,
        types: target.types,
        primaryType: target.primaryType,
        rating: target.rating,
        reviewCount: target.reviewCount,
        instagramUrl,
        websiteQuality: r.websiteQuality,
        performance,
        features: r.features,
      },
      this.deps.scoringWeights,
    );
    stages.durations.push({ stage: 'scoring', ms: Date.now() - scoreStart });
    const opportunities = buildOpportunities(
      {
        website: r.noWebsite ? null : target.website,
        websiteQuality: r.websiteQuality,
        isHttps: r.isHttps ?? null,
        isMobileFriendly: r.isMobileFriendly ?? null,
        technology,
        performance,
        features: r.features,
      },
      niche,
    );

    return {
      technology,
      performance,
      features: r.features,
      websiteQuality: r.websiteQuality,
      qualityReasons: r.qualityReasons,
      isHttps: r.isHttps ?? null,
      isMobileFriendly: r.isMobileFriendly ?? null,
      lastModifiedHint: r.lastModifiedHint ?? null,
      copyrightYear: r.copyrightYear ?? null,
      finalUrl: r.finalUrl ?? null,
      httpStatus: r.httpStatus ?? null,
      screenshotPath: r.screenshotPath ?? null,
      analysisStatus:
        r.forcedStatus ??
        (r.noWebsite
          ? stages.errors.length
            ? 'partial'
            : 'completed'
          : statusFor(false, stages.errors.length, r.reachable ?? false)),
      analysisErrors: stages.errors,
      stageDurations: stages.durations,
      analyzedAt: now(),
      analysisVersion: ANALYSIS_VERSION,
      score: scored.score,
      priority: scored.priority,
      scoreConfidence: scored.confidence,
      scoreNotes: scored.notes,
      scoreBreakdown: scored.breakdown,
      opportunities,
      email: r.email ?? null,
      emailSourceUrl: r.emailSourceUrl ?? null,
      instagramUrl,
      facebookUrl: r.facebookUrl ?? null,
    };
  }
}
