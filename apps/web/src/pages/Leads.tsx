import {
  ANALYSIS_STATUSES,
  BOOKING_QUALITIES,
  LEAD_SORT_FIELDS,
  LEAD_STATUSES,
  PRIORITIES,
  TRI_STATES,
} from '@lead/shared/enums';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  SearchX,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAnalyzeDialog } from '@/components/layout/AnalyzeDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorNote, PageHeader, Skeleton } from '@/components/ui/Misc';
import { AnalysisPill, CrmPill, PriorityPill, TriMark } from '@/components/ui/Pills';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { csvCell, formatNumber, hostOf, timeAgo } from '@/lib/format';
import {
  ANALYSIS_STATUS_LABEL,
  BOOKING_LABEL,
  LEAD_STATUS_LABEL,
  PRIORITY_LABEL,
  QUALITY_LABEL,
  TRI_LABEL,
  isActiveStatus,
  scoreBand,
  weakPoints,
} from '@/lib/leadView';
import type { LeadDto } from '@/lib/types';
import { useAppDispatch } from '@/store';
import { api, errorText, useLeadsQuery, type LeadListParams } from '@/store/api';

const PAGE_SIZE = 25;
const BAND_VAR = {
  hot: 'var(--hot)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
} as const;

type SortKey = (typeof LEAD_SORT_FIELDS)[number];

