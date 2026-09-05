"use client";

import { useSyncExternalStore } from "react";

// Nothing ever changes, so the subscription is a no-op teardown.
const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * True once the component is running in the browser, false during SSR and the
 * hydration pass.
 *
 * Used to gate createPortal, which needs a real document. The obvious version
 * — useState(false) plus useEffect(() => setMounted(true), []) — is a
 * synchronous setState in an effect, which cascades an extra render on every
 * consumer and is what react-hooks/set-state-in-effect flags.
 *
 * useSyncExternalStore does the same job by design: it is built to return one
 * value on the server and another on the client without a hydration mismatch.
 *
 * Same shape as useMediaQuery in this directory, for the same reason.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, onClient, onServer);
}
