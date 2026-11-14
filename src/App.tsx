import type { ComponentChildren, ComponentType } from 'preact';
import { useEffect, useErrorBoundary, useState } from 'preact/hooks';
import { ErrorScreen } from './components/ErrorScreen';
import { MemeEditor } from './components/MemeEditor';
import type { TemplateSummary } from './lib/schema';
import { TemplateGrid } from './components/TemplateGrid';
import { TopBar } from './components/TopBar';
import { assetUrl, loadImage } from './lib/assets';
import { loadMemeFont } from './lib/fonts';
import { inlineLibrary, loadLibrary, templateIndex } from './lib/library';
import { useLoaded } from './lib/useLoaded';
import { useRoute } from './lib/router';
import { useStatus } from './lib/status';

/** Dev-only diagnostics page (#/debug); the dynamic import is compiled out of production builds. */
function DevDebug() {
  const [Page, setPage] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV) void import('./components/dev/DebugClipboard').then((m) => setPage(() => m.default));
  }, []);
  return Page ? <Page /> : null;
}

const toGrid = { label: 'All templates', onClick: () => window.location.replace('#/') };

/**
 * Warm what opening a template needs: the library data, the caption font and,
 * given a template id, its image. Errors are ignored here; they surface in the editor.
 */
export function warmEditor(templateId?: string) {
  loadMemeFont().catch(() => {});
  loadLibrary()
    .then((library) => {
      const template = templateId && library.find((t) => t.id === templateId);
      if (template) return loadImage(assetUrl(template.image));
    })
    .catch(() => {});
}

/** Editor page while the library data arrives: same layout, empty canvas, spinner. */
function EditorLoading({ template }: { template: TemplateSummary }) {
  return (
    <div className="editor">
      <TopBar title={template.name} />
      <div className="editor__body">
        <div className="editor__preview">
          <div className="preview" data-state="loading">
            <canvas className="preview__canvas" width={template.width} height={template.height} aria-hidden="true" />
            <div className="preview__overlay" aria-hidden="true">
              <span className="spinner" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusToast() {
  const status = useStatus();
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {status && (
        <div key={status.id} className={`toast toast--${status.tone}`}>
          {status.text}
        </div>
      )}
    </div>
  );
}

/**
 * Last line of defence (§9, criterion 13): a bug that throws while rendering a
 * page shows an error instead of a blank screen. Keyed by route by the caller,
 * so navigating away (Back, or the button) starts afresh.
 */
function CrashGuard({ onGrid, children }: { onGrid: boolean; children: ComponentChildren }) {
  const [error] = useErrorBoundary((e) => console.error(e));
  if (!error) return <>{children}</>;
  return (
    <ErrorScreen
      title="Something went wrong"
      message="Sorry, this page hit a bug."
      action={onGrid ? { label: 'Reload', onClick: () => window.location.reload() } : toGrid}
    />
  );
}

export function App() {
  const route = useRoute();

  const [library, retryLibrary] = useLoaded(loadLibrary, route.name === 'editor', inlineLibrary);

  useEffect(() => {
    // Once the page has settled, warm what the editor needs, so opening a template is
    // quick without competing with the grid's thumbnails.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    const warm = () => idle(() => warmEditor());
    if (document.readyState === 'complete') warm();
    else window.addEventListener('load', warm, { once: true });
  }, []);

  const libraryError = (
    <ErrorScreen
      title="Couldn't load the templates"
      message="Check your connection and try again."
      action={{ label: 'Try again', onClick: retryLibrary }}
    />
  );

  let content;
  if (route.name === 'grid') {
    content = <TemplateGrid templates={templateIndex} onWarm={warmEditor} />;
  } else if (route.name === 'debug' && import.meta.env.DEV) {
    content = <DevDebug />;
  } else if (route.name === 'editor') {
    const summary = templateIndex.find((t) => t.id === route.templateId);
    const template = library.state === 'ready' ? library.value.find((t) => t.id === route.templateId) : undefined;
    if (!summary) {
      content = <ErrorScreen title="Template not found" message="That template doesn't exist (any more)." action={toGrid} />;
    } else if (template) {
      content = <MemeEditor key={template.id} template={template} />;
    } else {
      content = library.state === 'error' ? libraryError : <EditorLoading template={summary} />;
    }
  } else {
    content = <ErrorScreen title="Page not found" message="There's nothing here." action={toGrid} />;
  }

  return (
    <>
      <CrashGuard key={route.name === 'editor' ? `t/${route.templateId}` : route.name} onGrid={route.name === 'grid'}>
        {content}
      </CrashGuard>
      <StatusToast />
    </>
  );
}
