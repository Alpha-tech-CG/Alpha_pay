import { cn } from '@/lib/utils';

/**
 * Deterministic QR-like placeholder (no external lib). Renders a stable grid
 * pattern from a seed string plus the AlphaPay corner framing from the mockup.
 */
export function QRCode({ seed = 'alphapay', size = 240, className }: { seed?: string; size?: number; className?: string }) {
  const cells = 21;
  const bits: boolean[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  for (let i = 0; i < cells * cells; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    bits.push((h >> 8) % 100 < 48);
  }
  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);

  return (
    <div className={cn('relative rounded-[2rem] bg-white p-6 shadow-2xl', className)} style={{ width: size + 48, height: size + 48 }}>
      <svg viewBox={`0 0 ${cells} ${cells}`} width={size} height={size} shapeRendering="crispEdges">
        {Array.from({ length: cells }).map((_, r) =>
          Array.from({ length: cells }).map((_, c) => {
            const on = finder(r, c) ? true : bits[r * cells + c];
            if (!on) return null;
            return <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#1A1A2E" />;
          }),
        )}
      </svg>
      {/* center AP badge */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-2xl border-4 border-white bg-white p-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-heading text-xs font-black text-primary-foreground">
            AP
          </div>
        </div>
      </div>
      {/* coral corner frames */}
      <div className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
      <div className="pointer-events-none absolute right-3 top-3 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
      <div className="pointer-events-none absolute bottom-3 left-3 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
      <div className="pointer-events-none absolute bottom-3 right-3 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-primary" />
    </div>
  );
}
