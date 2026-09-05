/**
 * Editing one sticker.
 *
 * The child gets a photo, a drag to move it, one slider to size it, and a name.
 * No crop numbers, no aspect ratios, no export settings — the window is always
 * 50 x 70 mm because that is what a sticker is.
 */

import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import type { Album, Slot, Template } from '@album/shared';
import { STICKER, coverPlacement, panCrop } from '@album/shared';
import { api } from '../api.ts';
import { useT } from '../lang.ts';

export interface SlotDialogProps {
  slot: Slot;
  album: Album;
  template: Template;
  token: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (patch: { label?: string; imageId?: string | null; crop?: Slot['crop'] }) => void;
  onClose: () => void;
}

const BOX = { x: 0, y: 0, w: STICKER.w, h: STICKER.h };

export function SlotDialog({ slot, album, template, token, uploading, onUpload, onChange, onClose }: SlotDialogProps) {
  const t = useT();
  const [label, setLabel] = useState(slot.label);
  const [crop, setCrop] = useState(slot.crop);
  const [fileOver, setFileOver] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const image = slot.imageId ? album.images.find((i) => i.id === slot.imageId) : undefined;

  // A different slot may be opened while this dialog is mounted.
  useEffect(() => {
    setLabel(slot.label);
    setCrop(slot.crop);
  }, [slot.id, slot.label, slot.crop]);

  const commit = (next: Partial<{ label: string; crop: Slot['crop'] }>) => onChange(next);

  const placement = image ? coverPlacement(BOX, image.w, image.h, crop) : null;

  /** Turn a pointer drag into a crop change, in millimetres, via shared maths. */
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragFrom.current || !image || !frameRef.current) return;
    const mmPerPx = STICKER.w / frameRef.current.getBoundingClientRect().width;
    const dx = (event.clientX - dragFrom.current.x) * mmPerPx;
    const dy = (event.clientY - dragFrom.current.y) * mmPerPx;
    dragFrom.current = { x: event.clientX, y: event.clientY };
    setCrop((current) => panCrop(current, BOX, image.w, image.h, dx, dy));
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

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="dialog__title">
          {t('editor.sticker')} {slot.number}
        </h2>

        {image && placement ? (
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
              <img
                src={api.imageUrl(token, image.id)}
                alt=""
                draggable={false}
                style={{
                  left: `${(placement.x / STICKER.w) * 100}%`,
                  top: `${(placement.y / STICKER.h) * 100}%`,
                  width: `${(placement.w / STICKER.w) * 100}%`,
                  height: `${(placement.h / STICKER.h) * 100}%`,
                }}
              />
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
          >
            <span style={{ fontSize: 34 }}>{uploading ? '⏳' : '🖼️'}</span>
            <strong>{uploading ? t('editor.uploading') : t('editor.dropPhoto')}</strong>
            <span style={{ fontSize: 14 }}>{t('editor.orClick')}</span>
          </div>
        )}

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

        <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
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
            onClick={() => {
              if (label !== slot.label) commit({ label });
              onClose();
            }}
          >
            {t('editor.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
