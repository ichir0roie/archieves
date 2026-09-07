"use client";

import { useCallback, useRef } from "react";

/**
 * Guards a non-idempotent async action (e.g. one that POSTs to create a
 * record) against firing more than once for a single component mount.
 *
 * `runOnMount` is meant for a mount effect: React StrictMode invokes
 * effects twice in development, but a `useRef` flag survives both
 * invocations of the same mount, so only the first call actually runs
 * `action`. A later remount (a real unmount/mount, e.g. the user
 * navigating away and back) gets a fresh ref and runs again.
 *
 * `run` is meant for user-triggered re-runs (a retry button): it skips a
 * call while a previous one is still in flight, so double-clicking can't
 * start two overlapping requests.
 */
export function useRunOnce(action: () => Promise<void>) {
  const hasRunOnMount = useRef(false);
  const isRunning = useRef(false);

  const run = useCallback(async () => {
    if (isRunning.current) return;
    isRunning.current = true;
    try {
      await action();
    } finally {
      isRunning.current = false;
    }
  }, [action]);

  const runOnMount = useCallback(() => {
    if (hasRunOnMount.current) return;
    hasRunOnMount.current = true;
    run();
  }, [run]);

  return { runOnMount, run };
}
