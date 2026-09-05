/**
 * The one modal in the app.
 *
 * On a wide screen it is a card in the middle of a dimmed page. On a phone it
 * is a sheet that rises from the bottom edge, because that is where a thumb
 * is: the title bar and its ✕ stay put at the top, the actions stay put at the
 * bottom, and only the middle scrolls. The stylesheet decides which of the two
 * it is; everything else here is the same either way.
 *
 * It closes on Escape and on a tap outside. The tap is handled on
 * `pointerdown` and only when the press *starts* on the scrim — the sticker
 * and cover dialogs are dragged with a finger, and a drag that happens to end
 * outside the sheet must not be read as "close".
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '../lang.ts';

export interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Buttons for the bottom bar; on a phone it stays in reach above the edge. */
  footer?: ReactNode;
  /** Extra class on the sheet itself: `dialog--wide`, `dialog--cover`, `dialog--menu`. */
  variant?: string;
}

/** Everything a Tab can land on inside the sheet, in document order. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, onClose, children, footer, variant }: DialogProps) {
  const t = useT();
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);

  // The page behind must not scroll under the sheet: on a phone that is how a
  // child loses their place in an album while poking at a dialog.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    sheet.current?.focus({ preventScroll: true });
  }, []);

  /** Escape closes; Tab stays inside, which is what `aria-modal` promises. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !sheet.current) return;
    const stops = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (stops.length === 0) return;
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="scrim"
      role="presentation"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={sheet}
        className={`dialog${variant ? ` ${variant}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="dialog__bar">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="dialog__x" onClick={onClose} aria-label={t('editor.close')}>
            ✕
          </button>
        </header>

        <div className="dialog__body">{children}</div>

        {footer && <footer className="dialog__foot">{footer}</footer>}
      </div>
    </div>
  );
}
