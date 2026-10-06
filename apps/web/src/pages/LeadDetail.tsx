import type { LeadStatus } from '@lead/shared';
import { LEAD_STATUSES } from '@lead/shared/enums';
import {
  ArrowLeft,
  Camera,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ScoreDial } from '@/components/charts/ScoreDial';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Field';
import { ErrorNote, Skeleton } from '@/components/ui/Misc';
import { AnalysisPill, CrmPill, TriMark } from '@/components/ui/Pills';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, formatNumber, hostOf, timeAgo } from '@/lib/format';
import {
  ANALYSIS_STATUS_HELP,
  BOOKING_LABEL,
  CATEGORY_LABEL,
  CATEGORY_MAX,
  LEAD_STATUS_LABEL,
  QUALITY_LABEL,
  SERVICE_LABEL,
  groupBreakdown,
  isActiveStatus,
  isCapRule,
  rateVital,
  weakPoints,
  type VitalRating,
} from '@/lib/leadView';
import type { LeadDto } from '@/lib/types';
import { useAuthedImage } from '@/lib/useAuthedImage';
import {
  errorText,
  useDeleteLeadMutation,
  useLeadQuery,
  useReanalyzeMutation,
  useUpdateLeadMutation,
} from '@/store/api';

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="pb-5">
      <CardHeader title={title} hint={hint} action={action} />
      <div className="mt-4 px-5">{children}</div>
    </Card>
  );
}

const RATING_TEXT: Record<VitalRating, { text: string; cls: string }> = {
  good: { text: 'Good', cls: 'text-good' },
  'needs-work': { text: 'Needs work', cls: 'text-warn' },
  poor: { text: 'Poor', cls: 'text-bad' },
};

function Vital({
  label,
  value,
  rating,
  note,
}: {
  label: string;
  value: string;
  rating: VitalRating | null;
  note?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="tnum mt-0.5 font-display text-2xl leading-tight font-semibold">{value}</p>
      <p className={cn('text-[13px] font-medium', rating ? RATING_TEXT[rating].cls : 'text-ink-3')}>
        {rating ? RATING_TEXT[rating].text : 'No data'}
        {note ? <span className="font-normal text-ink-3"> ({note})</span> : null}
      </p>
    </div>
  );
}

function scoreRating(score: number | null): VitalRating | null {
  if (score === null) return null;
  return score >= 90 ? 'good' : score >= 50 ? 'needs-work' : 'poor';
}

function talkingPoints(lead: LeadDto): string {
  const lines = [
    `${lead.businessName}${lead.city ? `, ${lead.city}` : ''}`,
    `Opportunity score: ${lead.score ?? 'not scored'}`,
    '',
  ];
  for (const o of lead.opportunities) {
    lines.push(`${o.title}: ${o.reason}`);
    for (const e of o.evidence) lines.push(`  - ${e}`);
  }
  return lines.join('\n');
}

