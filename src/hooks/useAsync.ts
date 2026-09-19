import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal async state hook: data, loading, error, and a retry.
 *
 * Deliberately not TanStack Query — Phase 1 has a handful of reads and no cache
 * invalidation requirements. Revisit when mutations and cross-page cache
 * consistency arrive in Phase 3.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The caller owns the dependency list; fn is recreated on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    run()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Unexpected error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [run, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, retry };
}
