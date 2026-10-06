# Lead Intelligence and Scoring System

Finds local businesses (default niche: independent car rental, USA and UK), analyses each
business website, scores the opportunity it represents for website / online booking /
WhatsApp automation / AI assistant work, and produces an evidence-based opportunity report.

**Status: Phase 1 (foundation and core analyzers) is done.** Places discovery (Phase 2), the
dashboard (Phase 3) and outreach/CRM (Phase 4) come next.

## Ground rules the code enforces

- Discovery uses only the official **Google Places API (New)**. Nothing scrapes Google Maps.
- CAPTCHAs, anti-bot pages, login walls and rate limits are **never bypassed**. A site that
  blocks us is recorded as `blocked` and the analysis moves on.
- **No invented findings.** Every score rule and opportunity carries the evidence string that
  produced it. A signal that cannot be proven is stored as `unknown`, never `no`.
- **Polite crawling.** We honour robots.txt (RFC 9309) for every page we fetch ourselves,
  send a clear user agent, keep concurrency low and add random delays.
- **SSRF protection.** Every user-supplied or discovered URL is normalised, restricted to
  http(s), DNS-checked against private, loopback, link-local, CGNAT and metadata ranges on
  every redirect hop, and guarded again at connect time. The browser applies the same check
  to every sub-request.

## Architecture

```
                 ┌────────────────────────── apps/api ──────────────────────────────┐
  HTTP client    │  Express (helmet, CORS, rate limit, bearer auth, zod validation) │
  (dashboard,    │    POST /api/leads/analyze ─┐   GET /api/leads, /api/leads/:id   │
   curl)  ──────►│                             ▼                                    │
                 │                   BullMQ queue "analysis"  ◄──── Redis           │
                 │                             │ (dedupe per lead, retries,        │
                 │                             │  exponential backoff, limiter)    │
                 │                             ▼                                    │
                 │  Worker ─► analysisProcessor (idempotency, jitter, job timeout)  │
                 │                │                                                 │
                 │                ▼                                                 │
                 │  AnalysisOrchestrator (each stage isolated and timed)            │
                 │   1 fetchPage ─ robots.txt, SSRF guard, 5 redirects, 3 MB cap    │
                 │   2 parseHtml (Cheerio) ─► techDetector (signatures.ts)          │
                 │   3 in parallel:  pageSpeedAnalyzer (PSI v5, 7-day cache)        │
                 │                   bookingDetector (Playwright: render, screenshot│
                 │                   overflow check, up to 5 booking pages + contact│
                 │   4 whatsapp / chatbot / contact form / payments / follow-up     │
                 │   5 websiteQualityClassifier (deterministic)                     │
                 │   6 scoreLead + buildOpportunities (packages/shared, pure)       │
                 │                │                                                 │
                 │                ▼                                                 │
                 │            MongoDB (Lead, SearchQuery, ApiUsage, PageSpeedCache) │
                 └──────────────────────────────────────────────────────────────────┘
  packages/shared: Lead zod schema and types, API schemas, scoring weights, scoring engine,
                   opportunity builder, niche profiles (used by the API and the web app)
```

Repository layout:

```
apps/api/src
  analyzers/        net/ (urlSafety, safeGet, robots, dispatcher), html/, tech/, booking/,
                    fetchPage, pageSpeedAnalyzer, whatsappDetector, chatbotDetector,
                    siteSignals, websiteQualityClassifier, websiteDiscovery
  orchestrator/     analysisOrchestrator, stageRunner
  queue/            analysisQueue, analysisProcessor, analysisWorker, redis
  models/ services/ routes/ middleware/ config/ lib/
apps/api/test       fixtures/ (HTML + PSI JSON), helpers/, e2e/
packages/shared/src enums, lead, api, niche, scoring/
```

## Setup

Requirements: Node.js 22.19 or newer (undici 8 and Vitest need it), Docker with the Compose plugin (on Ubuntu: `sudo apt install docker-compose-v2`).

```bash
npm install
npx playwright install chromium     # one-off browser download for the booking detector
cp .env.example .env                 # then set ADMIN_ACCESS_TOKEN and API keys
docker compose up -d                 # MongoDB 7 + Redis 7
npm run dev:api                      # API on :4000, worker runs in-process by default
```

To run the worker as its own process, set `RUN_WORKER_IN_API=false` and run `npm run dev:worker`.

Production build: `npm run build`, then `npm run start -w @lead/api` (and
`npm run start:worker -w @lead/api` when the worker runs separately).

### Try it

```bash
TOKEN=...   # your ADMIN_ACCESS_TOKEN
curl -s -X POST localhost:4000/api/leads/analyze \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"businessName":"Example Car Rental","website":"example-car-rental.com","city":"Miami","reviewCount":180,"rating":4.6}'
# => {"id":"665f...","jobId":"1","analysisStatus":"pending","enqueued":true}

curl -s localhost:4000/api/leads/665f... -H "Authorization: Bearer $TOKEN" | jq '{analysisStatus, score, priority, scoreBreakdown, opportunities}'
curl -s "localhost:4000/api/leads?priority=hot&maxMobileScore=50&bookingStatus=none" -H "Authorization: Bearer $TOKEN"
```