function Opportunities({ lead }: { lead: LeadDto }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(talkingPoints(lead));
      toast.success('Talking points copied.');
    } catch {
      toast.error('Copying was blocked by the browser. Select the text and copy it by hand.');
    }
  };
  return (
    <Section
      title="Services you can offer"
      hint="Each one is backed by something found on the site."
      action={
        lead.opportunities.length > 0 ? (
          <Button size="sm" onClick={copy}>
            <Copy className="size-3.5" aria-hidden />
            Copy talking points
          </Button>
        ) : undefined
      }
    >
      {lead.opportunities.length === 0 ? (
        <p className="text-sm text-ink-2">
          {isActiveStatus(lead.analysisStatus)
            ? 'Opportunities appear when the analysis finishes.'
            : 'No opportunities were found. The site covers the main needs, or the analysis could not prove a gap.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {lead.opportunities.map((o) => (
            <li key={o.title} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base">{o.title}</h3>
                <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-2">
                  {SERVICE_LABEL[o.serviceType] ?? o.serviceType}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-2">{o.reason}</p>
              {o.evidence.length > 0 ? (
                <ul className="mt-2.5 space-y-1 border-l-2 border-line-strong pl-3 text-[13px] text-ink-2">
                  {o.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Breakdown({ lead }: { lead: LeadDto }) {
  const groups = useMemo(() => groupBreakdown(lead.scoreBreakdown), [lead.scoreBreakdown]);
  return (
    <Section
      title="How the score adds up"
      hint={
        lead.scoreConfidence === null
          ? undefined
          : `${Math.round(lead.scoreConfidence * 100)}% of the scoring signals could be checked. The rest count as unknown, not as gaps. Open a row to see its evidence.`
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-ink-2">The breakdown appears after the first analysis.</p>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => {
            const max = CATEGORY_MAX[g.category] ?? 100;
            return (
              <li key={g.category}>
                <details className="group rounded-lg open:bg-surface-2">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                    <span className="w-36 shrink-0 text-sm font-medium">
                      {CATEGORY_LABEL[g.category] ?? g.category}
                    </span>
                    <span className="h-2 flex-1 rounded-full bg-track" aria-hidden>
                      <span
                        className="block h-full rounded-r-[4px] rounded-l-full bg-series"
                        style={{ width: `${Math.min(100, (g.total / max) * 100)}%` }}
                      />
                    </span>
                    <span className="tnum w-14 text-right text-sm font-medium">
                      {g.total} / {max}
                    </span>
                  </summary>
                  <ul className="space-y-2 px-3 pt-1 pb-3 text-[13px]">
                    {g.items.map((it, i) => (
                      <li key={i} className="grid grid-cols-[3rem_1fr] gap-2">
                        <span
                          className={cn(
                            'tnum text-right font-medium',
                            it.points < 0 ? 'text-ink-3' : 'text-ink',
                          )}
                        >
                          {it.points > 0 ? '+' : ''}
                          {it.points}
                        </span>
                        <span className="text-ink-2">
                          {isCapRule(it.rule) ? 'Category cap applied. ' : ''}
                          {it.evidence}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {lead.scoreNotes.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[13px] text-ink-2">
          {lead.scoreNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function Performance({ lead }: { lead: LeadDto }) {
  const p = lead.performance;
  const inpLabel = p.inpSource === 'tbt' ? 'Blocking time' : 'Interaction delay';
  return (
    <Section
      title="Speed and stability"
      hint={
        p.fetchedAt
          ? `Measured by Google PageSpeed Insights ${timeAgo(p.fetchedAt)}. Core numbers come from the mobile run.`
          : undefined
      }
    >
      {p.performanceStatus !== 'ok' ? (
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          {p.performanceStatus === 'failed' ? 'The speed test failed.' : 'No speed data yet.'}{' '}
          {p.performanceError ??
            'A PageSpeed API key avoids most quota errors. Add PAGESPEED_API_KEY to your .env file.'}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Vital
          label="Mobile score"
          value={p.mobileScore === null ? '-' : String(p.mobileScore)}
          rating={scoreRating(p.mobileScore)}
        />
        <Vital
          label="Desktop score"
          value={p.desktopScore === null ? '-' : String(p.desktopScore)}
          rating={scoreRating(p.desktopScore)}
        />
        <Vital
          label="Largest content paint"
          value={formatMs(p.lcpMs)}
          rating={rateVital('lcp', p.lcpMs)}
        />
        <Vital
          label="Layout shift"
          value={p.cls === null ? '-' : p.cls.toFixed(2)}
          rating={rateVital('cls', p.cls)}
        />
        <Vital
          label={inpLabel}
          value={formatMs(p.inpMs)}
          rating={rateVital('inp', p.inpMs)}
          note={p.inpSource === 'tbt' ? 'lab proxy' : undefined}
        />
        <Vital
          label="Server response"
          value={formatMs(p.ttfbMs)}
          rating={rateVital('ttfb', p.ttfbMs)}
        />
      </div>
    </Section>
  );
}

function Features({ lead }: { lead: LeadDto }) {
  const f = lead.features;
  const rows: Array<{ label: string; value: ReactNode; evidence: string | null }> = [
    {
      label: 'Online booking',
      value: (
        <span className="text-[13px] font-medium">
          {BOOKING_LABEL[f.onlineBooking.bookingQuality]}
          {f.onlineBooking.platforms.length > 0 ? (
            <span className="font-normal text-ink-3">
              {' '}
              via {f.onlineBooking.platforms.join(', ')}
            </span>
          ) : null}
        </span>
      ),
      evidence: f.onlineBooking.evidence,
    },
    {
      label: 'WhatsApp',
      value: <TriMark value={f.whatsapp.status} yesLabel="Found" noLabel="Not found" />,
      evidence: f.whatsapp.evidence,
    },
    {
      label: 'Chat widget',
      value: (
        <TriMark
          value={f.chatbot.status}
          yesLabel={f.chatbot.chatbotProvider ?? 'Found'}
          noLabel="Not found"
        />
      ),
      evidence: f.chatbot.evidence,
    },
    {
      label: 'Live chat',
      value: <TriMark value={f.liveChat.status} yesLabel="Found" noLabel="Not found" />,
      evidence: f.liveChat.evidence,
    },
    {
      label: 'AI assistant',
      value: (
        <TriMark
          value={
            f.aiAssistant.status === 'detected'
              ? 'yes'
              : f.aiAssistant.status === 'notDetected'
                ? 'no'
                : 'unknown'
          }
          yesLabel="Detected"
          noLabel="Not detected"
        />
      ),
      evidence: f.aiAssistant.evidence,
    },
    {
      label: 'Online payment',
      value: <TriMark value={f.onlinePayment.status} yesLabel="Found" noLabel="Not found" />,
      evidence: f.onlinePayment.evidence,
    },
    {
      label: 'Contact form',
      value: <TriMark value={f.contactForm.status} yesLabel="Found" noLabel="Not found" />,
      evidence: f.contactForm.evidence,
    },
    {
      label: 'Follow up automation',
      value: <TriMark value={f.automatedFollowUp.status} yesLabel="Found" noLabel="Not found" />,
      evidence: f.automatedFollowUp.evidence,
    },
  ];
  return (
    <Section
      title="What the site has"
      hint="Unknown means we could not check it fully, which is different from missing."
    >
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[10rem_9rem_1fr]"
          >
            <dt className="text-sm text-ink-2">{r.label}</dt>
            <dd>{r.value}</dd>
            <dd className="text-[13px] break-words text-ink-3">{r.evidence ?? ''}</dd>
          </div>
        ))}
      </dl>
      {f.onlineBooking.bookingUrl ? (
        <a
          href={f.onlineBooking.bookingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium underline"
        >
          Open the booking page <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </Section>
  );
}

function Technology({ lead }: { lead: LeadDto }) {
  const t = lead.technology;
  const facts: Array<[string, string | null]> = [
    ['CMS', t.cms],
    ['Site builder', t.builder],
    ['Framework', t.framework],
    ['Shop platform', t.ecommerce],
    ['Hosting', t.hosting],
    ['CDN', t.cdn],
    ['Analytics', t.analytics.length ? t.analytics.join(', ') : null],
    ['Payments', t.paymentProviders.length ? t.paymentProviders.join(', ') : null],
  ];
  const known = facts.filter(([, v]) => v);
  return (
    <Section
      title="Technology"
      hint={lead.qualityReasons.length > 0 ? undefined : 'What the site is built with.'}
    >
      {known.length === 0 ? (
        <p className="text-sm text-ink-2">No technology was identified.</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {known.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line py-1.5 text-sm">
              <dt className="text-ink-2">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {lead.qualityReasons.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1.5 text-sm">
            Why the website is rated {QUALITY_LABEL[lead.websiteQuality].toLowerCase()}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
            {lead.qualityReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {t.detectedSignatures.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">
            Evidence for {t.detectedSignatures.length} detected{' '}
            {t.detectedSignatures.length === 1 ? 'technology' : 'technologies'}
          </summary>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {t.detectedSignatures.map((s, i) => (
              <li key={i} className="grid grid-cols-[9rem_1fr] gap-2">
                <span className="font-medium">
                  {s.name} <span className="font-normal text-ink-3">({s.category})</span>
                </span>
                <span className="break-all text-ink-3">{s.evidence}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}

function Screenshot({ path }: { path: string | null }) {
  const { url, loading, failed } = useAuthedImage(path);
  return (
    <Card className="overflow-hidden">
      {loading ? (
        <Skeleton className="aspect-[4/3] w-full rounded-none" />
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open the screenshot full size"
        >
          <img
            src={url}
            alt="Screenshot of the business website homepage"
            className="aspect-[4/3] w-full object-cover object-top"
          />
        </a>
      ) : (
        <div className="grid aspect-[4/3] place-items-center bg-surface-2 px-6 text-center">
          <div>
            <Camera className="mx-auto mb-2 size-6 text-ink-3" aria-hidden />
            <p className="text-[13px] text-ink-2">
              {failed
                ? 'The screenshot could not be loaded.'
                : 'No screenshot yet. It is taken during the browser check, when the browser is enabled.'}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function Outreach({ lead }: { lead: LeadDto }) {
  const toast = useToast();
  const [update, { isLoading }] = useUpdateLeadMutation();
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');

  async function patch(p: Parameters<typeof update>[0]['patch'], ok?: string) {
    try {
      await update({ id: lead.id, patch: p }).unwrap();
      if (ok) toast.success(ok);
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if (await patch({ note: note.trim() }, 'Note added.')) setNote('');
  }
  async function addTag(e: FormEvent) {
    e.preventDefault();
    const t = tag.trim();
    if (!t || lead.tags.includes(t)) return setTag('');
    if (await patch({ tags: [...lead.tags, t] })) setTag('');
  }

  return (
    <Card className="pb-5">
      <CardHeader title="Your outreach" action={<CrmPill status={lead.leadStatus} />} />
      <div className="mt-4 space-y-5 px-5">
        <div>
          <label htmlFor="crm-status" className="mb-1.5 block text-[13px] font-medium">
            Status
          </label>
          <Select
            id="crm-status"
            value={lead.leadStatus}
            disabled={isLoading}
            onChange={(e) =>
              patch(
                { leadStatus: e.target.value as LeadStatus },
                `Marked as ${LEAD_STATUS_LABEL[e.target.value as LeadStatus].toLowerCase()}.`,
              )
            }
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          {lead.lastContactedAt ? (
            <p className="mt-1.5 text-[13px] text-ink-3">
              Last contacted {timeAgo(lead.lastContactedAt)}.
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium">Tags</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {lead.tags.length === 0 ? (
              <span className="text-[13px] text-ink-3">No tags yet.</span>
            ) : null}
            {lead.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-track py-0.5 pr-1 pl-2.5 text-[13px]"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => patch({ tags: lead.tags.filter((x) => x !== t) })}
                  className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-line-strong hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addTag} className="flex gap-2">
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Add a tag"
              aria-label="New tag"
              maxLength={40}
            />
            <Button type="submit" disabled={!tag.trim()}>
              Add
            </Button>
          </form>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium">Notes</p>
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              aria-label="New note"
              placeholder="What happened, or what to do next"
              className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-ink"
            />
            <Button type="submit" size="sm" disabled={!note.trim()} loading={isLoading}>
              Add note
            </Button>
          </form>
          {lead.notes.length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {[...lead.notes].reverse().map((n, i) => (
                <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <p className="break-words whitespace-pre-wrap">{n.text}</p>
                  <p className="mt-1 text-xs text-ink-3">{formatDateTime(n.at)}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function AnalysisInfo({ lead }: { lead: LeadDto }) {
  const slowest = Math.max(1, ...lead.stageDurations.map((s) => s.ms));
  return (
    <Card className="pb-5">
      <CardHeader title="Analysis" action={<AnalysisPill status={lead.analysisStatus} />} />
      <div className="mt-3 space-y-4 px-5 text-[13px]">
        <p className="text-ink-2">{ANALYSIS_STATUS_HELP[lead.analysisStatus]}</p>
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Analysed</dt>
            <dd>{formatDateTime(lead.analyzedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Added</dt>
            <dd>{formatDateTime(lead.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Final address</dt>
            <dd className="truncate">{lead.finalUrl ? hostOf(lead.finalUrl) : '-'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">HTTP status</dt>
            <dd className="tnum">{lead.httpStatus ?? '-'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">HTTPS</dt>
            <dd>{lead.isHttps === null ? 'Unknown' : lead.isHttps ? 'Yes' : 'No'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Mobile friendly</dt>
            <dd>
              {lead.isMobileFriendly === null ? 'Unknown' : lead.isMobileFriendly ? 'Yes' : 'No'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Copyright year</dt>
            <dd className="tnum">{lead.copyrightYear ?? '-'}</dd>
          </div>
        </dl>
        {lead.analysisErrors.length > 0 ? (
          <div>
            <h3 className="mb-1.5 text-sm">Problems during analysis</h3>
            <ul className="space-y-1.5">
              {lead.analysisErrors.map((e, i) => (
                <li key={i} className="rounded-lg border border-bad/30 bg-bad/5 px-2.5 py-1.5">
                  <span className="font-medium">{e.stage}</span>
                  <span className="text-ink-2">: {e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {lead.stageDurations.length > 0 ? (
          <details>
            <summary className="cursor-pointer font-medium text-ink-2 hover:text-ink">
              Time per stage
            </summary>
            <ul className="mt-2 space-y-1.5">
              {lead.stageDurations.map((s) => (
                <li key={s.stage} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2">
                  <span className="truncate text-ink-2">{s.stage}</span>
                  <span className="h-1.5 rounded-full bg-track" aria-hidden>
                    <span
                      className="block h-full rounded-r-[3px] rounded-l-full bg-series"
                      style={{ width: `${(s.ms / slowest) * 100}%` }}
                    />
                  </span>
                  <span className="tnum text-right text-ink-3">{formatMs(s.ms)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

function Contact({ lead }: { lead: LeadDto }) {
  const items: Array<{ icon: typeof Phone; label: string; href: string }> = [];
  if (lead.website)
    items.push({ icon: ExternalLink, label: hostOf(lead.website), href: lead.website });
  if (lead.phone)
    items.push({
      icon: Phone,
      label: lead.phone,
      href: `tel:${lead.phone.replace(/[^\d+]/g, '')}`,
    });
  if (lead.email) items.push({ icon: Mail, label: lead.email, href: `mailto:${lead.email}` });
  if (lead.googleMapsUri)
    items.push({ icon: MapPin, label: 'Google Maps', href: lead.googleMapsUri });
  if (lead.instagramUrl) items.push({ icon: Link2, label: 'Instagram', href: lead.instagramUrl });
  if (lead.facebookUrl) items.push({ icon: Link2, label: 'Facebook', href: lead.facebookUrl });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
      {lead.rating !== null ? (
        <span className="inline-flex items-center gap-1.5">
          <Star className="size-4 text-lane" fill="currentColor" aria-hidden />
          <span className="tnum font-medium text-ink">{lead.rating.toFixed(1)}</span>
          {lead.reviewCount !== null ? (
            <span>({formatNumber(lead.reviewCount)} reviews)</span>
          ) : null}
        </span>
      ) : lead.reviewCount !== null ? (
        <span>{formatNumber(lead.reviewCount)} reviews</span>
      ) : null}
      {[lead.address, [lead.city, lead.country].filter(Boolean).join(', ')].find((x) => x) ? (
        <span>{lead.address ?? [lead.city, lead.country].filter(Boolean).join(', ')}</span>
      ) : null}
      {items.map(({ icon: Icon, label, href }) => (
        <a
          key={href}
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 hover:text-ink hover:underline"
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </a>
      ))}
    </div>
  );
}

export default function LeadDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [poll, setPoll] = useState(0);
  const {
    data: lead,
    isLoading,
    isError,
    error,
    refetch,
  } = useLeadQuery(id, { pollingInterval: poll });
  const [reanalyze, { isLoading: queuing }] = useReanalyzeMutation();
  const [remove, { isLoading: deleting }] = useDeleteLeadMutation();
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setPoll(lead && isActiveStatus(lead.analysisStatus) ? 3000 : 0);
  }, [lead]);

  async function onReanalyze() {
    try {
      await reanalyze(id).unwrap();
      toast.success('Analysis queued again.');
    } catch (err) {
      toast.error(errorText(err));
    }
  }
  async function onDelete() {
    try {
      await remove(id).unwrap();
      toast.success('Lead deleted.');
      navigate('/leads', { replace: true });
    } catch (err) {
      toast.error(errorText(err));
      setConfirm(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (isError || !lead) {
    const notFound = (error as { status?: number } | undefined)?.status === 404;
    return (
      <div className="space-y-4">
        <Link
          to="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to leads
        </Link>
        <ErrorNote onRetry={notFound ? undefined : refetch}>
          {notFound ? 'This lead does not exist. It may have been deleted.' : errorText(error)}
        </ErrorNote>
      </div>
    );
  }

  const gaps = weakPoints(lead);
  const active = isActiveStatus(lead.analysisStatus);

  return (
    <>
      <Link
        to="/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to leads
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight sm:text-[34px]">{lead.businessName}</h1>
          <Contact lead={lead} />
          {gaps.length > 0 ? (
            <p className="mt-3 max-w-2xl text-sm">
              <span className="font-medium">Proven gaps:</span>{' '}
              <span className="text-ink-2">{gaps.join(', ')}.</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onReanalyze} loading={queuing} disabled={active || !lead.website}>
            <RefreshCw className="size-4" aria-hidden />
            Analyze again
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <Trash2 className="size-4" aria-hidden />
            Delete
          </Button>
        </div>
      </header>

      {active ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-3 rounded-xl border border-lane bg-surface px-4 py-3 text-sm"
        >
          <span className="pulse-dot size-2.5 rounded-full bg-lane" aria-hidden />
          <span>
            <span className="font-medium">
              {lead.analysisStatus === 'pending'
                ? 'Waiting in the queue.'
                : 'Inspecting the website now.'}
            </span>{' '}
            <span className="text-ink-2">
              This page updates by itself. A full analysis takes 30 to 60 seconds.
            </span>
          </span>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Opportunities lead={lead} />
          <Breakdown lead={lead} />
          <Performance lead={lead} />
          <Features lead={lead} />
          <Technology lead={lead} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card className="px-6 pt-5 pb-5">
            <ScoreDial score={lead.score} className="mx-auto max-w-64" />
          </Card>
          <Screenshot path={lead.screenshotPath} />
          <Outreach lead={lead} />
          <AnalysisInfo lead={lead} />
        </aside>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Delete this lead?"
          description={`${lead.businessName} and its notes will be removed. This cannot be undone.`}
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button>Keep lead</Button>
            </DialogClose>
            <Button variant="danger" onClick={onDelete} loading={deleting}>
              Delete lead
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
