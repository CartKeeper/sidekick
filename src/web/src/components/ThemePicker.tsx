import { THEMES } from '../lib/theme';
import { useAppStore } from '../stores/app';
import { cn } from './ui';

interface ThemePickerProps {
  className?: string;
}

export function ThemePicker({ className }: ThemePickerProps) {
  const { theme, setTheme } = useAppStore();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-label={`Use ${t.name} theme`}
            aria-pressed={active}
            onClick={() => setTheme(t.id)}
            className={cn(
              'flex items-center gap-3 rounded-lg p-3 border cursor-pointer text-left transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
              active
                ? 'border-accent ring-1 ring-accent bg-accent-muted'
                : 'border-border-default bg-surface hover:border-border-strong hover:bg-surface-hover',
            )}
          >
            <span
              className="w-10 h-10 rounded-md shrink-0"
              style={{ background: t.swatch }}
            />
            <div>
              <p className="text-[12px] font-semibold text-text-primary">{t.name}</p>
              <p className="text-[12px] text-text-muted mt-0.5">{t.tagline}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