function oneOf<T extends string>(list: readonly T[], v: string | null): T | undefined {
  return v && (list as readonly string[]).includes(v) ? (v as T) : undefined;
}
function num(v: string | null): number | undefined {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function paramsFromSearch(sp: URLSearchParams): LeadListParams {
  return {
    page: Math.max(1, Math.floor(num(sp.get('page')) ?? 1)),
    pageSize: PAGE_SIZE,
    sort: oneOf(LEAD_SORT_FIELDS, sp.get('sort')) ?? 'score',
    order: sp.get('order') === 'asc' ? 'asc' : 'desc',
    priority: oneOf(PRIORITIES, sp.get('priority')),
    status: oneOf(ANALYSIS_STATUSES, sp.get('status')),
    leadStatus: oneOf(LEAD_STATUSES, sp.get('leadStatus')),
    bookingStatus: oneOf(BOOKING_QUALITIES, sp.get('bookingStatus')),
    whatsapp: oneOf(TRI_STATES, sp.get('whatsapp')),
    minScore: num(sp.get('minScore')),
    maxMobileScore: num(sp.get('maxMobileScore')),
    city: sp.get('city')?.trim() || undefined,
    technology: sp.get('technology')?.trim() || undefined,
    search: sp.get('search')?.trim() || undefined,
  };
}

const FILTER_KEYS = [
  'priority',
  'status',
  'leadStatus',
  'bookingStatus',
  'whatsapp',
  'minScore',
  'maxMobileScore',
  'city',
  'technology',
  'search',
] as const;

function SortHeader({
  label,
  field,
  params,
  onSort,
  align = 'left',
}: {
  label: string;
  field: SortKey;
  params: LeadListParams;
  onSort: (f: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = params.sort === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (params.order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2.5 font-medium', align === 'right' && 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 rounded text-[13px] hover:text-ink',
          active ? 'text-ink' : 'text-ink-2',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        {active ? (
          params.order === 'asc' ? (
            <ArrowUp className="size-3.5" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

function ScoreCell({ lead }: { lead: LeadDto }) {
  if (lead.score === null) {
    return (
      <span className="text-[13px] text-ink-3">
        {isActiveStatus(lead.analysisStatus) ? 'Scoring' : '-'}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="tnum w-7 text-right font-display text-lg leading-none font-semibold">
        {lead.score}
      </span>
      <span className="h-1.5 w-14 rounded-full bg-track" aria-hidden>
        <span
          className="block h-full rounded-r-[3px] rounded-l-full"
          style={{ width: `${lead.score}%`, background: BAND_VAR[scoreBand(lead.score) ?? 'low'] }}
        />
      </span>
    </div>
  );
}

function MobileCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-ink-3">-</span>;
  const tone = score >= 90 ? 'text-good' : score >= 50 ? 'text-warn' : 'text-bad';
  return <span className={cn('tnum text-[13px] font-medium', tone)}>{score}</span>;
}

export default function Leads() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const dispatch = useAppDispatch();
  const { openAnalyze } = useAnalyzeDialog();
  const params = useMemo(() => paramsFromSearch(sp), [sp]);

  const [searchText, setSearchText] = useState(params.search ?? '');
  const [showMore, setShowMore] = useState(() =>
    (
      [
        'status',
        'leadStatus',
        'bookingStatus',
        'whatsapp',
        'minScore',
        'maxMobileScore',
        'city',
        'technology',
      ] as const
    ).some((k) => sp.has(k)),
  );
  const [exporting, setExporting] = useState(false);
  const [poll, setPoll] = useState(0);

  const { data, isLoading, isFetching, isError, error, refetch } = useLeadsQuery(params, {
    pollingInterval: poll,
  });

  useEffect(() => {
    setPoll(data?.items.some((l) => isActiveStatus(l.analysisStatus)) ? 4000 : 0);
  }, [data]);

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, value);
          if (key !== 'page') next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  // Keep the box in step with the URL (for example after "Clear filters").
  useEffect(() => setSearchText(params.search ?? ''), [params.search]);
  useEffect(() => {
    if (searchText.trim() === (params.search ?? '')) return;
    const t = setTimeout(() => setParam('search', searchText.trim() || undefined), 350);
    return () => clearTimeout(t);
  }, [searchText, params.search, setParam]);

  const activeFilters = FILTER_KEYS.filter((k) => sp.has(k) && sp.get(k) !== '');
  const clearFilters = () => {
    setSp(new URLSearchParams(), { replace: true });
    setSearchText('');
  };

  function onSort(field: SortKey) {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        const same = (prev.get('sort') ?? 'score') === field;
        const currentOrder = prev.get('order') === 'asc' ? 'asc' : 'desc';
        next.set('sort', field);
        next.set(
          'order',
          same
            ? currentOrder === 'asc'
              ? 'desc'
              : 'asc'
            : field === 'businessName'
              ? 'asc'
              : 'desc',
        );
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all: LeadDto[] = [];
      for (let page = 1; page <= 20; page++) {
        const res = await dispatch(
          api.endpoints.leads.initiate(
            { ...params, page, pageSize: 100 },
            { forceRefetch: true, subscribe: false },
          ),
        ).unwrap();
        all.push(...res.items);
        if (page >= res.totalPages) break;
      }
      const head = [
        'Business',
        'Website',
        'City',
        'Phone',
        'Email',
        'Score',
        'Priority',
        'Website quality',
        'Mobile speed',
        'Booking',
        'WhatsApp',
        'Lead status',
        'Gaps',
        'Services to offer',
        'Instagram',
        'Facebook',
      ];
      const lines = all.map((l) =>
        [
          l.businessName,
          l.website,
          l.city,
          l.phone,
          l.email,
          l.score,
          l.priority ? PRIORITY_LABEL[l.priority] : '',
          QUALITY_LABEL[l.websiteQuality],
          l.performance.mobileScore,
          BOOKING_LABEL[l.features.onlineBooking.bookingQuality],
          TRI_LABEL[l.features.whatsapp.status],
          LEAD_STATUS_LABEL[l.leadStatus],
          weakPoints(l).join('; '),
          l.opportunities.map((o) => o.title).join('; '),
          l.instagramUrl,
          l.facebookUrl,
        ]
          .map(csvCell)
          .join(','),
      );
      const blob = new Blob([`\uFEFF${[head.map(csvCell).join(','), ...lines].join('\r\n')}`], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} ${all.length === 1 ? 'lead' : 'leads'}.`);
    } catch (err) {
      toast.error(`Export failed. ${errorText(err)}`);
    } finally {
      setExporting(false);
    }
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : ((params.page ?? 1) - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, (params.page ?? 1) * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every analysed business, ranked by how much work it needs. Filters are saved in the address bar, so you can bookmark a view."
        actions={
          <Button onClick={exportCsv} loading={exporting} disabled={total === 0}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-56 flex-1">
            <Input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search name, city or address"
              aria-label="Search leads"
            />
          </div>
          <div role="group" aria-label="Priority" className="flex gap-1 rounded-lg bg-track p-1">
            {[undefined, ...PRIORITIES].map((p) => (
              <button
                key={p ?? 'all'}
                type="button"
                aria-pressed={params.priority === p}
                onClick={() => setParam('priority', p)}
                className={cn(
                  'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
                  params.priority === p
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-2 hover:text-ink',
                )}
              >
                {p ? PRIORITY_LABEL[p] : 'All'}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            <SlidersHorizontal className="size-4" aria-hidden />
            More filters
          </Button>
        </div>

        {showMore ? (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 md:grid-cols-4">
            <Select
              aria-label="Analysis status"
              value={params.status ?? ''}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value="">Any analysis status</option>
              {ANALYSIS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ANALYSIS_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Outreach status"
              value={params.leadStatus ?? ''}
              onChange={(e) => setParam('leadStatus', e.target.value)}
            >
              <option value="">Any outreach status</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Online booking"
              value={params.bookingStatus ?? ''}
              onChange={(e) => setParam('bookingStatus', e.target.value)}
            >
              <option value="">Any booking quality</option>
              {BOOKING_QUALITIES.map((s) => (
                <option key={s} value={s}>
                  Booking: {BOOKING_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="WhatsApp"
              value={params.whatsapp ?? ''}
              onChange={(e) => setParam('whatsapp', e.target.value)}
            >
              <option value="">Any WhatsApp state</option>
              {TRI_STATES.map((s) => (
                <option key={s} value={s}>
                  WhatsApp: {TRI_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Minimum score"
              value={params.minScore?.toString() ?? ''}
              onChange={(e) => setParam('minScore', e.target.value)}
            >
              <option value="">Any score</option>
              {[40, 60, 80].map((n) => (
                <option key={n} value={n}>
                  Score {n} or more
                </option>
              ))}
            </Select>
            <Select
              aria-label="Mobile speed"
              value={params.maxMobileScore?.toString() ?? ''}
              onChange={(e) => setParam('maxMobileScore', e.target.value)}
            >
              <option value="">Any mobile speed</option>
              {[49, 69].map((n) => (
                <option key={n} value={n}>
                  Mobile speed {n} or less
                </option>
              ))}
            </Select>
            <Input
              aria-label="City"
              placeholder="City (exact name)"
              defaultValue={params.city ?? ''}
              key={`city-${params.city ?? ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setParam('city', e.currentTarget.value.trim());
              }}
              onBlur={(e) => {
                if (e.target.value.trim() !== (params.city ?? ''))
                  setParam('city', e.target.value.trim());
              }}
            />
            <Input
              aria-label="Technology"
              placeholder="Technology (for example Wix)"
              defaultValue={params.technology ?? ''}
              key={`tech-${params.technology ?? ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setParam('technology', e.currentTarget.value.trim());
              }}
              onBlur={(e) => {
                if (e.target.value.trim() !== (params.technology ?? ''))
                  setParam('technology', e.target.value.trim());
              }}
            />
          </div>
        ) : null}

        {activeFilters.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setParam(k, undefined)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong py-0.5 pr-1.5 pl-3 text-[13px] hover:bg-track"
                aria-label={`Remove filter ${k}`}
              >
                <span className="text-ink-3">{k}</span>
                <span className="max-w-40 truncate font-medium">{sp.get(k)}</span>
                <X className="size-3.5 text-ink-3" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[13px] font-medium text-ink-2 underline hover:text-ink"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </Card>

      {isError ? (
        <ErrorNote onRetry={refetch}>{errorText(error)}</ErrorNote>
      ) : isLoading ? (
        <Card className="space-y-3 p-4" aria-busy>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </Card>
      ) : data && data.items.length === 0 ? (
        <Card>
          {activeFilters.length > 0 ? (
            <EmptyState
              icon={SearchX}
              title="No leads match these filters"
              action={<Button onClick={clearFilters}>Clear all filters</Button>}
            >
              Try removing a filter, or lower the minimum score.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Users}
              title="No leads yet"
              action={
                <Button variant="accent" onClick={openAnalyze}>
                  Analyze a website
                </Button>
              }
            >
              Leads you analyze appear here, ranked by score.
            </EmptyState>
          )}
        </Card>
      ) : data ? (
        <Card className={cn('overflow-hidden transition-opacity', isFetching && 'opacity-80')}>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <caption className="sr-only">Leads, sorted by {params.sort}</caption>
              <thead className="border-b border-line bg-surface-2">
                <tr>
                  <SortHeader
                    label="Business"
                    field="businessName"
                    params={params}
                    onSort={onSort}
                  />
                  <SortHeader label="Score" field="score" params={params} onSort={onSort} />
                  <th scope="col" className="px-3 py-2.5 text-[13px] font-medium text-ink-2">
                    Priority
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[13px] font-medium text-ink-2">
                    Website
                  </th>
                  <SortHeader label="Mobile" field="mobileScore" params={params} onSort={onSort} />
                  <th scope="col" className="px-3 py-2.5 text-[13px] font-medium text-ink-2">
                    Booking
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[13px] font-medium text-ink-2">
                    WhatsApp
                  </th>
                  <SortHeader
                    label="Reviews"
                    field="reviewCount"
                    params={params}
                    onSort={onSort}
                    align="right"
                  />
                  <th scope="col" className="px-3 py-2.5 text-[13px] font-medium text-ink-2">
                    Outreach
                  </th>
                  <SortHeader label="Updated" field="updatedAt" params={params} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((l) => (
                  <tr
                    key={l.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button')) return;
                      navigate(`/leads/${l.id}`);
                    }}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="max-w-72 px-3 py-3">
                      <Link
                        to={`/leads/${l.id}`}
                        className="block truncate font-medium text-ink hover:underline"
                      >
                        {l.businessName}
                      </Link>
                      <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                        <span className="truncate">
                          {[hostOf(l.website), l.city].filter(Boolean).join(', ')}
                        </span>
                        {l.website ? (
                          <a
                            href={l.website}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open ${hostOf(l.website)} in a new tab`}
                            className="shrink-0 text-ink-3 hover:text-ink"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreCell lead={l} />
                    </td>
                    <td className="px-3 py-3">
                      {l.score === null ? (
                        <AnalysisPill status={l.analysisStatus} />
                      ) : (
                        <PriorityPill priority={l.priority} />
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px]">{QUALITY_LABEL[l.websiteQuality]}</td>
                    <td className="px-3 py-3">
                      <MobileCell score={l.performance.mobileScore} />
                    </td>
                    <td className="px-3 py-3 text-[13px]">
                      {BOOKING_LABEL[l.features.onlineBooking.bookingQuality]}
                    </td>
                    <td className="px-3 py-3">
                      <TriMark
                        value={l.features.whatsapp.status}
                        yesLabel="Found"
                        noLabel="Not found"
                      />
                    </td>
                    <td className="tnum px-3 py-3 text-right text-[13px]">
                      {formatNumber(l.reviewCount)}
                    </td>
                    <td className="px-3 py-3">
                      <CrmPill status={l.leadStatus} />
                    </td>
                    <td className="px-3 py-3 text-[13px] whitespace-nowrap text-ink-2">
                      {timeAgo(l.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-2">
            <span className="tnum">
              {from} to {to} of {formatNumber(total)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={(params.page ?? 1) <= 1}
                onClick={() => setParam('page', String((params.page ?? 1) - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </Button>
              <span className="tnum px-1">
                Page {params.page} of {Math.max(1, data.totalPages)}
              </span>
              <Button
                size="sm"
                disabled={(params.page ?? 1) >= data.totalPages}
                onClick={() => setParam('page', String((params.page ?? 1) + 1))}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}
