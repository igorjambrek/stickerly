/**
 * Changing the cover after the album exists.
 *
 * The same picker as the home screen, with a live preview of the real album —
 * its title, its owner and its actual sticker count — and a drag to frame the
 * photo, which is the only thing here the home screen cannot offer because
 * there is no album to upload into yet.
 */

import { useRef, useState, type PointerEvent } from 'react';
import type { Album, Template } from '@album/shared';
import { REF_PAGE, coverWantsPhoto, countFilled, panCrop } from '@album/shared';
import { api, type CoverPatch } from '../api.ts';
import { useT } from '../lang.ts';
import { CoverPicker } from './CoverPicker.tsx';
import { CoverSheet } from './CoverSheet.tsx';

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
  const [uploading, setUploading] = useState(false);
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

  async function upload(file: File) {
    setUploading(true);
    try {
      const uploaded = await api.uploadImage(token, file, 'cover');
      onChange({ coverImageId: uploaded.id, coverCrop: { x: 0.5, y: 0.5, scale: 1 } });
      setCrop({ x: 0.5, y: 0.5, scale: 1 });
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

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div className="dialog dialog--wide dialog--cover" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="dialog__title">{t('editor.coverTitle')}</h2>

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
            <label className="label" htmlFor="owner-name">
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
              style={{ marginBottom: 16 }}
            />

            <CoverPicker
              template={template}
              variantId={album.coverVariantId}
              lang={album.lang}
              photo={photo}
              uploading={uploading}
              onPick={(coverVariantId) => onChange({ coverVariantId })}
              onPhoto={(file) => void upload(file)}
              onRemovePhoto={() => onChange({ coverImageId: null })}
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
          </div>
        </div>

        <div style={{ display: 'flex', marginTop: 20 }}>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--primary"
            style={{ background: template.palette.badge }}
            onClick={onClose}
          >
            {t('editor.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
