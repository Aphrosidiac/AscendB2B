'use client';

import { cn } from '@/lib/utils';

export interface TabBarTab<T extends string> {
  value: T;
  label: string;
}

interface TabBarProps<T extends string> {
  tabs: TabBarTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// Underlined-tab navigation for a detail page — e.g. Order Info / Items /
// Shipments / Invoices / Files / History (docs/frontend-design.md "Detail
// page tabs"). No role-gating: every tab renders unconditionally for
// whoever is passed in via `tabs`.
export function TabBar<T extends string>({ tabs, value, onChange, className }: TabBarProps<T>) {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-hide', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors duration-150 cursor-pointer',
              active ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {tab.label}
            <span
              className={cn(
                'absolute left-0 right-0 -bottom-px h-0.5 rounded-full transition-colors duration-150',
                active ? 'bg-primary' : 'bg-transparent'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
