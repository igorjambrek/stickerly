/**
 * UI language.
 *
 * On the home screen this is a local preference; inside an album it mirrors
 * the album's own language, because the same setting decides what is printed
 * into the PDFs.
 */

import { create } from 'zustand';
import type { Lang } from '@album/shared';
import { DEFAULT_LANG, LANGS, translator } from '@album/shared';

const KEY = 'nalepko.lang';

const initial = (): Lang => {
  try {
    const stored = localStorage.getItem(KEY) as Lang | null;
    if (stored && LANGS.includes(stored)) return stored;
  } catch {
    // Storage can be unavailable; the default is perfectly usable.
  }
  return DEFAULT_LANG;
};

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: initial(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Ignore: the choice simply will not persist.
    }
    document.documentElement.lang = lang.startsWith('sr') ? 'sr' : lang === 'ru' ? 'ru' : 'en';
    set({ lang });
  },
}));

export const useLang = (): Lang => useLangStore((s) => s.lang);

/** t('home.title') inside components. */
export const useT = () => translator(useLangStore((s) => s.lang));
