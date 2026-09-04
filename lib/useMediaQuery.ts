"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * useSyncExternalStore rather than useState + useEffect: matchMedia IS an
 * external store, and the effect version had to seed state with a synchronous
 * setState on mount, which cascades an extra render on every consumer (and is
 * what react-hooks/set-state-in-effect flags). This reads the current value
 * during render instead, so there is no intermediate wrong-value paint on the
 * client.
 *
 * The server snapshot is `false`, so anything gated on this must treat "no
 * match" as the safe default — mobile-first, which is how the callers are
 * written: the report panel does not push, and the upload copy assumes a fine
 * pointer until told otherwise.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
