/**
 * PNG encoding cache and export actions (§6).
 *
 * navigator.share() needs a real File while the tap still counts as user
 * activation, so the PNG is encoded ahead of time: 250 ms after typing stops,
 * immediately when the fields lose focus, and after the first render.
 * Never await encoding inside the Share click handler.
 */

const ENCODE_DELAY_MS = 250;

export interface ExportSnapshot {
  /** The cached PNG matches the current canvas. */
  fresh: boolean;
  /** At least one render has happened. */
  rendered: boolean;
}

interface Encoded {
  revision: number;
  blob: Blob;
  file: File;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // The bitmap is copied synchronously when toBlob is called.
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png');
  });
}

export class ExportCache {
  private revision = 0;
  private encoded: Encoded | null = null;
  private inflight: { revision: number; promise: Promise<Blob> } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private snapshot: ExportSnapshot = { fresh: false, rendered: false };
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly fileName: string,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ExportSnapshot => this.snapshot;

  private emit() {
    const next = { fresh: this.encoded?.revision === this.revision, rendered: this.revision > 0 };
    if (next.fresh !== this.snapshot.fresh || next.rendered !== this.snapshot.rendered) {
      this.snapshot = next;
      this.listeners.forEach((l) => l());
    }
  }

  /** Call after every render. The first render encodes immediately; later ones are debounced. */
  markRendered() {
    this.revision++;
    this.emit();
    if (this.revision === 1) this.encodeNow().catch(() => {});
    else this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.encodeNow().catch(() => {}), ENCODE_DELAY_MS);
  }

  /** Encode the current canvas now (or reuse a fresh/in-flight encode). */
  encodeNow(): Promise<Blob> {
    clearTimeout(this.timer);
    if (this.encoded?.revision === this.revision) return Promise.resolve(this.encoded.blob);
    if (this.inflight?.revision === this.revision) return this.inflight.promise;
    const revision = this.revision;
    const promise = toBlob(this.canvas).then((blob) => {
      if (!this.disposed && (!this.encoded || revision >= this.encoded.revision)) {
        this.encoded = { revision, blob, file: new File([blob], this.fileName, { type: 'image/png' }) };
        this.emit();
      }
      return blob;
    });
    this.inflight = { revision, promise };
    promise
      .catch(() => {})
      .finally(() => {
        if (this.inflight?.promise === promise) this.inflight = null;
      });
    return promise;
  }

  /** The cached File, only if it matches the current canvas. Synchronous, for Share. */
  freshFile(): File | null {
    return this.encoded?.revision === this.revision ? this.encoded.file : null;
  }

  /** A Blob promise for the current canvas (valid input for ClipboardItem). */
  blobPromise(): Promise<Blob> {
    return this.encodeNow();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}

export type ShareOutcome = 'shared' | 'cancelled';

/** Must be called synchronously from a click handler with an already-encoded file. */
export function shareFile(file: File): Promise<ShareOutcome> {
  // Files only: some Android targets drop the file when title/text are present.
  return navigator.share({ files: [file] }).then(
    () => 'shared' as const,
    (err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled' as const;
      throw err;
    },
  );
}

/** Must be called synchronously from a click handler; a Promise<Blob> is valid ClipboardItem data. */
export function copyImage(blob: Blob | Promise<Blob>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
