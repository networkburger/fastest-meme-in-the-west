import { useEffect, useRef, useState } from 'preact/hooks';
import { assetUrl, loadImage } from '../../lib/assets';

/**
 * Dev-only clipboard diagnostics (#/debug). Not included in production builds.
 * Each button calls the clipboard API synchronously inside the tap.
 */

function canvasPng(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d')!);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

const kb = (b?: Blob) => (b ? `${Math.round(b.size / 1024)} KB` : '…');

export default function DebugClipboard() {
  const blobs = useRef<{ tiny?: Blob; photo?: Blob; small?: Blob }>({});
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<string[]>([]);
  const [results, setResults] = useState<{ name: string; result: string }[]>([]);

  useEffect(() => {
    (async () => {
      blobs.current.tiny = await canvasPng(1, 1, (ctx) => {
        ctx.fillStyle = '#c00';
        ctx.fillRect(0, 0, 1, 1);
      });
      const img = await loadImage(assetUrl('templates/disaster-girl.jpg'));
      blobs.current.photo = await canvasPng(img.naturalWidth, img.naturalHeight, (ctx) => ctx.drawImage(img, 0, 0));
      blobs.current.small = await canvasPng(400, 312, (ctx) => ctx.drawImage(img, 0, 0, 400, 312));

      let perm = 'n/a';
      try {
        perm = (await navigator.permissions.query({ name: 'clipboard-write' as PermissionName })).state;
      } catch (e) {
        perm = `query failed (${(e as Error).message})`;
      }
      const supports = (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports;
      setInfo([
        navigator.userAgent,
        `secure context: ${isSecureContext}`,
        `permissions.query(clipboard-write): ${perm}`,
        `ClipboardItem.supports('image/png'): ${typeof supports === 'function' ? supports('image/png') : 'no supports()'}`,
        `blobs: tiny ${kb(blobs.current.tiny)}, small photo ${kb(blobs.current.small)}, full photo ${kb(blobs.current.photo)}`,
      ]);
      setReady(true);
    })().catch((e) => setInfo([`setup failed: ${e}`]));
  }, []);

  function run(name: string, fn: () => Promise<unknown>) {
    const ctx = `activation=${navigator.userActivation?.isActive} focus=${document.hasFocus()}`;
    let p: Promise<unknown>;
    try {
      p = fn();
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      () => setResults((r) => [...r, { name, result: `✅ OK (${ctx})` }]),
      (e: unknown) => {
        const msg = e instanceof Error || e instanceof DOMException ? `${e.name}: ${e.message}` : String(e);
        setResults((r) => [...r, { name, result: `❌ ${msg} (${ctx})` }]);
      },
    );
  }

  const png = (b: Blob | Promise<Blob>) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
  const later = (b: Blob, ms: number) => new Promise<Blob>((res) => setTimeout(() => res(b), ms));

  const tests: [string, () => Promise<unknown>][] = [
    ['1. writeText', () => navigator.clipboard.writeText('Fastest Meme clipboard test')],
    ['2. write text/plain item', () => navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob(['hello'], { type: 'text/plain' }) })])],
    ['3. tiny PNG blob (1×1)', () => png(blobs.current.tiny!)],
    ['4. small PNG blob (400×312)', () => png(blobs.current.small!)],
    ['5. full PNG blob (1756×1368)', () => png(blobs.current.photo!)],
    ['6. tiny PNG as Promise', () => png(Promise.resolve(blobs.current.tiny!))],
    ['7. small PNG, Promise resolving after 1s', () => png(later(blobs.current.small!, 1000))],
  ];

  return (
    <main className="error-screen" style={{ fontSize: 14 }}>
      <h1 style={{ fontSize: 20 }}>Clipboard diagnostics</h1>
      <ul style={{ paddingLeft: 16, overflowWrap: 'anywhere' }}>
        {info.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div style={{ display: 'grid', gap: 8 }}>
        {tests.map(([name, fn]) => (
          <button key={name} type="button" className="button button--secondary" disabled={!ready} onClick={() => run(name, fn)}>
            {name}
          </button>
        ))}
      </div>
      <h2>Results</h2>
      <ol style={{ paddingLeft: 16, overflowWrap: 'anywhere' }}>
        {results.map((r, i) => (
          <li key={i}>
            <strong>{r.name}</strong>: {r.result}
          </li>
        ))}
      </ol>
      <p>After an OK, paste in another app to confirm what actually landed on the clipboard.</p>
    </main>
  );
}
