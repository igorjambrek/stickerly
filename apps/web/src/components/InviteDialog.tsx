/**
 * Inviting a friend into an album.
 *
 * This replaces copying the raw album link. The link is the album's only key
 * and it never expires, so pasting it into a chat means handing over permanent
 * full control of a child's album to whoever the message reaches. An invite is
 * a code that works once and dies in ten minutes, and the friend who uses it
 * ends up on the roster with a name and a face beside their stickers.
 *
 * The QR holds `/i/<code>`, an ordinary link, so a friend scans it with their
 * own camera app and nothing has to be installed or explained.
 */

import { useEffect, useState } from 'react';
import type { AlbumMember } from '@album/shared';
import { formatCode, getAvatar } from '@album/shared';
import { api, type MintedCode } from '../api.ts';
import { useT } from '../lang.ts';
import { Dialog } from './Dialog.tsx';
import { QrCode } from './QrCode.tsx';

export function InviteDialog({
  token,
  members,
  onClose,
  onCopied,
}: {
  token: string;
  members: AlbumMember[];
  onClose: () => void;
  onCopied: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState<MintedCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setError(null);
    setCode(null);
    try {
      setCode(await api.createInvite(token));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void mint();
  }, [token]);

  const url = code ? `${window.location.origin}/i/${code.code}` : null;

  return (
    <Dialog
      title={t('editor.inviteTitle')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (!url) return;
              await navigator.clipboard?.writeText(url).catch(() => {});
              onCopied();
            }}
          >
            {t('editor.copyCode')}
          </button>
          <button type="button" className="btn" onClick={() => void mint()}>
            {t('editor.newInvite')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('editor.close')}
          </button>
        </>
      }
    >
      <p className="passport__hint">{t('editor.shareHint')}</p>

      {error && <p className="passport__error">{error}</p>}

      {url && (
        <>
          <QrCode value={url} className="passport__qr" />
          <p className="passport__code">{formatCode(code!.code)}</p>
          <p className="passport__hint">{t('passport.codeHint')}</p>
        </>
      )}

      {members.length > 0 && (
        <>
          <h3>{t('editor.members')}</h3>
          <div className="members">
            {members.map((m) => (
              <span key={m.id} className="members__one" title={m.nickname}>
                <span className="members__face">{getAvatar(m.avatar).emoji}</span>
                {m.nickname}
              </span>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}
