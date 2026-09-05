/**
 * The passport: a picture, a name, and a code that carries both to another
 * device.
 *
 * There is nothing to fill in here. The name is already there when a child
 * arrives, the picture is a grid of animals, and "add another device" produces
 * a QR the other device's own camera app can read — so the entire cross-device
 * story is one child holding up a tablet to a phone. No typing is the point.
 */

import { useEffect, useMemo, useState } from 'react';
import { AVATARS, TEMPLATES, formatCode, getAvatar } from '@album/shared';
import { api, type MintedCode } from '../api.ts';
import { useIdentity } from '../identity.ts';
import { useLangStore, useT } from '../lang.ts';
import { suggestNickname } from '../nickname.ts';
import { QrCode } from '../components/QrCode.tsx';

/** Whole minutes left, floored, so a code never claims more time than it has. */
const minutesLeft = (expiresAt: string): number =>
  Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 60_000));

function AddDevice({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [code, setCode] = useState<MintedCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(0);

  async function mint() {
    setError(null);
    setCode(null);
    try {
      const minted = await api.createPairing();
      setCode(minted);
      setMinutes(minutesLeft(minted.expiresAt));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void mint();
  }, []);

  // A visible countdown, so a code that has gone stale says so rather than
  // simply failing when the other device finally gets around to it.
  useEffect(() => {
    if (!code) return;
    const tick = setInterval(() => setMinutes(minutesLeft(code.expiresAt)), 20_000);
    return () => clearInterval(tick);
  }, [code]);

  // The QR holds an ordinary link, which is why no camera code exists in this
  // app: the other device's own camera opens it.
  const url = code ? `${window.location.origin}/join/${code.code}` : null;
  const expired = Boolean(code) && minutes <= 0;

  return (
    <section className="passport__card">
      <h2>{t('passport.addDevice')}</h2>
      <p className="passport__hint">{t('passport.addDeviceHint')}</p>

      {error && <p className="passport__error">{error}</p>}

      {url && !expired && (
        <>
          <QrCode value={url} className="passport__qr" />
          <p className="passport__hint">{t('passport.codeHint')}</p>
          <p className="passport__code">{formatCode(code!.code)}</p>
          <p className="passport__hint">{t('passport.expires', { n: minutes })}</p>
        </>
      )}

      {expired && <p className="passport__hint">{t('passport.expired')}</p>}

      <div className="passport__actions">
        <button type="button" className="btn" onClick={() => void mint()}>
          {t('passport.newCode')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          {t('passport.back')}
        </button>
      </div>
    </section>
  );
}

export function Passport({ onHome, onOpenAlbum }: { onHome: () => void; onOpenAlbum: (token: string) => void }) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const { person, albums, checked, ensure, update, load } = useIdentity();

  const [nickname, setNickname] = useState('');
  const [typed, setTyped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Nothing has looked for this device's passport if the child arrived here
   * straight from a link — a bookmark, or the QR on another screen — rather
   * than through the home screen, and until something does, `checked` stays
   * false and this screen waits forever.
   */
  useEffect(() => {
    void load();
  }, []);

  // Opening this screen is one of the moments a passport is worth creating.
  useEffect(() => {
    if (checked && !person) void ensure(lang).catch((err) => setError((err as Error).message));
  }, [checked, person, lang]);

  useEffect(() => {
    if (person && !typed) setNickname(person.nickname);
  }, [person, typed]);

  const avatar = useMemo(() => getAvatar(person?.avatar), [person?.avatar]);

  const save = (patch: { nickname?: string; avatar?: string }) =>
    update(patch, lang).catch((err) => setError((err as Error).message));

  /**
   * Changing the picture renames the child too, but only while the name is
   * still the one we gave them. Once they have typed their own, the avatar is
   * just an avatar — silently overwriting a name a child chose would be the
   * rudest thing this screen could do.
   */
  function pickAvatar(avatarId: string) {
    if (typed || !person) {
      void save({ avatar: avatarId });
      return;
    }
    const next = suggestNickname(lang, avatarId);
    setNickname(next.nickname);
    void save({ avatar: avatarId, nickname: next.nickname });
  }

  function reroll() {
    const next = suggestNickname(lang, person?.avatar);
    setNickname(next.nickname);
    setTyped(false);
    void save({ nickname: next.nickname });
  }

  function commitName() {
    const trimmed = nickname.trim();
    // An empty box is a request for a new name, not a request to have none.
    if (!trimmed) {
      reroll();
      return;
    }
    if (trimmed !== person?.nickname) void save({ nickname: trimmed });
  }

  if (!person) {
    return (
      <div className="passport">
        <p className="passport__hint">{error ?? t('join.working')}</p>
      </div>
    );
  }

  return (
    <div className="passport">
      <header className="home__bar">
        <button type="button" className="btn btn--ghost" onClick={onHome}>
          ← {t('passport.back')}
        </button>
        <span className="spacer" />
      </header>

      <h1 className="passport__title">
        <span className="passport__face">{avatar.emoji}</span>
        {t('passport.title')}
      </h1>

      {error && <p className="passport__error">{error}</p>}

      <section className="passport__card">
        <label className="label" htmlFor="passport-name">
          {t('passport.nickname')}
        </label>
        <div className="passport__namerow">
          <input
            id="passport-name"
            className="field"
            value={nickname}
            maxLength={30}
            onChange={(e) => {
              setTyped(true);
              setNickname(e.target.value);
            }}
            onBlur={commitName}
          />
          <button type="button" className="btn btn--ghost" onClick={reroll} title={t('passport.reroll')}>
            🎲
          </button>
        </div>
        <p className="passport__hint">{t('passport.nicknameHint')}</p>
      </section>

      <section className="passport__card">
        <h2>{t('passport.avatar')}</h2>
        <div className="passport__avatars">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="passport__avatar"
              aria-pressed={a.id === person.avatar}
              aria-label={a.name[lang]?.word ?? a.id}
              onClick={() => pickAvatar(a.id)}
            >
              {a.emoji}
            </button>
          ))}
        </div>
      </section>

      {adding ? (
        <AddDevice onDone={() => setAdding(false)} />
      ) : (
        <section className="passport__card">
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            📱 {t('passport.addDevice')}
          </button>
          <p className="passport__hint">{t('passport.keepSafe')}</p>
        </section>
      )}

      {albums.length > 0 && (
        <section className="passport__card">
          <h2>{t('home.recent')}</h2>
          <div className="recent">
            {albums.map((album) => (
              <button
                key={album.editToken}
                type="button"
                className="recent__item"
                onClick={() => onOpenAlbum(album.editToken)}
              >
                <span style={{ fontSize: 22 }}>
                  {TEMPLATES.find((x) => x.id === album.templateId)?.emoji ?? '📔'}
                </span>
                <strong className="spacer">{album.title}</strong>
                <span style={{ color: 'var(--muted)' }}>{t('home.openAlbum')} →</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
