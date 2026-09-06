/**
 * Editing one sticker.
 *
 * The child gets a photo, a drag to move it, one slider to size it, one button
 * to turn it and a name. No crop numbers, no aspect ratios, no export
 * settings — the window is 50 x 70 mm, or the same window on its side, because
 * that is what a sticker is.
 *
 * Two different things can be turned here, and they are kept apart.
 *
 * The sticker itself can be laid on its side — the team photo an album of
 * portraits eventually needs. That is a change to the page, not to the picture:
 * a lying sticker is 70 x 50 mm and the only room for it on a grid of 50 mm
 * cells is across two of them, so it swallows the sticker beside it and the
 * child is asked first when that sticker has a photo in it.
 *
 * The picture inside can be turned too, a quarter at a time, four presses back
 * to where it started. That is the ordinary repair for a photo that came out
 * of a phone lying down, and it costs nothing.
 *
 * An empty sticker asks where the picture is coming from, and the answers are
 * not the same on every device. A phone has a camera in its hand and a roll of
 * photographs behind it, so it offers those two as buttons; a desktop has a
 * folder and a mouse, so it keeps the drop zone it always had. Either way there
 * is a third answer — say what you want and pick it off a shelf — for the child
 * who wants a lion and has never met one.
 */

import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import type { Album, Slot, Template } from '@album/shared';
import { panCrop, stickerSize, turnCrop } from '@album/shared';
import { api } from '../api.ts';
import { useFeatures } from '../features.ts';
import { useT } from '../lang.ts';
import { useTouch } from '../useMedia.ts';
import { Dialog } from './Dialog.tsx';
import { FramedPhoto } from './FramedPhoto.tsx';
import { PictureSearch } from './PictureSearch.tsx';

export interface SlotDialogProps {
  slot: Slot;
  album: Album;
  template: Template;
  token: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (patch: { label?: string; imageId?: string | null; crop?: Slot['crop'] }) => void;
  /** Lay this sticker on its side, or stand it back up. Absent where the grid has no room. */
  onTurn?: () => void;
  onClose: () => void;
}

