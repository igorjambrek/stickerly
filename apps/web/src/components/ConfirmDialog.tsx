/**
 * A yes-or-no in the app's own dialog.
 *
 * The alternative is `window.confirm` — a bare grey slab with the browser's
 * chrome around it, and on a phone a system prompt that lands on top of a
 * full-screen sheet with none of the album in sight. This is the same one
 * modal as the rest of the app instead: a card in the middle on a wide screen,
 * a sheet from the bottom edge on a phone. Escape and a tap outside both count
 * as "no"; the button that does the thing is painted as danger when it
 * destroys something.
 */

import type { ReactNode } from 'react';
import { useT } from '../lang.ts';
import { Dialog } from './Dialog.tsx';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  /** The question itself; it is the whole body of the dialog. */
  children: ReactNode;
  confirmLabel: string;
  /** Defaults to a plain "Cancel". */
  cancelLabel?: string;
  danger?: boolean;
  /** The thing is happening: both buttons go dead so it cannot be asked twice. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t('editor.cancel')}
          </button>
          <span className="spacer" />
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm__text">{children}</p>
    </Dialog>
  );
}
