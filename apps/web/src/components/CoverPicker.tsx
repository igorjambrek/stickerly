/**
 * Choosing how the cover looks.
 *
 * Every cover in the theme is shown as its own artwork rather than as a word,
 * because "Champions" and "World Cup" mean nothing to a six-year-old and two
 * pictures side by side mean everything. The last one in every theme is the
 * child's own photo, and picking it opens the place to put it.
 *
 * Shared by the home screen (before the album exists, working from a local
 * file) and by the editor (afterwards, working from an uploaded image), which
 * is why the photo is passed in rather than fetched here.
 */

import { useRef } from 'react';
import type { DragEvent } from 'react';
import { useState } from 'react';
import type { Lang, Template } from '@album/shared';
import { coverWantsPhoto, getVariant } from '@album/shared';
import { useT } from '../lang.ts';
import { CoverSheet, type CoverPhoto } from './CoverSheet.tsx';

export interface CoverPickerProps {
  template: Template;
  variantId: string;
  lang: Lang;
  photo: CoverPhoto | null;
  uploading?: boolean;
  onPick: (variantId: string) => void;
  onPhoto: (file: File) => void;
  onRemovePhoto: () => void;
}

export function CoverPicker({
  template,
  variantId,
  lang,
  photo,
  uploading = false,
  onPick,
  onPhoto,
  onRemovePhoto,
}: CoverPickerProps) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileOver, setFileOver] = useState(false);
  const wantsPhoto = coverWantsPhoto(template, variantId);

  const take = (file: File | undefined | null) => {
    if (file) onPhoto(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setFileOver(false);
    take(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="coverpicker">
      <div className="coverpicker__row">
        {template.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className="coverchip"
            aria-pressed={variant.id === variantId}
            onClick={() => onPick(variant.id)}
          >
            <CoverSheet
              className="coverchip__art"
              template={template}
              variantId={variant.id}
              title=""
              lang={lang}
              bare
              photo={variant.photo ? photo : null}
            />
            <span className="coverchip__name">
              {variant.emoji} {variant.name[lang]}
            </span>
          </button>
        ))}
      </div>

      {wantsPhoto && (
        <div className={`coverdrop${fileOver ? ' coverdrop--over' : ''}`}>
          <div
            className="coverdrop__zone"
            onDragOver={(e) => {
              e.preventDefault();
              setFileOver(true);
            }}
            onDragLeave={() => setFileOver(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          >
            <span className="coverdrop__icon" aria-hidden="true">
              {uploading ? '⏳' : photo ? '🖼️' : '📷'}
            </span>
            <span className="coverdrop__text">
              <strong>
                {uploading
                  ? t('editor.uploading')
                  : photo
                    ? t('home.changePhoto')
                    : t('home.uploadCover')}
              </strong>
              <span>{photo ? t('home.uploadCoverHint') : t('home.coverPhotoMissing')}</span>
            </span>
          </div>
          {photo && (
            <button type="button" className="btn btn--ghost btn--danger" onClick={onRemovePhoto}>
              {t('home.removePhoto')}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      <p className="hint">{getVariant(template, variantId).name[lang]}</p>
    </div>
  );
}