export function SlotDialog({
  slot,
  album,
  template,
  token,
  uploading,
  onUpload,
  onChange,
  onTurn,
  onClose,
}: SlotDialogProps) {
  const t = useT();
  // "Drag a picture here" is a lie on a phone, where the gesture is a tap.
  const touch = useTouch();
  const features = useFeatures();
  const [label, setLabel] = useState(slot.label);
  const [crop, setCrop] = useState(slot.crop);
  const [fileOver, setFileOver] = useState(false);
  const [searching, setSearching] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const image = slot.imageId ? album.images.find((i) => i.id === slot.imageId) : undefined;
  const sticker = stickerSize(slot.orientation);
  const box = { x: 0, y: 0, w: sticker.w, h: sticker.h };
  const lyingDown = slot.orientation === 'landscape';

  // A different slot may be opened while this dialog is mounted.
  useEffect(() => {
    setLabel(slot.label);
    setCrop(slot.crop);
    setSearching(false);
  }, [slot.id, slot.label, slot.crop]);

  const commit = (next: Partial<{ label: string; crop: Slot['crop'] }>) => onChange(next);

  /** Turn a pointer drag into a crop change, in millimetres, via shared maths. */
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragFrom.current || !image || !frameRef.current) return;
    const mmPerPx = sticker.w / frameRef.current.getBoundingClientRect().width;
    const dx = (event.clientX - dragFrom.current.x) * mmPerPx;
    const dy = (event.clientY - dragFrom.current.y) * mmPerPx;
    dragFrom.current = { x: event.clientX, y: event.clientY };
    setCrop((current) => panCrop(current, box, image.w, image.h, dx, dy));
  };

  /**
   * A quarter turn, saved at once rather than on a later blur: there is no
   * gesture still in progress to wait for, and a child who turns a photo and
   * closes the sheet meant it.
   */
  const turnPhoto = () => {
    const turned = turnCrop(crop);
    setCrop(turned);
    commit({ crop: turned });
  };

  const endDrag = () => {
    if (!dragFrom.current) return;
    dragFrom.current = null;
    commit({ crop });
  };

  const takeFile = (file: File | undefined | null) => {
    if (file) onUpload(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setFileOver(false);
    takeFile(event.dataTransfer.files?.[0]);
  };

  /**
   * The sheet can be dismissed by tapping outside it, which does not blur the
   * name box first. A name typed and then dismissed is still a name the child
   * typed, so every way out goes through here.
   */
  const close = () => {
    if (label !== slot.label) commit({ label });
    onClose();
  };

  return (
    <Dialog
      title={`${t('editor.sticker')} ${slot.number}`}
      onClose={close}
      footer={
        <>
          {image && (
            <button
              type="button"
              className="btn btn--ghost btn--danger"
              onClick={() => {
                onChange({ imageId: null, label: '' });
                onClose();
              }}
            >
              {t('editor.removePhoto')}
            </button>
          )}
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
      {/*
        Everything sticker-shaped inside this sheet — the framer, the drop zone,
        a search result — takes its shape from the sticker being edited rather
        than from the album, because this one may be the sticker that was
        turned. `display: contents` keeps the wrapper out of the layout.
      */}
      <div
        className="slotbody"
        style={{ ['--sticker-aspect' as string]: `${sticker.w} / ${sticker.h}` }}
      >
        {onTurn && (
          <div className="slotshape">
            <button type="button" className="btn btn--ghost" onClick={onTurn}>
              {lyingDown ? '↕' : '↔'} {t(lyingDown ? 'editor.makeTall' : 'editor.makeWide')}
            </button>
          </div>
        )}

        {image ? (
          <>
            <div
              className="framer"
              ref={frameRef}
              onPointerDown={(e) => {
                dragFrom.current = { x: e.clientX, y: e.clientY };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <FramedPhoto
                box={sticker}
                src={api.imageUrl(token, image.id)}
                width={image.w}
                height={image.h}
                crop={crop}
              />
            </div>

            <div className="framer__tools">
              <button type="button" className="btn btn--ghost" onClick={turnPhoto}>
                ↻ {t('editor.turnPhoto')}
              </button>
            </div>

            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, margin: '10px 0 0' }}>
              {t('editor.move')}
            </p>

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
              onPointerUp={() => commit({ crop })}
              onKeyUp={() => commit({ crop })}
            />
          </>
        ) : searching ? (
          <PictureSearch
            token={token}
            lang={album.lang}
            onPicked={(picked) => {
              onChange({ imageId: picked.id });
              setSearching(false);
            }}
            onBack={() => setSearching(false)}
          />
        ) : (
          <div className="photosource">
            {touch ? (
              <>
                <button
                  type="button"
                  className="photosource__way"
                  onClick={() => cameraInput.current?.click()}
                  disabled={uploading}
                >
                  <span className="photosource__icon" aria-hidden="true">
                    {uploading ? '⏳' : '📷'}
                  </span>
                  <span className="photosource__text">
                    <strong>{uploading ? t('editor.uploading') : t('editor.takePhoto')}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="photosource__way"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                >
                  <span className="photosource__icon" aria-hidden="true">
                    🖼️
                  </span>
                  <span className="photosource__text">
                    <strong>{t('editor.choosePhoto')}</strong>
                    <span>{t('editor.addPhotoHint')}</span>
                  </span>
                </button>
              </>
            ) : (
              <div
                className={`dropzone${fileOver ? ' dropzone--over' : ''}`}
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
                <span style={{ fontSize: 34 }}>{uploading ? '⏳' : '🖼️'}</span>
                <strong>{uploading ? t('editor.uploading') : t('editor.dropPhoto')}</strong>
                <span style={{ fontSize: 14 }}>{t('editor.orClick')}</span>
              </div>
            )}

            {features.pictureSearch && (
              <button
                type="button"
                className="photosource__way"
                onClick={() => setSearching(true)}
                disabled={uploading}
              >
                <span className="photosource__icon" aria-hidden="true">
                  🔍
                </span>
                <span className="photosource__text">
                  <strong>{t('editor.findPhoto')}</strong>
                  <span>{t('editor.findPhotoHint')}</span>
                </span>
              </button>
            )}
          </div>
        )}

        {/*
          Two inputs on a phone, because `capture` is the difference between "open
          the camera" and "open your photographs" and one attribute cannot be both.
          The camera one is not rendered at all on a desktop, where it would open
          a webcam nobody asked for.
        */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {touch && (
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              takeFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        )}

        <label className="label" style={{ marginTop: 20 }} htmlFor="slot-label">
          {t('editor.nameLabel')}
        </label>
        <input
          id="slot-label"
          className="field"
          value={label}
          placeholder={t('editor.namePlaceholder')}
          maxLength={28}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== slot.label && commit({ label })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
    </Dialog>
  );
}
