import { useLayoutEffect, useRef } from 'preact/hooks';
import { assetUrl } from '../lib/assets';
import { followLink, templateHref } from '../lib/router';
import type { TemplateSummary } from '../lib/schema';

/** Tiles in the first row on a phone (two columns): the likely largest paint. */
const FIRST_ROW = 2;

// Remembered across grid visits so returning from the editor feels like going back (§3.5).
let savedScrollY = 0;
let lastOpenedId: string | null = null;

interface Props {
  templates: TemplateSummary[];
  /** Called when a tile is pressed, a moment before the click: start loading the editor. */
  onWarm: (templateId: string) => void;
}

export function TemplateGrid({ templates, onWarm }: Props) {
  const tileRefs = useRef(new Map<string, HTMLAnchorElement>());

  useLayoutEffect(() => {
    window.scrollTo(0, savedScrollY);
    if (lastOpenedId) tileRefs.current.get(lastOpenedId)?.focus({ preventScroll: true });
    return () => {
      savedScrollY = window.scrollY;
    };
  }, []);

  function open(e: MouseEvent, id: string) {
    lastOpenedId = id;
    savedScrollY = window.scrollY;
    followLink(e);
  }

  return (
    <div className="home">
      <header className="masthead">
        <h1 className="masthead__title">
          Fastest Meme <span>in the West</span>
        </h1>
      </header>

      <main>
        <ul className="grid" aria-label="Templates">
          {templates.map((t, i) => (
            <li key={t.id}>
              <a
                className="tile"
                href={templateHref(t.id)}
                ref={(el) => {
                  if (el) tileRefs.current.set(t.id, el);
                  else tileRefs.current.delete(t.id);
                }}
                onClick={(e) => open(e, t.id)}
                onPointerDown={() => onWarm(t.id)}
              >
                <picture>
                  {t.avif && <source type="image/avif" srcset={assetUrl(t.thumbnail.replace(/\.\w+$/, '.avif'))} />}
                  <img
                    className="tile__image"
                    src={assetUrl(t.thumbnail)}
                    alt=""
                    // Lazy even for the first rows: on a deep link the prerendered grid is
                    // hidden, and hidden lazy images are never fetched. On screen they still
                    // load at once, and the first ones jump the queue.
                    loading="lazy"
                    fetchpriority={i < FIRST_ROW ? 'high' : 'auto'}
                    decoding="async"
                    width={t.width}
                    height={t.height}
                  />
                </picture>
                <span className="tile__name">{t.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>

      <footer className="footer">
        <p>Runs entirely in your browser. Nothing you type leaves your device.</p>
      </footer>
    </div>
  );
}
