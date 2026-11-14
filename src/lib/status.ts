import { useExternalStore } from './useExternalStore';

/** One app-wide status message, shown as a toast and announced via aria-live (§3.7). */
export interface StatusMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

let current: StatusMessage | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function announce(text: string, tone: StatusMessage['tone'] = 'info', durationMs = tone === 'error' ? 6000 : 2500) {
  current = { id: nextId++, text, tone };
  emit();
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, durationMs);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useStatus(): StatusMessage | null {
  return useExternalStore(subscribe, () => current);
}
