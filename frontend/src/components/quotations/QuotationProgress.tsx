'use client';

import { Check, TriangleAlert, CalendarClock, CircleCheck, CircleSlash, FileClock } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { QuotationStatus } from '@/types';

const DAY_MS = 86_400_000;

export type ValidityTone = 'danger' | 'warning' | 'neutral' | 'success';

export interface QuoteValidity {
  /** True when the quote can no longer be accepted because its date has passed (or an admin expired it). */
  expired: boolean;
  /** Whole days until validUntil — positive while live, <= 0 once past due. */
  daysLeft: number;
  /** Whether the validity window still matters at all (ACCEPTED/REJECTED are settled). */
  settled: boolean;
  headline: string;
  detail: string;
  tone: ValidityTone;
}

/**
 * The single most consequential fact about a quote: is it still an offer?
 *
 * `validUntil` is authoritative, not `status` — the backend only flips a row
 * to EXPIRED lazily (see finalizeAcceptQuotation in
 * backend/src/modules/quotations/quotations.controller.ts, which expires a
 * past-due SENT quote at accept time). So a SENT quote whose date has passed
 * is already dead even though the stored status still says SENT, and this
 * reads it that way rather than trusting the badge.
 */
export function getQuoteValidity(status: QuotationStatus, validUntil: string, now: number = Date.now()): QuoteValidity {
  const until = new Date(validUntil).getTime();
  const ms = until - now;
  const daysLeft = ms > 0 ? Math.ceil(ms / DAY_MS) : -Math.floor(-ms / DAY_MS);
  const pastDue = ms <= 0;

  if (status === 'ACCEPTED') {
    return {
      expired: false,
      daysLeft,
      settled: true,
      headline: 'Accepted',
      detail: 'These prices are locked in — this quote has been converted into an order.',
      tone: 'success',
    };
  }

  if (status === 'REJECTED') {
    return {
      expired: false,
      daysLeft,
      settled: true,
      headline: 'Rejected',
      detail: 'This quote was declined and can no longer be accepted.',
      tone: 'neutral',
    };
  }

  if (status === 'EXPIRED' || pastDue) {
    const daysAgo = Math.max(0, -daysLeft);
    return {
      expired: true,
      daysLeft,
      settled: false,
      headline: daysAgo >= 1 ? `Expired ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago` : 'Expired',
      detail: `These prices lapsed on ${formatDate(validUntil)} and are no longer an offer. Request a fresh quote to continue.`,
      tone: 'danger',
    };
  }

  if (status === 'DRAFT') {
    return {
      expired: false,
      daysLeft,
      settled: false,
      headline: 'Not issued yet',
      detail: `Pricing is still being prepared. Once issued, this quote would hold until ${formatDate(validUntil)}.`,
      tone: 'neutral',
    };
  }

  // SENT and live.
  if (daysLeft <= 3) {
    return {
      expired: false,
      daysLeft,
      settled: false,
      headline: daysLeft <= 1 ? 'Expires today' : `Expires in ${daysLeft} days`,
      detail: `These prices hold only until ${formatDate(validUntil)}. Accept before then to lock them in.`,
      tone: 'warning',
    };
  }

  return {
    expired: false,
    daysLeft,
    settled: false,
    headline: `Valid for ${daysLeft} more days`,
    detail: `These prices hold until ${formatDate(validUntil)}.`,
    tone: 'neutral',
  };
}

const TONE_STYLES: Record<ValidityTone, string> = {
  // Same red-50/red-200/text-danger combination every error banner in the app
  // already uses, so "this is bad news" reads identically everywhere.
  danger: 'bg-red-50 border-red-200 text-danger',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  neutral: 'bg-surface-elevated border-border text-text-secondary',
  success: 'bg-green-50 border-green-200 text-green-800',
};

const TONE_ICONS: Record<ValidityTone, typeof TriangleAlert> = {
  danger: TriangleAlert,
  warning: CalendarClock,
  neutral: FileClock,
  success: CircleCheck,
};

interface ValidityCalloutProps {
  validity: QuoteValidity;
  /** Overrides the generic copy where a page has something more specific to say. */
  detail?: string;
  className?: string;
}

export function ValidityCallout({ validity, detail, className }: ValidityCalloutProps) {
  const Icon = TONE_ICONS[validity.tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3.5', TONE_STYLES[validity.tone], className)}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-display font-semibold text-sm">{validity.headline}</p>
        <p className="text-sm opacity-90 mt-0.5">{detail ?? validity.detail}</p>
      </div>
    </div>
  );
}

/** Compact inline chip for list rows, where a full callout would be too heavy. */
export function ValidityChip({ validity, className }: { validity: QuoteValidity; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_STYLES[validity.tone],
        className
      )}
    >
      {validity.headline}
    </span>
  );
}

const QUOTE_STEPS = ['Requested', 'Sent', 'Accepted'] as const;

const QUOTE_STEP_INDEX: Record<QuotationStatus, number> = {
  DRAFT: 0,
  SENT: 1,
  ACCEPTED: 2,
  // Terminal states have no step — rendered as a chip beside the track, the
  // same convention OrderStepper uses for CANCELLED.
  REJECTED: -1,
  EXPIRED: -1,
};

/**
 * Three-step lifecycle track for a quote — the quotation analogue of
 * OrderStepper. A quote genuinely only has three forward states, so this is
 * deliberately shorter than the order stepper rather than padded out to match
 * its width.
 */
export function QuotationStepper({ status, className }: { status: QuotationStatus; className?: string }) {
  const terminal = status === 'REJECTED' || status === 'EXPIRED';
  const currentStep = QUOTE_STEP_INDEX[status];

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-start">
        {QUOTE_STEPS.map((label, i) => {
          const state = terminal ? 'pending' : i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
          const isLast = i === QUOTE_STEPS.length - 1;
          return (
            <div key={label} className={cn('flex items-start', !isLast && 'flex-1')}>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div
                  className={cn(
                    'relative w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-500 ease-out',
                    state === 'done' && 'bg-primary border-primary text-white',
                    state === 'active' && 'bg-surface border-primary text-primary',
                    state === 'pending' && 'bg-surface border-border text-text-muted'
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out',
                      state === 'done' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                    )}
                  >
                    <Check className="w-4 h-4" />
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold transition-all duration-200 ease-out',
                      state === 'done' ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap transition-colors duration-500 ease-out',
                    state === 'pending' ? 'text-text-muted' : 'text-text-primary'
                  )}
                >
                  {label}
                </span>
              </div>

              {!isLast && (
                <div className="flex-1 h-0.5 mx-2 mt-[17px] rounded-full bg-border relative overflow-hidden">
                  <div
                    className={cn(
                      'absolute inset-0 rounded-full transition-all duration-500 ease-out',
                      !terminal && i < currentStep ? 'bg-primary' : 'bg-transparent'
                    )}
                  />
                  {!terminal && i === currentStep - 1 && (
                    <div className="absolute inset-0 overflow-hidden rounded-full">
                      <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-shimmer" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {terminal && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-danger bg-danger/10 border border-danger/20 rounded-full px-2.5 py-1">
          <CircleSlash className="w-3.5 h-3.5" />
          {status === 'REJECTED' ? 'Rejected' : 'Expired'}
        </div>
      )}
    </div>
  );
}
