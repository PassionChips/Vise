// Keeps screens in step with the database.
//
// Screens read through `useCoreQuery`. Every successful write in
// `services/viseCore.ts` calls `invalidateData()`, which makes all mounted
// queries reload, so no screen keeps showing stale numbers.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();

export function invalidateData() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeToInvalidation(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface Query<T> {
  data: T | undefined;
  /** True until the first result (or error) arrives. */
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/**
 * Runs `load` on mount, whenever `deps` change and whenever data is
 * invalidated. The previous result stays visible while reloading.
 */
export function useCoreQuery<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Query<T> {
  const dataVersion = useSyncExternalStore(subscribeToInvalidation, () => version);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            data: prev.data,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, retry, ...deps]);

  const reload = useCallback(() => {
    setState((prev) => ({ data: prev.data, loading: true }));
    setRetry((n) => n + 1);
  }, []);

  return { data: state.data, loading: state.loading && state.data === undefined, error: state.error, reload };
}
