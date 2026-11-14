import { useEffect, useState } from 'preact/hooks';

export type Loaded<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error' };

/**
 * Run `load` (memoised by the caller) once `needed`; re-run on `retry` after an
 * error. `initial` lets an already-available value render synchronously.
 */
export function useLoaded<T>(load: () => Promise<T>, needed: boolean, initial?: T): [Loaded<T>, () => void] {
  const [state, setState] = useState<Loaded<T>>(initial !== undefined ? { state: 'ready', value: initial } : { state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!needed || state.state === 'ready') return;
    let cancelled = false;
    setState({ state: 'loading' });
    load().then(
      (value) => !cancelled && setState({ state: 'ready', value }),
      () => !cancelled && setState({ state: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [needed, attempt]);
  return [state, () => setAttempt((n) => n + 1)];
}

/** Memoise an async loader; a failure clears it so the next call retries. */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load();
    pending.catch(() => {
      pending = null;
    });
    return pending;
  };
}
