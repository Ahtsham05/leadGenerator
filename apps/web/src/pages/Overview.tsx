import type { LeadStats } from '@lead/shared';
import { ArrowRight, Radar, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyzeDialog } from '@/components/layout/AnalyzeDialog';
import {
  BarList,
  Columns,
  SegmentBar,
  Trend,
  type Row,
  type Segment,
} from '@/components/charts/Charts';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorNote, PageHeader, Skeleton } from '@/components/ui/Misc';
import { PriorityPill } from '@/components/ui/Pills';
import { cn } from '@/lib/cn';
import { compactNumber, formatNumber, percent } from '@/lib/format';
import {
  BOOKING_LABEL,
  LEAD_STATUS_LABEL,
  PRIORITY_LABEL,
  PRIORITY_RANGE,
  QUALITY_LABEL,
  TRI_LABEL,
  scoreBand,
  weakPoints,
} from '@/lib/leadView';
import { errorText, useLeadsQuery, useStatsQuery } from '@/store/api';

const PRIORITY_COLOR = {
  hot: 'var(--hot)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
} as const;

const RAMP = ['var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-5)'];
const UNKNOWN = 'var(--line-strong)';

function Tile({
  label,
  value,
  note,
  to,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  to?: string;
  tone?: 'bad';
}) {
  const body = (
    <Card
      className={cn(
        'h-full px-5 py-4',
        to && 'transition-colors hover:border-line-strong hover:bg-surface-2',
      )}
    >
      <p className="text-[13px] text-ink-2">{label}</p>
      <p
        className={cn(
          'tnum mt-1 font-display text-[30px] leading-none font-semibold',
          tone === 'bad' && 'text-bad',
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-2 text-[13px] text-ink-3">{note}</p> : null}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

function Shortlist() {
  const { data, isLoading, isError, error, refetch } = useLeadsQuery({
    sort: 'score',
    order: 'desc',
    pageSize: 6,
    minScore: 60,
    leadStatus: undefined,
  });
  return (
    <Card className="pb-2 lg:col-span-2">
      <CardHeader
        title="Best opportunities right now"
        hint="Highest scores, with the proven gaps that earned them."
        action={
          <Link
            to="/leads?minScore=60"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            See all <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <div className="mt-3">
        {isLoading ? (
          <div className="space-y-3 px-5 pb-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-5 pb-3">
            <ErrorNote onRetry={refetch}>{errorText(error)}</ErrorNote>
          </div>
        ) : data && data.items.length > 0 ? (
          <ul className="divide-y divide-line">
            {data.items.map((l) => {
              const gaps = weakPoints(l);
              return (
                <li key={l.id}>
                  <Link
                    to={`/leads/${l.id}`}
                    className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span
                      className="tnum grid h-11 place-items-center rounded-lg border-l-4 bg-surface-2 font-display text-xl font-semibold"
                      style={{ borderLeftColor: PRIORITY_COLOR[scoreBand(l.score) ?? 'low'] }}
                    >
                      {l.score}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{l.businessName}</span>
                      <span className="line-clamp-2 block text-[13px] text-ink-2">
                        {gaps.length > 0 ? gaps.slice(0, 4).join(', ') : 'No proven gaps yet'}
                        {l.city ? <span className="text-ink-3"> in {l.city}</span> : null}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <PriorityPill priority={l.priority} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pt-2 pb-5 text-sm text-ink-2">
            No lead scores 60 or more yet. Analyze more websites, or lower the bar in the Leads
            view.
          </p>
        )}
      </div>
    </Card>
  );
}

function Dashboard({ stats }: { stats: LeadStats }) {
  const priorityRows: Row[] = (['hot', 'high', 'medium', 'low'] as const).map((p) => ({
    key: p,
    label: PRIORITY_LABEL[p],
    count: stats.byPriority[p],
  }));
  const prioritySegments: Segment[] = priorityRows.map((r) => ({
    key: r.key,
    label: `${r.label} (${PRIORITY_RANGE[r.key as keyof typeof PRIORITY_RANGE]})`,
    count: r.count,
    color: PRIORITY_COLOR[r.key as keyof typeof PRIORITY_COLOR],
  }));

  const quality = (['none', 'poor', 'average', 'good', 'excellent', 'unknown'] as const).map(
    (k, i): Segment => ({
      key: k,
      label: QUALITY_LABEL[k],
      count: stats.byWebsiteQuality[k],
      color: k === 'unknown' ? UNKNOWN : RAMP[Math.min(4, i)]!,
    }),
  );
  const booking = (['none', 'basic', 'good', 'unknown'] as const).map((k, i): Segment => ({
    key: k,
    label: BOOKING_LABEL[k],
    count: stats.byBooking[k],
    color: k === 'unknown' ? UNKNOWN : RAMP[i * 2]!,
  }));
  const whatsapp = (['no', 'yes', 'unknown'] as const).map((k, i): Segment => ({
    key: k,
    label: k === 'no' ? 'Not found' : k === 'yes' ? 'Found' : TRI_LABEL.unknown,
    count: stats.byWhatsapp[k],
    color: k === 'unknown' ? UNKNOWN : RAMP[i === 0 ? 1 : 3]!,
  }));

  const pipeline = (
    ['new', 'reviewed', 'contacted', 'replied', 'meeting', 'won', 'lost', 'doNotContact'] as const
  ).map((k): Row => ({
    key: k,
    label: LEAD_STATUS_LABEL[k],
    count: stats.byLeadStatus[k],
    to: `/leads?leadStatus=${k}`,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Leads tracked"
          value={compactNumber(stats.total)}
          note={`${stats.byPriority.hot} hot, ${stats.byPriority.high} high`}
          to="/leads"
        />
        <Tile
          label="Analysed"
          value={compactNumber(stats.analyzed)}
          note={
            stats.inProgress > 0
              ? `${stats.inProgress} running or queued`
              : `${percent(stats.analyzed, stats.total)} of all leads`
          }
          to="/leads?status=completed"
        />
        <Tile
          label="Average score"
          value={stats.averageScore === null ? '-' : String(stats.averageScore)}
          note={
            stats.averageMobileScore === null
              ? 'No speed data yet'
              : `Average mobile speed ${stats.averageMobileScore}`
          }
        />
        <Tile
          label="Need attention"
          value={formatNumber(stats.needsAttention)}
          note={stats.needsAttention > 0 ? 'Failed or blocked analyses' : 'Nothing is stuck'}
          to={stats.needsAttention > 0 ? '/leads?status=failed' : undefined}
          tone={stats.needsAttention > 0 ? 'bad' : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Shortlist />
        <div className="flex flex-col gap-4">
          <Card className="pb-5">
            <CardHeader title="Priority mix" hint="How many leads sit in each band." />
            <div className="mt-4 px-5">
              <SegmentBar segments={prioritySegments} />
            </div>
          </Card>
          <Card className="flex-1 pb-5">
            <CardHeader title="Pipeline" hint="Where each lead is in your outreach." />
            <div className="mt-4 px-5">
              <BarList rows={pipeline} />
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <CardHeader
            title="Score distribution"
            hint="Leads per ten point band. Taller on the right means a stronger pool."
          />
          <div className="mt-5 px-5">
            <Columns
              data={stats.scoreDistribution.map((b) => ({
                key: b.key,
                label: b.key.split('-')[0]!,
                count: b.count,
              }))}
              colorFor={(r) => PRIORITY_COLOR[scoreBand(Number.parseInt(r.key, 10)) ?? 'low']}
            />
          </div>
        </Card>
        <Card className="pb-5">
          <CardHeader title="Leads added, last 30 days" />
          <div className="mt-5 px-5">
            <Trend data={stats.createdPerDay} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="pb-5">
          <CardHeader
            title="Online booking"
            hint="Quality of the booking flow found on each site."
          />
          <div className="mt-4 px-5">
            <SegmentBar segments={booking} />
          </div>
        </Card>
        <Card className="pb-5">
          <CardHeader title="WhatsApp" hint="Click to chat links and widgets." />
          <div className="mt-4 px-5">
            <SegmentBar segments={whatsapp} />
          </div>
        </Card>
        <Card className="pb-5">
          <CardHeader title="Website quality" hint="From the site's own signals." />
          <div className="mt-4 px-5">
            <SegmentBar segments={quality} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <CardHeader title="Top cities" />
          <div className="mt-4 px-5">
            <BarList
              rows={stats.topCities.map((c) => ({
                key: c.key,
                label: c.key,
                count: c.count,
                to: `/leads?city=${encodeURIComponent(c.key)}`,
              }))}
              empty="Add a city when you analyze a website to see this."
            />
          </div>
        </Card>
        <Card className="pb-5">
          <CardHeader title="Most common technology" hint="Useful for choosing a pitch." />
          <div className="mt-4 px-5">
            <BarList
              rows={stats.topTechnologies.map((c) => ({
                key: c.key,
                label: c.key,
                count: c.count,
                to: `/leads?technology=${encodeURIComponent(c.key)}`,
              }))}
              empty="Technology appears after the first analysis finishes."
            />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function Overview() {
  const [poll, setPoll] = useState(0);
  const { data, isLoading, isError, error, refetch } = useStatsQuery(undefined, {
    pollingInterval: poll,
  });
  const { openAnalyze } = useAnalyzeDialog();

  // Refresh quickly while analyses are running, otherwise stay quiet.
  useEffect(() => {
    setPoll(data && data.inProgress > 0 ? 5000 : 0);
  }, [data]);

  return (
    <>
      <PageHeader
        title="Overview"
        description="See where the strongest opportunities are and what to do next."
        actions={
          data && data.inProgress > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-lane px-3 py-1 text-[13px] font-medium">
              <span className="pulse-dot size-2 rounded-full bg-lane" aria-hidden />
              {data.inProgress} {data.inProgress === 1 ? 'analysis' : 'analyses'} in progress
            </span>
          ) : null
        }
      />
      {isLoading ? (
        <div className="space-y-4" aria-busy>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px]" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : isError ? (
        <ErrorNote onRetry={refetch}>{errorText(error)}</ErrorNote>
      ) : data && data.total === 0 ? (
        <Card>
          <EmptyState
            icon={Radar}
            title="No leads yet"
            action={
              <Button variant="accent" size="lg" onClick={openAnalyze}>
                Analyze your first website
              </Button>
            }
          >
            Add a car rental website and you get a score, the proven gaps behind it and a short list
            of services to offer.
          </EmptyState>
        </Card>
      ) : data ? (
        <>
          {data.needsAttention > 0 ? (
            <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-2">
              <TriangleAlert className="size-4 text-warn" aria-hidden />
              {data.needsAttention} {data.needsAttention === 1 ? 'analysis' : 'analyses'} failed or
              were blocked by the site.
            </div>
          ) : null}
          <Dashboard stats={data} />
        </>
      ) : null}
    </>
  );
}
