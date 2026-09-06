/**
 * Changing how the album looks after it exists.
 *
 * The same two pickers as the home screen — theme, then cover — with a live
 * preview of the real album: its title, its owner and its actual sticker
 * count. A drag frames the photo, which is the one thing here the home screen
 * cannot offer because there is no album to upload into yet.
 *
 * It can also go and find a picture, which the home screen again cannot: a
 * found picture is fetched into an album, and at that point there is one.
 *
 * The theme is here, beside the cover, because they are one decision seen
 * twice — which world this album is in, and which of that world's covers it
 * wears — and a child who started with dinosaurs and now wants cars should not
 * have to start the album again. Nothing they have made is at stake: a theme
 * repaints, it does not rearrange. Size and stickers-per-page, which would
 * destroy slots, are the two that stay locked at creation.
 */

import { useRef, useState, type PointerEvent } from 'react';
import type { Album, Template } from '@album/shared';
import { DEFAULT_CROP, REF_PAGE, coverWantsPhoto, countFilled, panCrop } from '@album/shared';
import { api, type CoverPatch } from '../api.ts';
import { useFeatures } from '../features.ts';
import { useT } from '../lang.ts';
import { CoverPicker } from './CoverPicker.tsx';
import { Dialog } from './Dialog.tsx';
import { CoverSheet } from './CoverSheet.tsx';
import { PictureSearch } from './PictureSearch.tsx';
import { ThemePicker } from './ThemePicker.tsx';

const BOX = { x: 0, y: 0, w: REF_PAGE.w, h: REF_PAGE.h };

export interface CoverDialogProps {
  album: Album;
  template: Template;
  token: string;
  onChange: (patch: CoverPatch) => void;
  onOwnerNameChange: (ownerName: string) => void;
  onClose: () => void;
}

export function CoverDialog({ album, template, token, onChange, onOwnerNameChange, onClose }: CoverDialogProps) {
  const t = useT();
  const features = useFeatures();
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [crop, setCrop] = useState(album.coverCrop);
  const [ownerDraft, setOwnerDraft] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const owner = ownerDraft ?? album.ownerName;

  function commitOwnerName() {
    if (ownerDraft !== null && ownerDraft.trim() && ownerDraft !== album.ownerName) {
      onOwnerNameChange(ownerDraft.trim());
    }
    setOwnerDraft(null);
  }

  const image = album.coverImageId ? album.images.find((i) => i.id === album.coverImageId) : undefined;
  const photo = image ? { url: api.imageUrl(token, image.id), w: image.w, h: image.h } : null;
  const framable = photo && coverWantsPhoto(template, album.coverVariantId);

  /** However the picture arrived, it starts centred, unzoomed and upright. */
  function framePhoto(imageId: string) {
    onChange({ coverImageId: imageId, coverCrop: { ...DEFAULT_CROP } });
    setCrop({ ...DEFAULT_CROP });
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      framePhoto((await api.uploadImage(token, file, 'cover')).id);
    } finally {
      setUploading(false);
    }
  }

  /** Turn a pointer drag into a crop change, in reference millimetres. */
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragFrom.current || !image || !frameRef.current) return;
    const mmPerPx = REF_PAGE.w / frameRef.current.getBoundingClientRect().width;
    const dx = (event.clientX - dragFrom.current.x) * mmPerPx;
    const dy = (event.clientY - dragFrom.current.y) * mmPerPx;
    dragFrom.current = { x: event.clientX, y: event.clientY };
    setCrop((current) => panCrop(current, BOX, image.w, image.h, dx, dy));
  };

  const endDrag = () => {
    if (!dragFrom.current) return;
    dragFrom.current = null;
    onChange({ coverCrop: crop });
  };

  /** Tapping outside the sheet does not blur the name box; this does its work. */
  const close = () => {
    commitOwnerName();
    onClose();
  };

  return (
    <Dialog
      variant="dialog--cover"
      title={t('editor.coverTitle')}
      onClose={close}
      footer={
        <>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--primary"
            style={{ background: template.palette.badge }}
            onClick={close}
          >
            {t('editor.close')}
          </button>
        </>
      }
    >
      {searching ? (
        <PictureSearch
          token={token}
          lang={album.lang}
          role="cover"
          onPicked={(picked) => {
            framePhoto(picked.id);
            setSearching(false);
          }}
          onBack={() => setSearching(false)}
        />
      ) : (
        <div className="coverdialog">
          <div
            className="coverdialog__preview"
            ref={frameRef}
            onPointerDown={(e) => {
              if (!framable) return;
              dragFrom.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: framable ? 'grab' : 'default' }}
          >
            <CoverSheet
              template={template}
              variantId={album.coverVariantId}
              title={album.title}
              ownerName={owner}
              stickerCount={countFilled(album)}
              lang={album.lang}
              photo={photo}
              crop={crop}
            />
            {framable && <p className="hint">{t('editor.move')}</p>}
          </div>

          <div className="coverdialog__controls">
            <label className="label">{t('home.pickTemplate')}</label>
            <ThemePicker
              templateId={album.templateId}
              lang={album.lang}
              onPick={(templateId) => onChange({ templateId })}
            />
            <p className="hint">{t('editor.themeKeeps')}</p>

            <label className="label" style={{ marginTop: 16 }}>
              {t('home.pickCover')}
            </label>
            <CoverPicker
              template={template}
              variantId={album.coverVariantId}
              lang={album.lang}
              photo={photo}
              uploading={uploading}
              onPick={(coverVariantId) => onChange({ coverVariantId })}
              onPhoto={(file) => void upload(file)}
              onRemovePhoto={() => onChange({ coverImageId: null })}
              onFind={features.pictureSearch ? () => setSearching(true) : undefined}
            />

            {framable && (
              <>
                <label className="label" style={{ marginTop: 16 }}>
                  {t('editor.zoom')}
                </label>
                <input
                  className="slider"
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={crop.scale}
                  onChange={(e) => setCrop({ ...crop, scale: Number(e.target.value) })}
                  onPointerUp={() => onChange({ coverCrop: crop })}
                  onKeyUp={() => onChange({ coverCrop: crop })}
                />
              </>
            )}

            <label className="label" htmlFor="owner-name" style={{ marginTop: 16 }}>
              {t('home.yourName')}
            </label>
            <input
              id="owner-name"
              className="field"
              value={owner}
              maxLength={30}
              placeholder={t('home.yourNamePlaceholder')}
              onChange={(e) => setOwnerDraft(e.target.value)}
              onBlur={commitOwnerName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
