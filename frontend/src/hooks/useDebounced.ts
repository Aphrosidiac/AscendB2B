'use client';

import { useEffect, useState } from 'react';

/**
 * Trails `value` by `delay` ms, resetting the timer on every change.
 *
 * Exists so a search box can stay instant to type in while the request it
 * drives only fires once the user pauses. Keep the raw value in the input and
 * put THIS value in the fetch effect's dependency array — wiring the input to
 * the debounced value instead would make typing feel broken.
 *
 * Without it a list page fires one request per keystroke, and because those
 * responses can land out of order a slow early one ("sem") can overwrite a
 * fast later one ("semaglutide") — the list visibly flickers backwards.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    // Runs before the next effect pass, so each keystroke cancels the
    // pending update rather than queueing another one alongside it.
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
