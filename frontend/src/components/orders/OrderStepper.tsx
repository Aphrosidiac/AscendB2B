import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompanyOrderStatus } from '@/types';

const STEPS = ['Placed', 'Confirmed', 'Packing', 'Shipped', 'Delivered', 'Complete'] as const;

// PARTIALLY_SHIPPED and SHIPPED both map to the "Shipped" step — see
// docs/frontend-design.md's "Order lifecycle" table. CANCELLED has no step
// index; it's rendered as a terminal state off to the side instead.
const STATUS_STEP_INDEX: Record<Exclude<CompanyOrderStatus, 'CANCELLED'>, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PACKING: 2,
  SHIPPED: 3,
  PARTIALLY_SHIPPED: 3,
  DELIVERED: 4,
  COMPLETE: 5,
};

type StepState = 'done' | 'active' | 'pending';

interface OrderStepperProps {
  status: CompanyOrderStatus;
  className?: string;
}

// Girpack's OrderStepper.vue, ported 1:1 to Tailwind/CSS-only React (see
// docs/frontend-design.md "Transitions"): `transition-all duration-500
// ease-out` on each circle's border/bg/text swap, a 0.2s scale+opacity
// cross-fade between the number and the done checkmark, and a `shimmer`
// gradient sweep on the connector segment leading INTO the active step.
// `--color-primary` (near-black) stands in for Girpack's blue-600.
export function OrderStepper({ status, className }: OrderStepperProps) {
  const cancelled = status === 'CANCELLED';
  const currentStep = cancelled ? -1 : STATUS_STEP_INDEX[status];

  const stepState = (i: number): StepState => {
    if (cancelled) return 'pending';
    if (i < currentStep) return 'done';
    if (i === currentStep) return 'active';
    return 'pending';
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop / tablet */}
      <div className="hidden sm:flex items-start">
        {STEPS.map((label, i) => {
          const state = stepState(i);
          const isLast = i === STEPS.length - 1;
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
                      i < currentStep && !cancelled ? 'bg-primary' : 'bg-transparent'
                    )}
                  />
                  {i === currentStep - 1 && !cancelled && (
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

      {cancelled && (
        <div className="hidden sm:inline-flex mt-3 items-center gap-1.5 text-xs font-medium text-danger bg-danger/10 border border-danger/20 rounded-full px-2.5 py-1">
          Cancelled
        </div>
      )}

      {/* Mobile — compact segmented bar, only the active step's label shown. */}
      <div className="sm:hidden">
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => {
            const state = stepState(i);
            return (
              <div
                key={label}
                className={cn(
                  'flex-1 h-1.5 rounded-full relative overflow-hidden transition-all duration-500 ease-out',
                  state === 'done' && 'bg-primary',
                  state === 'active' && 'bg-primary/40',
                  state === 'pending' && 'bg-border'
                )}
              >
                {state === 'active' && (
                  <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary/70 to-transparent animate-shimmer" />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500 ease-out',
                cancelled ? 'bg-surface border-danger text-danger' : 'bg-surface border-primary text-primary'
              )}
            >
              <span className="text-[11px] font-semibold">{cancelled ? '!' : currentStep + 1}</span>
            </div>
            <span className="text-sm font-medium text-text-primary">{cancelled ? 'Cancelled' : STEPS[currentStep]}</span>
          </div>
          {!cancelled && (
            <span className="text-xs text-text-muted">Step {currentStep + 1} of {STEPS.length}</span>
          )}
        </div>
      </div>
    </div>
  );
}
