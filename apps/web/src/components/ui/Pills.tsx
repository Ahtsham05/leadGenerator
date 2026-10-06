import type { AnalysisStatus, LeadStatus, Priority, TriState } from '@lead/shared';
import { cn } from '@/lib/cn';
import {
  ANALYSIS_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  PRIORITY_LABEL,
  isActiveStatus,
} from '@/lib/leadView';

const PRIORITY_COLOR: Record<Priority, string> = {
  hot: 'bg-hot',
  high: 'bg-high',
  medium: 'bg-medium',
  low: 'bg-low',
};

export function PriorityPill({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-ink-3">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
      <span className={cn('size-2.5 rounded-full', PRIORITY_COLOR[priority])} aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const ANALYSIS_TONE: Record<AnalysisStatus, string> = {
  pending: 'text-ink-2 border-line-strong',
  analyzing: 'text-ink border-lane',
  completed: 'text-good border-good/40',
  partial: 'text-warn border-warn/40',
  failed: 'text-bad border-bad/40',
  blocked: 'text-bad border-bad/40',
};

export function AnalysisPill({ status }: { status: AnalysisStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        ANALYSIS_TONE[status],
      )}
    >
      {isActiveStatus(status) ? (
        <span className="pulse-dot size-1.5 rounded-full bg-lane" aria-hidden />
      ) : null}
      {ANALYSIS_STATUS_LABEL[status]}
    </span>
  );
}

const CRM_TONE: Partial<Record<LeadStatus, string>> = {
  won: 'text-good border-good/40',
  lost: 'text-ink-3 border-line-strong',
  doNotContact: 'text-bad border-bad/40',
  replied: 'text-ink border-ink-3',
  meeting: 'text-ink border-ink-3',
};

export function CrmPill({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        CRM_TONE[status] ?? 'text-ink-2 border-line-strong',
      )}
    >
      {LEAD_STATUS_LABEL[status]}
    </span>
  );
}

const TRI_TONE: Record<TriState, string> = {
  yes: 'text-good',
  no: 'text-bad',
  unknown: 'text-ink-3',
};

/** Always text plus a glyph, so the state never relies on colour alone. */
export function TriMark({
  value,
  yesLabel = 'Yes',
  noLabel = 'No',
}: {
  value: TriState;
  yesLabel?: string;
  noLabel?: string;
}) {
  const glyph = value === 'yes' ? '✓' : value === 'no' ? '✕' : '?';
  const text = value === 'yes' ? yesLabel : value === 'no' ? noLabel : 'Unknown';
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', TRI_TONE[value])}
    >
      <span aria-hidden className="w-3 text-center">
        {glyph}
      </span>
      {text}
    </span>
  );
}
