import { useState } from 'preact/hooks';
import { useExternalStore } from '../lib/useExternalStore';
import { capabilities, isIOS, rememberImageCopyBlocked } from '../lib/capabilities';
import { copyImage, downloadBlob, shareFile, type ExportCache, type ExportSnapshot } from '../lib/exportMeme';
import { announce } from '../lib/status';

type Action = 'share' | 'copy' | 'download';

const IDLE: ExportSnapshot = { fresh: false, rendered: false };
const noopSubscribe = () => () => {};
const idleSnapshot = () => IDLE;

/** Supported actions in priority order; the first is the primary button (§6.2). */
function supportedActions(): Action[] {
  return [...(capabilities.share ? (['share'] as const) : []), ...(capabilities.copy ? (['copy'] as const) : []), 'download'];
}

let iosHintShown = false;

/** In dev builds, append the underlying error so device testing can diagnose failures. */
function withDetail(message: string, err: unknown): string {
  console.warn(message, err);
  if (!import.meta.env.DEV) return message;
  const detail = err instanceof Error || err instanceof DOMException ? `${err.name}: ${err.message}` : String(err);
  return `${message} [${detail}]`;
}

const ICONS: Record<Action, string> = {
  share: 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  copy: 'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
};

function Icon({ action }: { action: Action }) {
  return (
    <svg className="button__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[action]} />
    </svg>
  );
}

export function ExportActions({ cache }: { cache: ExportCache | null }) {
  const snap = useExternalStore(cache?.subscribe ?? noopSubscribe, cache?.getSnapshot ?? idleSnapshot);
  const ready = cache !== null && snap.rendered;
  const [actions, setActions] = useState(supportedActions);

  // Each handler calls the platform API synchronously, inside the tap (§6.1).
  function onShare() {
    if (!cache) return;
    const file = cache.freshFile();
    if (!file) {
      cache.encodeNow().catch(() => {});
      return;
    }
    shareFile(file).catch((err: unknown) =>
      announce(withDetail("Couldn't open sharing — try Download.", err), 'error', 15000),
    );
  }

  function onCopy() {
    if (!cache) return;
    // A refusal despite a live tap and a focused page means this browser blocks image copies outright.
    const gestureOk = (navigator.userActivation?.isActive ?? true) && document.hasFocus();
    copyImage(cache.freshFile() ?? cache.blobPromise()).then(
      () => announce('Copied'),
      (err: unknown) => {
        if (gestureOk && err instanceof DOMException && err.name === 'NotAllowedError') {
          rememberImageCopyBlocked();
          capabilities.copy = false;
          setActions(supportedActions());
          const alternative = capabilities.share ? 'Share' : 'Download';
          announce(withDetail(`This browser doesn't allow copying images. Use ${alternative} instead.`, err), 'error', 6000);
        } else {
          announce(withDetail("Couldn't copy the image — use Share or Download instead.", err), 'error', 15000);
        }
      },
    );
  }

  function onDownload() {
    if (!cache) return;
    cache.blobPromise().then(
      (blob) => {
        downloadBlob(blob, cache.fileName);
        if (isIOS && !iosHintShown) {
          iosHintShown = true;
          announce('Saved to the Files app. To save to Photos, use Share → Save Image.', 'info', 6000);
        }
      },
      () => announce("Couldn't create the image. Try again.", 'error'),
    );
  }

  const handlers: Record<Action, () => void> = { share: onShare, copy: onCopy, download: onDownload };
  const labels: Record<Action, string> = {
    share: ready && !snap.fresh ? 'Preparing…' : 'Share',
    copy: 'Copy',
    download: 'Download',
  };

  return (
    <div className="actions" role="group" aria-label="Export">
      {actions.map((action, i) => (
        <button
          key={action}
          type="button"
          className={`button ${i === 0 ? 'button--primary' : 'button--secondary'}`}
          disabled={!ready || (action === 'share' && !snap.fresh)}
          onClick={handlers[action]}
        >
          <Icon action={action} />
          {labels[action]}
        </button>
      ))}
    </div>
  );
}
