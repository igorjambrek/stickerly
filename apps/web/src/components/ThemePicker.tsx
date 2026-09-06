/**
 * Changing what the album is about, after it exists.
 *
 * The home screen asks this first, in big cards, because it is the first thing
 * a child decides. Here it is the same seven themes drawn small, each showing
 * its own cover, because the child is already looking at their album and only
 * needs to recognise the world they are moving it into.
 *
 * A theme is paint: it changes the cover, the page backgrounds and the
 * colours, and it touches no slot, photo or number. So this is a picker with a
 * reassurance under it, not a warning with a confirmation.
 */

import type { Lang } from '@album/shared';
import { TEMPLATES } from '@album/shared';
import { CoverSheet } from './CoverSheet.tsx';

export interface ThemePickerProps {
  templateId: string;
  lang: Lang;
  onPick: (templateId: string) => void;
}

export function ThemePicker({ templateId, lang, onPick }: ThemePickerProps) {
  return (
    <div className="themepicker">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          className="coverchip"
          aria-pressed={template.id === templateId}
          onClick={() => template.id !== templateId && onPick(template.id)}
        >
          <CoverSheet
            className="coverchip__art"
            template={template}
            variantId={template.variants[0]!.id}
            title=""
            lang={lang}
            bare
          />
          <span className="coverchip__name">
            {template.emoji} {template.name[lang]}
          </span>
        </button>
      ))}
    </div>
  );
}
