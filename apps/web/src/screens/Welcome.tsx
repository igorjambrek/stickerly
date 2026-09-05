/**
 * The first screen a child ever sees: who are you?
 *
 * It comes before making an album rather than after, because the two questions
 * the editor already asks — whose name goes on the cover, and who did what in a
 * shared album — both want an answer that exists before the album does. Asking
 * once, here, is why nothing later has to.
 *
 * A face and a name are already chosen when this paints, so the whole screen
 * can be got through with one tap; the passport is minted on that tap and not
 * before, which keeps the rule that a bare page view creates nobody.
 *
 * Nothing here can trap a child either. A passport that fails to mint says so
 * and the button tries again; there is nothing behind this screen that would
 * work without the server anyway, and the album flow makes one of its own if it
 * ever finds itself without.
 */

import { useState } from 'react';
import { getAvatar } from '@album/shared';
import { useIdentity } from '../identity.ts';
import { useLangStore, useT } from '../lang.ts';
import { LangSwitch } from '../components/LangSwitch.tsx';
import { PassportForm, usePassportDraft } from '../components/PassportForm.tsx';

export function Welcome({ onDone }: { onDone: () => void }) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const ensure = useIdentity((s) => s.ensure);

  const controls = usePassportDraft(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { nickname, avatarId } = controls.draft;
    try {
      await ensure(lang, { nickname: nickname.trim(), avatar: avatarId });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="passport welcome">
      <header className="home__bar">
        <span className="brand">
          <span className="brand__mark">✨</span>
          {t('app.name')}
        </span>
        <span className="spacer" />
        <LangSwitch lang={lang} onPick={setLang} />
      </header>

      <h1 className="passport__title">
        <span className="passport__face">{getAvatar(controls.draft.avatarId).emoji}</span>
        {t('onboarding.title')}
      </h1>
      <p className="passport__hint welcome__lead">{t('onboarding.hint')}</p>

      <section className="passport__card">
        <PassportForm lang={lang} controls={controls} />
      </section>

      {error && <p className="passport__error">{error}</p>}

      <button type="button" className="btn btn--primary btn--big welcome__go" disabled={busy} onClick={() => void go()}>
        {busy ? t('join.working') : `${getAvatar(controls.draft.avatarId).emoji} ${t('onboarding.go')}`}
      </button>
      <p className="passport__hint">{t('onboarding.why')}</p>
    </div>
  );
}
