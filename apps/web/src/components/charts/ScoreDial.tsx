import { cn } from '@/lib/cn';
import { PRIORITY_LABEL, scoreBand } from '@/lib/leadView';

const BAND_VAR = {
  hot: 'var(--hot)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
} as const;

const CX = 100;
const CY = 100;
const R = 80;

/** Point on the dial for a value from 0 to 100 (0 is the left end, 100 the right end). */
export function dialPoint(value: number, radius = R): [number, number] {
  const theta = Math.PI * (1 - Math.min(100, Math.max(0, value)) / 100);
  return [CX + radius * Math.cos(theta), CY - radius * Math.sin(theta)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = dialPoint(from);
  const [x2, y2] = dialPoint(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * The one memorable element: a speedometer for the opportunity score. Ticks mark the
 * priority thresholds (40, 60, 80); the lane-yellow needle is the only yellow on the page
 * that is not navigation.
 */
export function ScoreDial({ score, className }: { score: number | null; className?: string }) {
  const band = scoreBand(score);
  const color = band ? BAND_VAR[band] : 'var(--line-strong)';
  const label =
    score === null
      ? 'No score yet'
      : `Score ${score} out of 100, ${PRIORITY_LABEL[band!]} priority`;
  const [nx, ny] = dialPoint(score ?? 0, R - 14);
  return (
    <figure className={cn('relative', className)} aria-label={label}>
      <svg viewBox="0 0 200 118" className="w-full" role="img" aria-hidden>
        <path
          d={arc(0, 100)}
          fill="none"
          stroke="var(--track)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {score !== null && score > 0 ? (
          <path
            d={arc(0, score)}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
        ) : null}
        {Array.from({ length: 11 }, (_, i) => i * 10).map((t) => {
          const major = t === 40 || t === 60 || t === 80;
          const [x1, y1] = dialPoint(t, R + 13);
          const [x2, y2] = dialPoint(t, R + (major ? 22 : 18));
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={major ? 'var(--ink-2)' : 'var(--line-strong)'}
              strokeWidth={major ? 2 : 1.5}
              strokeLinecap="round"
            />
          );
        })}
        {score !== null ? (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={nx}
              y2={ny}
              stroke="var(--lane)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle
              cx={CX}
              cy={CY}
              r="7"
              fill="var(--lane)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </>
        ) : null}
      </svg>
      <figcaption className="-mt-6 text-center">
        <span className="font-display text-5xl leading-none font-semibold tracking-tight">
          {score === null ? '--' : score}
        </span>
        <span className="mt-1 block text-[13px] font-medium text-ink-2">
          {band ? `${PRIORITY_LABEL[band]} priority` : 'Not scored yet'}
        </span>
      </figcaption>
    </figure>
  );
}
