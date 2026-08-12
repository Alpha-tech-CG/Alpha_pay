/* Hand-built lightweight SVG charts — no runtime chart dependency. */
import { cn } from '@/lib/utils';

export function BarChart({ data, className }: { data: { day: string; value: number }[]; className?: string }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className={cn('flex h-52 items-end justify-between gap-3', className)}>
      {data.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-2">
          {/* fixed px height resolves reliably inside a flex column */}
          <div
            className="w-full rounded-t-lg bg-primary/80 transition-all hover:bg-primary"
            style={{ height: `${Math.max(4, (d.value / max) * 176)}px` }}
            title={d.value.toLocaleString('fr-FR')}
          />
          <span className="text-xs text-muted-foreground">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({ data, className }: { data: { day: string; value: number }[]; className?: string }) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const w = 100;
  const h = 40;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / (max - min || 1)) * h;
    return `${x},${y}`;
  });
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" preserveAspectRatio="none">
        <polyline points={pts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline
          points={`0,${h} ${pts.join(' ')} ${w},${h}`}
          fill="var(--primary)"
          opacity="0.08"
          stroke="none"
        />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {data.map((d) => <span key={d.day}>{d.day}</span>)}
      </div>
    </div>
  );
}

export function Donut({ segments, className }: { segments: { operator: string; pct: number; color: string }[]; className?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={cn('flex items-center gap-6', className)}>
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        {segments.map((s) => {
          const len = (s.pct / 100) * c;
          const el = (
            <circle
              key={s.operator}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.operator} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <span className="font-medium">{s.operator}</span>
            <span className="text-muted-foreground">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
