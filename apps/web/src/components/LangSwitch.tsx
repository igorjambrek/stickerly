/**
 * The four languages, as chips.
 *
 * Each chip carries both its name and its two- or three-letter code, and the
 * stylesheet shows whichever fits: `Ћирилица · Latinica · English · Русский`
 * is most of a phone's width before anything else in the bar has had a turn.
 * A language is written in its own script either way — a child looking for
 * Russian is looking for `RU`, not for a translation of the word "Russian".
 */

import type { Lang } from '@album/shared';
import { LANGS } from '@album/shared';
import { useT } from '../lang.ts';

export function LangSwitch({ lang, onPick }: { lang: Lang; onPick: (lang: Lang) => void }) {
  const t = useT();
  return (
    <div className="langswitch">
      {LANGS.map((code) => (
        <button key={code} type="button" aria-pressed={lang === code} onClick={() => onPick(code)}>
          <span className="langswitch__long">{t(`lang.${code}`)}</span>
          <span className="langswitch__short">{t(`lang.short.${code}`)}</span>
        </button>
      ))}
    </div>
  );
}
