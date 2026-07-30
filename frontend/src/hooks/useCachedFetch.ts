'use client';

import { useCallback, useEffect, useState } from 'react';

// Module-level, so it survives unmounting a page and navigating back to it.
// Deliberately not persisted anywhere — a full reload should start clean
// rather than resurrect rows that may be hours stale.
const cache = new Map<string, unknown>();

/**
 * Drop cached entries. No argument clears everything; a string clears every
 * key starting with it.
 *
 * Call this after a mutation that invalidates a list the user might navigate
 * back to — editing an order makes every cached /admin/orders page wrong, and
 * the stale-while-revalidate pass below would otherwise show the old row for
 * one round trip before correcting itself.
 */
export function invalidateCache(prefix?: string) {
  if (prefix === undefined) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

interface CachedState<T> {
  data: T;
  loading: boolean;
}

/**
 * Stale-while-revalidate for the admin list pages.
 *
 * Every admin page fetches on mount, so re-entering a list you were just
 * looking at meant a full skeleton and a full round trip — on a box where
 * that round trip has measured anywhere from 0.1s to 4s. This paints the
 * previous result immediately and refreshes behind it, so a revisit costs
 * nothing visually and the data still converges.
 *
 * `key` doubles as the cache key and the fetch trigger: build it from every
 * input the request depends on (filters, debounced search, page). Pass null
 * while the auth token is still loading — that suspends fetching without
 * caching anything under a bogus key.
 *
 * `fetcher` must be stable — wrap it in useCallback with the same inputs that
 * make up `key`, or this will refetch on every render.
 */
export function useCachedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  fallback: T
): { data: T; loading: boolean; refresh: () => void } {
  const initial = (k: string | null): CachedState<T> => {
    const hit = k !== null && cache.has(k) ? (cache.get(k) as T) : undefined;
    // A cache hit paints straight away and revalidates silently, so `loading`
    // stays false and the page never flashes its skeleton on a revisit.
    return hit !== undefined ? { data: hit, loading: false } : { data: fallback, loading: true };
  };

  const [state, setState] = useState<CachedState<T>>(() => initial(key));
  const [shownKey, setShownKey] = useState(key);
  const [nonce, setNonce] = useState(0);

  // Adjusting during render rather than in an effect: changing filters must
  // not paint the previous key's rows for a frame first, and an effect would
  // cost an extra render pass to correct it.
  if (key !== shownKey) {
    setShownKey(key);
    setState(initial(key));
  }

  useEffect(() => {
    if (key === null) return;
    // Guards against a slow earlier response overwriting a fast later one
    // when the key changes mid-flight — debouncing narrows that window but
    // doesn't close it (filter pills and pagination aren't debounced).
    let cancelled = false;

    fetcher()
      .then((result) => {
        if (cancelled) return;
        cache.set(key, result);
        setState({ data: result, loading: false });
      })
      .catch(() => {
        // Same swallow-and-stop as the pages this replaces: a failed refresh
        // leaves whatever is on screen rather than blanking the list.
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [key, fetcher, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data: state.data, loading: state.loading, refresh };
}
