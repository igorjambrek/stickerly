/**
 * A picture and a name — everything a passport is — asked for in one place.
 *
 * Three screens need this: the welcome on a first visit, the join screen when a
 * friend's link arrives before a passport does, and the passport screen itself.
 * So the box, the dice and the grid of animals are described once here. What
 * differs between them is only *when* the answer is written down — the first
 * two hold a draft until the child taps the button that means something, the
 * passport screen saves every change as it is made — and that is the whole of
 * what `onCommit` decides.
 *
 * A suggestion is always already in the boxes, so the shortest way through any
 * of the three is one tap. Typing your real name is never the path of least
 * resistance for a six-year-old.
 */

import { useEffect, useState } from 'react';
import type { Lang, Person } from '@album/shared';
import { AVATARS } from '@album/shared';
import { useT } from '../lang.ts';
import { suggestNickname } from '../nickname.ts';

export interface PassportDraft {
  nickname: string;
  avatarId: string;
  /** True once the child has typed a name of their own over the offered one. */
  named: boolean;
}

/** A settled change, in the shape `PATCH /api/me` and `POST /api/people` take. */
export interface PassportPatch {
  nickname?: string;
  avatar?: string;
}

export interface PassportControls {
  draft: PassportDraft;
  type: (nickname: string) => void;
  /** Blur or Enter: an empty box is a request for another name, not for none. */
  commit: () => void;
  pick: (avatarId: string) => void;
  reroll: () => void;
}

/**
 * `person` is what to show once one is known — a passport that loaded a moment
 * after the screen painted, or arrived from another device. It never overwrites
 * a name the child has already typed.
 */
export function usePassportDraft(
  lang: Lang,
  person?: Person | null,
  onCommit?: (patch: PassportPatch) => void,
): PassportControls {
  const [draft, setDraft] = useState<PassportDraft>(() => {
    const suggested = suggestNickname(lang);
    return { nickname: suggested.nickname, avatarId: suggested.avatarId, named: false };
  });

  useEffect(() => {
    if (!person) return;
    setDraft((current) =>
      current.named ? current : { nickname: person.nickname, avatarId: person.avatar, named: false },
    );
  }, [person?.id, person?.nickname, person?.avatar]);

  /*
   * The language switch sits on the same screen as this on a first visit, and a
   * Serbian name left over in a Russian app would read as a bug. A name we
   * invented is re-invented in the new language; one the child typed, and one
   * belonging to a passport that already exists, are left exactly as they are.
   */
  useEffect(() => {
    if (person) return;
    setDraft((current) =>
      current.named ? current : { ...current, nickname: suggestNickname(lang, current.avatarId).nickname },
    );
  }, [lang, person]);

  const type = (nickname: string) => setDraft({ ...draft, nickname, named: true });

  const reroll = () => {
    const nickname = suggestNickname(lang, draft.avatarId).nickname;
    setDraft({ ...draft, nickname, named: false });
    onCommit?.({ nickname });
  };

  const commit = () => {
    const nickname = draft.nickname.trim();
    if (!nickname) {
      reroll();
      return;
    }
    setDraft({ ...draft, nickname });
    onCommit?.({ nickname });
  };

  /**
   * Changing the picture renames the child too, but only while the name is
   * still the one we gave them. Once they have typed their own, the avatar is
   * just an avatar — silently overwriting a name a child chose would be the
   * rudest thing any of these screens could do.
   */
  const pick = (avatarId: string) => {
    if (draft.named) {
      setDraft({ ...draft, avatarId });
      onCommit?.({ avatar: avatarId });
      return;
    }
    const nickname = suggestNickname(lang, avatarId).nickname;
    setDraft({ nickname, avatarId, named: false });
    onCommit?.({ avatar: avatarId, nickname });
  };

  return { draft, type, commit, pick, reroll };
}

export function PassportForm({
  lang,
  controls,
  id = 'passport-name',
}: {
  lang: Lang;
  controls: PassportControls;
  /** Two of these can share a screen with other fields; the label needs its own. */
  id?: string;
}) {
  const t = useT();
  const { draft, type, commit, pick, reroll } = controls;

  return (
    <>
      <label className="label" htmlFor={id}>
        {t('passport.nickname')}
      </label>
      <div className="passport__namerow">
        <input
          id={id}
          className="field"
          value={draft.nickname}
          maxLength={30}
          onChange={(e) => type(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={reroll}
          title={t('passport.reroll')}
          aria-label={t('passport.reroll')}
        >
          🎲
        </button>
      </div>
      <p className="passport__hint">{t('passport.nicknameHint')}</p>

      <h3>{t('passport.avatar')}</h3>
      <div className="passport__avatars">
        {AVATARS.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            className="passport__avatar"
            aria-pressed={avatar.id === draft.avatarId}
            aria-label={avatar.name[lang]?.word ?? avatar.id}
            onClick={() => pick(avatar.id)}
          >
            {avatar.emoji}
          </button>
        ))}
      </div>
    </>
  );
}
