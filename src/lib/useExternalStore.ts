import { useLayoutEffect, useReducer, useRef } from 'preact/hooks';

/**
 * Minimal `useSyncExternalStore`: re-render when `subscribe` reports a change
 * and `getSnapshot()` returns a different value (Object.is). `subscribe`
 * should be stable (module-level or memoised) to avoid resubscribing.
 */
export function useExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T): T {
  const value = getSnapshot();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const latest = useRef({ value, getSnapshot });
  latest.current = { value, getSnapshot };
  useLayoutEffect(() => {
    const check = () => {
      if (!Object.is(latest.current.getSnapshot(), latest.current.value)) rerender(0);
    };
    check(); // catch a change between render and subscribe
    return subscribe(check);
  }, [subscribe]);
  return value;
}
