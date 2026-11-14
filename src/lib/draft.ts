/**
 * Single-session caption restore (§3.4). Survives the tab being discarded while
 * the user is in a share target app. Captions never go to the URL or network.
 */
const KEY = 'fmitw:draft';

interface Draft {
  templateId: string;
  values: Record<string, string>;
}

function read(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return typeof d?.templateId === 'string' && d.values && typeof d.values === 'object' ? d : null;
  } catch {
    return null;
  }
}

/** Captions for `templateId` if it was the most recently edited template, limited to `fieldIds`. */
export function readDraft(templateId: string, fieldIds: string[]): Record<string, string> {
  const d = read();
  if (!d || d.templateId !== templateId) return {};
  const values: Record<string, string> = {};
  for (const id of fieldIds) if (typeof d.values[id] === 'string') values[id] = d.values[id];
  return values;
}

export function writeDraft(templateId: string, values: Record<string, string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ templateId, values } satisfies Draft));
  } catch {
    /* storage unavailable: the app still works, just without restore */
  }
}
