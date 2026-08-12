'use client';
import { Check } from 'lucide-react';
import { useTheme, THEMES } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';

/** Inline theme picker (three swatches). Used in profile / settings. */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-3">
      {THEMES.map((t) => (
        <button
          key={t.key}
          onClick={() => setTheme(t.key)}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors',
            theme === t.key ? 'border-primary' : 'border-border hover:border-muted-foreground',
          )}
        >
          <span className="relative flex h-10 w-full items-center justify-center overflow-hidden rounded-lg border border-border" style={{ background: t.bg }}>
            <span className="h-5 w-5 rounded-full" style={{ background: t.swatch }} />
            {theme === t.key && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check size={11} />
              </span>
            )}
          </span>
          <span className="text-xs font-semibold">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
