/**
 * Arriving with a code.
 *
 * One screen serves both kinds, because to the child they are the same gesture:
 * a code came off another screen, and something should happen. A pairing code
 * brings their own passport here; an album invite puts them in a friend's
 * album. Which one it is comes from the link they followed, not from anything
 * they have to understand.
 *
 * A code in the URL is claimed on a tap rather than on arrival. Codes are
 * single use, so spending one because a link was previewed or prefetched would
 * burn it for the child it was meant for.
 */

import { useEffect, useState } from 'react';
import { formatCode, isCode, normaliseCode } from '@album/shared';
import { ApiError, api } from '../api.ts';
import { useIdentity } from '../identity.ts';
import { useLangStore, useT } from '../lang.ts';
import { suggestNickname } from '../nickname.ts';

export type JoinKind = 'pairing' | 'invite';

export function Join({
  kind,
  code: fromUrl,
  onHome,
  onOpenAlbum,
}: {
  kind: JoinKind;
  code: string;
  onHome: () => void;
  onOpenAlbum: (token: string) => void;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const { person, ensure, adopt, load } = useIdentity();

  const [typed, setTyped] = useState(fromUrl ? formatCode(normaliseCode(fromUrl)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion] = useState(() => suggestNickname(lang));

  useEffect(() => {
    void load();
  }, []);

  const code = normaliseCode(typed);
  const ready = isCode(code) && !busy;

  async function go() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'pairing') {
        // Deliberately not `ensure` first: this device is about to become an
        // existing child, and minting a passport we would throw away leaves a
        // stray person behind.
        adopt(await api.claimPairing(code));
        onHome();
        return;
      }

      // Joining does need a passport, because it puts a name on the roster.
      await ensure(lang, { nickname: person ? undefined : suggestion.nickname });
      const joined = await api.claimInvite(code);
      onOpenAlbum(joined.editToken);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 400 && (err as ApiError).message.includes('many') ? t('join.tooMany') : t('join.badCode'));
      setBusy(false);
    }
  }

  return (
    <div className="passport">
      <header className="home__bar">
        <button type="button" className="btn btn--ghost" onClick={onHome}>
          ← {t('passport.back')}
        </button>
        <span className="spacer" />
      </header>

      <h1 className="passport__title">{kind === 'invite' ? t('join.invite') : t('join.title')}</h1>

      <section className="passport__card">
        <p className="passport__hint">{kind === 'invite' ? t('editor.shareHint') : t('join.pairingHint')}</p>

        <label className="label" htmlFor="join-code">
          {t('join.codeLabel')}
        </label>
        <input
          id="join-code"
          className="field passport__codeinput"
          value={typed}
          autoFocus={!fromUrl}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder={t('join.codePlaceholder')}
          maxLength={9}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void go();
          }}
        />

        {/* Only for an invite: pairing brings a name of its own. */}
        {kind === 'invite' && (
          <p className="passport__hint">
            {t('join.youWillBe', { name: person?.nickname ?? suggestion.nickname })}
          </p>
        )}

        {error && <p className="passport__error">{error}</p>}

        <button type="button" className="btn btn--primary" disabled={!ready} onClick={() => void go()}>
          {busy ? t('join.working') : t('join.go')}
        </button>
      </section>
    </div>
  );
}
