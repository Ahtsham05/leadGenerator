import { useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatNumber, shortDay } from '@/lib/format';

export interface Row {
  key: string;
  label: string;
  count: number;
  to?: string;
}

/** Horizontal bars for ranked categories. One series, so no legend; values sit at the tip. */
export function BarList({
  rows,
  empty = 'Nothing to show yet.',
  color = 'var(--series)',
}: {
  rows: Row[];
  empty?: string;
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.every((r) => r.count === 0)) {
    return <p className="py-6 text-center text-sm text-ink-3">{empty}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const label = (
          <span className="block truncate text-[13px] text-ink" title={r.label}>
            {r.label}
          </span>
        );
        return (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(5.5rem,34%)_1fr_2.5rem] items-center gap-3"
          >
            {r.to ? (
              <Link to={r.to} className="min-w-0 hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
            <div className="h-2.5 rounded-full bg-track" aria-hidden>
              <div
                className="h-full rounded-r-[4px] rounded-l-full"
                style={{
                  width: `${Math.max(r.count > 0 ? 3 : 0, (r.count / max) * 100)}%`,
                  background: color,
                }}
              />
            </div>
            <span className="tnum text-right text-[13px] font-medium text-ink">
              {formatNumber(r.count)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface Segment {
  key: string;
  label: string;
  count: number;
  color: string;
  hint?: string;
}

/** One stacked bar with 2px surface gaps, plus a legend that always names every part. */
export function SegmentBar({ segments, total }: { segments: Segment[]; total?: number }) {
  const sum = total ?? segments.reduce((a, s) => a + s.count, 0);
  const shown = segments.filter((s) => s.count > 0);
  return (
    <div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-track"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.count}`).join(', ')}
      >
        {shown.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${s.count}`}
            style={{ width: `${(s.count / Math.max(1, sum)) * 100}%`, background: s.color }}
            className="min-w-1 first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[13px]" title={s.hint}>
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="truncate text-ink-2">{s.label}</span>
            <span className="tnum ml-auto font-medium text-ink">{formatNumber(s.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tip({ children, style }: { children: ReactNode; style: React.CSSProperties }) {
  return (
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md shadow-ink/10"
    >
      {children}
    </div>
  );
}

/** Vertical columns with a hover and keyboard tooltip. */
export function Columns({
  data,
  height = 168,
  colorFor,
  unit = 'leads',
}: {
  data: Row[];
  height?: number;
  colorFor?: (row: Row) => string;
  unit?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const ticks = [niceMax, (niceMax * 3) / 4, niceMax / 2, niceMax / 4, 0];
  return (
    <div className="relative pl-7">
      <div className="relative" style={{ height }}>
        {ticks.map((t, i) => (
          <div
            key={t}
            className="absolute inset-x-0 border-t border-line"
            style={{ top: `${(i / 4) * 100}%` }}
          >
            <span className="tnum absolute -top-2.5 -left-7 w-5 text-right text-[11px] text-ink-3">
              {Number.isInteger(t) ? t : ''}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5">
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              aria-label={`${d.label}: ${d.count} ${unit}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="relative flex h-full min-w-0 flex-1 items-end justify-center"
            >
              <span
                className={cn(
                  'block w-full max-w-6 rounded-t-[4px] transition-opacity',
                  active !== null && active !== i && 'opacity-55',
                )}
                style={{
                  height: `${(d.count / niceMax) * 100}%`,
                  minHeight: d.count > 0 ? 3 : 0,
                  background: colorFor?.(d) ?? 'var(--series)',
                }}
              />
              {active === i ? (
                <Tip style={{ bottom: `calc(${(d.count / niceMax) * 100}% + 8px)`, left: '50%' }}>
                  <span className="font-medium text-ink">{d.label}</span>
                  <span className="ml-2 text-ink-2">
                    {d.count} {unit}
                  </span>
                </Tip>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5">
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-3">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Daily line with a soft area, an end dot and a crosshair tooltip. */
export function Trend({
  data,
  height = 168,
  unit = 'leads added',
}: {
  data: Array<{ key: string; count: number }>;
  height?: number;
  unit?: string;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.count));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / niceMax) * 100;
  const line = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(d.count).toFixed(2)}`)
    .join(' ');
  const area = `${line} L 100 100 L 0 100 Z`;
  const last = data[n - 1];

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  }

  const hovered = hover === null ? null : data[hover];
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div className="relative pl-7">
      <div
        ref={box}
        className="relative touch-pan-y"
        style={{ height }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${total} ${unit} in the last ${n} days`}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="absolute inset-x-0 border-t border-line"
            style={{ top: `${i * 25}%` }}
          >
            <span className="tnum absolute -top-2.5 -left-7 w-5 text-right text-[11px] text-ink-3">
              {Number.isInteger(niceMax - (niceMax * i) / 4) ? niceMax - (niceMax * i) / 4 : ''}
            </span>
          </div>
        ))}
        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--series)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id}-fill)`} />
          <path
            d={line}
            fill="none"
            stroke="var(--series)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {last && hover === null ? (
          <span
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-series"
            style={{ left: `${x(n - 1)}%`, top: `${y(last.count)}%` }}
            aria-hidden
          />
        ) : null}
        {hovered && hover !== null ? (
          <>
            <div
              className="absolute inset-y-0 w-px bg-line-strong"
              style={{ left: `${x(hover)}%` }}
              aria-hidden
            />
            <span
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-series"
              style={{ left: `${x(hover)}%`, top: `${y(hovered.count)}%` }}
              aria-hidden
            />
            <Tip
              style={{
                left: `clamp(3.5rem, ${x(hover)}%, calc(100% - 3.5rem))`,
                top: -6,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <span className="font-medium text-ink">{shortDay(hovered.key)}</span>
              <span className="ml-2 text-ink-2">
                {hovered.count} {unit}
              </span>
            </Tip>
          </>
        ) : null}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{data[0] ? shortDay(data[0].key) : ''}</span>
        <span>{data[Math.floor(n / 2)] ? shortDay(data[Math.floor(n / 2)]!.key) : ''}</span>
        <span>{last ? shortDay(last.key) : ''}</span>
      </div>
    </div>
  );
}
