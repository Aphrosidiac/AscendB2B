'use client';

import { cn } from '@/lib/utils';

export interface StatusFilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface StatusFilterPillsProps<T extends string> {
  options: StatusFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// Horizontal row of filter pills for an order/quotation/invoice list — active
// pill filled with --color-primary, inactive pills bordered. Overflows into a
// horizontally-scrollable strip (scrollbar hidden) on narrow viewports rather
// than wrapping, so the granular status set (see docs/frontend-design.md)
// stays a single row.
export function StatusFilterPills<T extends string>({ options, value, onChange, className }: StatusFilterPillsProps<T>) {
  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 cursor-pointer',
              active
                ? 'bg-primary border-primary text-white'
                : 'bg-surface border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className={cn('text-xs tabular-nums', active ? 'text-white/70' : 'text-text-muted')}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
