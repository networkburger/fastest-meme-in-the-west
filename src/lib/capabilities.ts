/** Feature detection for export actions, run once at startup (§6.2). */
export interface Capabilities {
  share: boolean;
  copy: boolean;
}

function canShareFiles(): boolean {
  try {
    if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function canCopyImages(): boolean {
  try {
    if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false;
    const supports = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports;
    return typeof supports === 'function' ? supports('image/png') : true;
  } catch {
    return false;
  }
}

/*
 * Some browsers (seen: Firefox for Android) report image clipboard
 * support and a granted permission, yet refuse every image write with
 * NotAllowedError. That can only be discovered by trying, so a refusal is
 * remembered per browser version (the user agent) and Copy is hidden until
 * the browser updates.
 */
const COPY_BLOCKED_KEY = 'fmitw:image-copy-blocked-ua';

function imageCopyKnownBlocked(): boolean {
  try {
    return localStorage.getItem(COPY_BLOCKED_KEY) === navigator.userAgent;
  } catch {
    return false;
  }
}

export function rememberImageCopyBlocked() {
  try {
    localStorage.setItem(COPY_BLOCKED_KEY, navigator.userAgent);
  } catch {
    /* storage unavailable: Copy will simply be offered again next visit */
  }
}

export const capabilities: Capabilities = {
  share: typeof window !== 'undefined' && canShareFiles(),
  copy: typeof window !== 'undefined' && canCopyImages() && !imageCopyKnownBlocked(),
};

export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
