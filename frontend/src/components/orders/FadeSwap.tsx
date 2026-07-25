'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface FadeSwapProps {
  /** Changing this value triggers the cross-fade (e.g. the active filter pill or page number). */
  swapKey: string | number;
  children: ReactNode;
  className?: string;
}

// Cross-fades wrapped content whenever `swapKey` changes (0.2s opacity +
// translateY) — used to swap a list/table body when a filter pill or page
// changes, instead of it snapping straight in. Plain CSS transition on a
// state flip; no animation library (see docs/frontend-design.md
// "List/content swap").
//
// Visibility is derived directly from `swapKey === displayed.key` (no
// separate "visible" state to keep in sync) — that also means a `children`
// update that arrives with the SAME `swapKey` (e.g. a background refetch)
// can be applied immediately with no fade, since it isn't a deliberate
// filter/page swap.
export function FadeSwap({ swapKey, children, className }: FadeSwapProps) {
  const [displayed, setDisplayed] = useState<{ key: string | number; node: ReactNode }>({
    key: swapKey,
    node: children,
  });

  // Same-key content refresh — adjust state during render rather than in an
  // effect (React's documented pattern for "adjusting state when a prop
  // changes"; this only fires for the render where the mismatch is first
  // detected, so it can't loop).
  if (swapKey === displayed.key && displayed.node !== children) {
    setDisplayed({ key: swapKey, node: children });
  }

  useEffect(() => {
    if (swapKey === displayed.key) return;
    // Key actually changed — hold the OLD content on screen (fading out via
    // the `visible` derivation below) for one transition duration, then swap
    // in the new content and let it fade in.
    const timeout = setTimeout(() => {
      setDisplayed({ key: swapKey, node: children });
    }, 200);
    return () => clearTimeout(timeout);
    // Only the key transition should drive the fade; `children` is read
    // inside via the closure captured at the time the key changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapKey]);

  const visible = swapKey === displayed.key;

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
      }}
    >
      {displayed.node}
    </div>
  );
}