A typical analysis takes 20 to 60 seconds, most of it PageSpeed Insights. Screenshots are
served at `/api/uploads/<screenshotPath>`, behind the same auth.

### Endpoints (Phase 1)

| Method | Path                 | Notes                                                                                                                                                                                                                                                    |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`        | Public. `{status, services: {mongo, redis}}`                                                                                                                                                                                                             |
| POST   | `/api/leads/analyze` | `{businessName, website, city?, country?, rating?, reviewCount?}`. Upserts by website and enqueues analysis. Returns 201 (new) or 202 (existing)                                                                                                         |
| GET    | `/api/leads/:id`     | Full lead with evidence                                                                                                                                                                                                                                  |
| GET    | `/api/leads`         | `page, pageSize (max 100), sort (score, createdAt, updatedAt, reviewCount, rating, mobileScore, businessName), order, priority, city, status, leadStatus, technology, bookingStatus, whatsapp, minScore, maxMobileScore, minReviews, search, hasWebsite` |
| GET    | `/api/uploads/*`     | Screenshots                                                                                                                                                                                                                                              |

Every error has the same shape: `{"error": {"code": "VALIDATION_ERROR", "message": "...", "details": [...]}}`.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test                                              # unit + integration (Chromium needed)
REDIS_TEST_URL=redis://127.0.0.1:6379/15 npm test    # also runs the Redis/BullMQ e2e test
npm run check                                         # lint + typecheck + test
```

## Environment variables

All variables are documented inline in [`.env.example`](.env.example) and validated at
startup by `apps/api/src/config/env.ts`. The process exits with a list of every invalid value.

| Variable                                                          | Default                     | Purpose                                                  |
| ----------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `MONGODB_URI`, `REDIS_URL`                                        | required                    | Data stores                                              |
| `ADMIN_ACCESS_TOKEN`                                              | required (16+ chars)        | Bearer token for all `/api` routes                       |
| `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, `ANTHROPIC_API_KEY` | empty                       | API keys                                                 |
| `API_PORT`, `WEB_ORIGIN`                                          | 4000, http://localhost:5173 | Server and CORS                                          |
| `ANALYSIS_CONCURRENCY`                                            | 3                           | Parallel jobs                                            |
| `ANALYSIS_MIN_DELAY_MS` / `ANALYSIS_MAX_DELAY_MS`                 | 2000 / 5000                 | Random delay per job; min also sets the limiter          |
| `REQUEST_TIMEOUT_MS`                                              | 20000                       | Per request to target sites                              |
| `ANALYSIS_RETRIES`                                                | 2                           | Retries with exponential backoff from 10 s               |
| `ANALYSIS_JOB_TIMEOUT_MS`                                         | 180000                      | Hard cap per job                                         |
| `PLACES_DAILY_REQUEST_CAP` / `PLACES_MONTHLY_REQUEST_CAP`         | 200 / 3000                  | Budget guard                                             |
| `PAGESPEED_CACHE_DAYS`                                            | 7                           | PSI cache TTL                                            |
| `CRAWLER_USER_AGENT`                                              | LeadIntelBot/0.1 (...)      | Sent to sites; first token is matched against robots.txt |
| `BROWSER_ENABLED`, `BROWSER_POOL_SIZE`, `BROWSER_PAGE_TIMEOUT_MS` | true, 2, 25000              | Playwright                                               |
| `UPLOADS_DIR`                                                     | ./uploads                   | Screenshots                                              |

## How the analysis decides things

- **Tri-state signals.** `whatsapp`, `chatbot`, `liveChat`, `onlinePayment`, `contactForm` and
  `automatedFollowUp` are `yes`, `no` or `unknown`, each with an evidence string. A `no` needs
  full coverage. WhatsApp needs complete static HTML plus either the rendered page or no tag
  manager on the site. Chat needs the rendered page, because chat widgets are injected by
  JavaScript. Contact form needs the rendered homepage and the contact page.
- **AI assistant** is `detected` only for AI-first products (Chatbase, Botpress, Voiceflow,
  Ada and similar). A known widget such as Tidio or Intercom gives `unknown`. A rendered page
  with no widget gives `notDetected`. The system never claims "no AI".
- **Booking quality.**
  - `good`: a known live rental engine or marketplace (Rent Centric, HQ, Booqable, Turo...), or a
    form with dates, vehicle selection and customer or payment fields.
  - `basic`: a request or quote form, or an appointment scheduler (Calendly, Acuity, TeamUp...).
  - `none`: complete inspection, only call or contact options.
  - `unknown`: blocked, login wall, uninspectable iframe, or incomplete inspection.
  - The detector never submits forms.
- **Website quality** is a deterministic point system (`websiteQualityClassifier.ts`). It
  combines HTTPS, the viewport meta tag, horizontal overflow at 390px, the PageSpeed mobile score,
  copyright year, builder age, booking and call to action. Every reason is stored with its points.

## Adding a technology signature

Edit `apps/api/src/analyzers/tech/signatures.ts` and append an entry:

```ts
{
  name: 'Framer',
  category: 'builder',                       // cms | builder | framework | ecommerce | hosting | cdn | analytics | payment | marketing | ...
  meta: [{ name: 'generator', content: /Framer/i }],
  scriptSrc: [/framerusercontent\.com/i],
  headers: [{ name: 'server', value: /Framer/i }],
  implies: ['React'],                        // optional
}
```

Available matchers are `scriptSrc`, `linkHref`, `iframeSrc`, `anchorHref`, `html`,
`inlineScript`, `meta`, `headers` and `cookies`. The first match becomes the stored evidence, so
keep patterns specific. Add a fixture-based case to `techDetector.test.ts`. Chat widgets live
in `chatbotProviders.ts`, WhatsApp widgets in `whatsappDetector.ts`, and booking platforms in
`booking/bookingPlatforms.ts`, all in the same data-driven format.
Bump `ANALYSIS_VERSION` in `packages/shared/src/lead.ts` when detector output changes.

Detection sits behind `TechDetectionProvider` (`tech/techDetector.ts`). A Wappalyzer or
BuiltWith client can implement `detect()` and be wired in `container.ts`.

## Tuning the scoring weights

All numbers live in `DEFAULT_SCORING_WEIGHTS` (`packages/shared/src/scoring/weights.ts`). The
logic in `scoreLead.ts` never hardcodes a weight. `ScoringWeightsSchema` validates edits:
category maxima must sum to 100 and priority thresholds must be descending. The Phase 3
settings screen will use the same schema.

| Category (max)           | Rules (defaults)                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website (30)             | none 30, poor 25, average 12, good 3, excellent 0, unknown 10                                                                                        |
| Performance (20, mobile) | score <30: 10, 30-49: 8, 50-64: 5, 65-79: 2. LCP >4000 ms: +6, 2500-4000: +3. CLS >0.25: +4, 0.1-0.25: +2. Capped at 20. No data gives 0 plus a note |
| Booking (20)             | none 15 (+5 if contact form is proven absent), basic 8, good 2, unknown 6                                                                            |
| Automation gaps (15)     | no WhatsApp 5, no chatbot 4, no online payment 3, no follow-up automation 3. Only proven `no` counts                                                 |
| Attractiveness (15)      | luxury/exotic keyword 5, 100+ reviews 3 or 500+ reviews 5, rating 4.3+ gives 2, Instagram linked 3                                                   |

Priority: 80+ hot, 60-79 high, 40-59 medium, below 40 low. When a cap bites, a negative
`<category>.cap` line is added, so `scoreBreakdown` always sums to `score`. `scoreConfidence`
is the share of the 10 scoring signals that were known.

Niche vocabulary and luxury keywords are configurable: see `packages/shared/src/niche.ts` and
`attractiveness.luxuryKeywords`.

## Google Places API cost and the budget guard

Places API (New) bills **per request**, and the **field mask decides the SKU**. Our planned mask
includes `rating`, `userRatingCount`, `websiteUri` and phone numbers, so every Text Search page
bills at the **Text Search Enterprise** SKU. At the time of writing that is about **$35 per 1,000
requests, with 1,000 free requests per month**. The Pro SKU (name, address, location, types,
without rating or website) is about $32 per 1,000 with 5,000 free per month. Check the
[official pricing page](https://developers.google.com/maps/billing-and-pricing/pricing) before
relying on these numbers. One request returns up to 20 places, and each `nextPageToken` page is
another billed request.

The budget guard is implemented in `services/apiUsageService.ts` and `services/budget.ts`:

- Every paid call is counted in the `ApiUsage` collection (`{date: 'YYYY-MM-DD' UTC, service, count}`, unique per day and service).
- Before each Places call, the guard sums today's and this month's usage and **refuses the call**
  with `429 BUDGET_EXCEEDED` if it would pass `PLACES_DAILY_REQUEST_CAP` or `PLACES_MONTHLY_REQUEST_CAP`.
  A cap of 0 disables Places entirely.
- PageSpeed calls are counted too (they are free but quota-limited). Cache hits are not counted.

The Places client itself, and `GET /api/usage`, arrive in Phase 2.

## Reliability notes

- Jobs are de-duplicated per lead while waiting or active. The processor is idempotent: it skips
  a lead already analysed with the current `analysisVersion` after the job was queued.
- HTTP 429 or 503 from a target site triggers a BullMQ retry with exponential backoff. After the
  last attempt the lead is saved as `blocked` with a clear error.
- A failing stage records `{stage, message, at}` in `analysisErrors` and the remaining stages
  continue (status `partial`). Per-stage durations are stored in `stageDurations`.
- Stalled jobs are retried once. SIGTERM and SIGINT close HTTP, worker, queue, browser, Redis
  and Mongo in order.
