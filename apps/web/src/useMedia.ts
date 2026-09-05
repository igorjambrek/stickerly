/**
 * Screen size as state.
 *
 * Most of the responsive work is done in CSS, where it belongs. This hook is
 * for the few places where a phone needs *different markup* rather than a
 * different arrangement of the same markup — the editor's toolbar, which
 * becomes a sheet, and the album spread, which becomes one page you swipe.
 * Duplicating those in the DOM and hiding one half with `display: none` would
 * mean two page sheets mounted at once, two file inputs, two of every id.
 */

import { useEffect, useState } from 'react';

/** True while `query` matches. Server-safe default: false, i.e. the wide layout. */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/**
 * The one breakpoint the components share, so "is this a phone?" cannot mean
 * one width in the editor and another in the stylesheet. It matches the
 * `--phone` media queries in `styles.css`.
 */
export const PHONE = '(max-width: 760px)';

/** True on a phone or tablet: no hover, so nothing may hide behind one. */
export const useTouch = (): boolean => useMedia('(hover: none)');
