import type { Ref } from 'preact';
import { goBack } from '../lib/router';

/** Page header: back to the grid, and the page title. */
export function TopBar({ title, headingRef }: { title: string; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-button" onClick={goBack} aria-label="Back to templates">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <h1 ref={headingRef} tabIndex={-1} className="topbar__title">
        {title}
      </h1>
    </header>
  );
}
