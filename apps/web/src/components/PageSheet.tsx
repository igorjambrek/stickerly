/**
 * One album page, on screen.
 *
 * Every position comes from the shared geometry module and is expressed as a
 * percentage of the page, so this is the printed page at a different zoom
 * level rather than an approximation of it. Font sizes use container query
 * units for the same reason.
 *
 * Like the PDF, the page is drawn in two coordinate systems: artwork and
 * chrome in reference millimetres scaled to the page, and the sticker grid in
 * real millimetres, because a slot is a physical 50 x 70 mm window — or the
 * same window on its side — whatever size the album is.
 *
 * Two of these sit side by side in the editor, because that is how many pages
 * a child sees when the album is open.
 */

import { useState, type DragEvent } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Album, Page, PageLayout, Slot, Template } from '@album/shared';
import {
  FOOTER_Y,
  REF_PAGE,
  STICKER_RADIUS,
  artRng,
  getAvatar,
  pageHeaderRect,
  slotSpanOf,
  stickerSize,
} from '@album/shared';
import { api } from '../api.ts';
import { useT } from '../lang.ts';
import { FramedPhoto } from './FramedPhoto.tsx';
import { ShapeCanvas } from './ShapeCanvas.tsx';

interface SlotViewProps {
  slot: Slot;
  album: Album;
  layout: PageLayout;
  template: Template;
  token: string;
  onOpen: (slot: Slot) => void;
  onDropFile: (slot: Slot, file: File) => void;
}

function SlotView({ slot, album, layout, template, token, onOpen, onDropFile }: SlotViewProps) {
  const t = useT();
  const [fileOver, setFileOver] = useState(false);
  // Only worth showing once there is someone to tell apart from.
  const filledBy =
    album.members.length > 1 ? album.members.find((m) => m.id === slot.filledBy) : undefined;
  /** Millimetres as a share of the page width, for anything that must scale with it. */
  const cq = (mm: number) => `${(mm / layout.page.w) * 100}cqw`;
  // One cell, or the two a turned sticker took. Same call the PDF makes.
  const span = slotSpanOf(layout, slot.position, slot.orientation);
  const image = slot.imageId ? album.images.find((i) => i.id === slot.imageId) : undefined;

  const draggable = useDraggable({ id: slot.id, disabled: !slot.imageId });
  const droppable = useDroppable({ id: slot.id });

  const handleFile = (event: DragEvent) => {
    event.preventDefault();
    setFileOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onDropFile(slot, file);
  };

  /**
   * Only a slot holding a photo is draggable. Spreading dnd-kit's attributes
   * unconditionally would mark every empty slot aria-disabled — and an empty
   * slot is precisely the one a child needs to click.
   */
  const dragProps = slot.imageId ? { ...draggable.listeners, ...draggable.attributes } : {};

  if (!span) return null;
  const { rect: box, label } = span;

  const classes = [
    'slot',
    draggable.isDragging ? 'slot--dragging' : '',
    droppable.isOver || fileOver ? 'slot--over' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      {...dragProps}
      className={classes}
      style={{
        left: `${(box.x / layout.page.w) * 100}%`,
        top: `${(box.y / layout.page.h) * 100}%`,
        width: `${(box.w / layout.page.w) * 100}%`,
        height: `${(box.h / layout.page.h) * 100}%`,
        color: template.palette.frame,
      }}
      onClick={() => onOpen(slot)}
      onDragOver={(e) => {
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={handleFile}
      aria-label={`${slot.number}${slot.label ? ` ${slot.label}` : ''}`}
    >
      <span className="slot__frame" style={{ borderRadius: cq(STICKER_RADIUS), borderWidth: cq(0.5) }}>
        {image ? (
          <FramedPhoto
            className="slot__photo"
            box={stickerSize(slot.orientation)}
            src={api.imageUrl(token, image.id, 'thumb')}
            width={image.w}
            height={image.h}
            crop={slot.crop}
          />
        ) : (
          <span className="slot__plus" style={{ fontSize: cq(10) }}>
            +
          </span>
        )}
      </span>

      <span
        className="slot__badge"
        style={{
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          width: cq(9.2),
          height: cq(9.2),
          fontSize: cq(4.6),
          background: template.palette.badge,
          borderWidth: cq(0.8),
        }}
      >
        {slot.number}
      </span>

      {/*
        Who brought this sticker, once more than one child is building the
        album. Editor chrome only: nothing here reaches the PDF, because the
        printed page has to stay exactly what the geometry in `@album/shared`
        says it is.
      */}
      {filledBy && (
        <span
          className="slot__who"
          title={t('editor.filledBy', { name: filledBy.nickname })}
          style={{
            right: 0,
            top: 0,
            transform: 'translate(40%, -40%)',
            width: cq(7.4),
            height: cq(7.4),
            fontSize: cq(4),
            borderWidth: cq(0.6),
          }}
        >
          {getAvatar(filledBy.avatar).emoji}
        </span>
      )}

      <span
        className="slot__label"
        style={{
          left: 0,
          top: '100%',
          height: cq(label.h),
          lineHeight: cq(label.h),
          fontSize: cq(3.4),
          color: template.palette.label,
        }}
      >
        {slot.label}
      </span>
    </button>
  );
}

export interface PageSheetProps {
  album: Album;
  layout: PageLayout;
  page: Page;
  pageNumber: number;
  template: Template;
  token: string;
  /** The page page-wide actions (renaming, deleting) act on, of the two shown. */
  active?: boolean;
  onActivate?: () => void;
  onOpenSlot: (slot: Slot) => void;
  onDropFile: (slot: Slot, file: File) => void;
  onRenamePage: (title: string) => void;
}

export function PageSheet({
  album,
  layout,
  page,
  pageNumber,
  template,
  token,
  active = true,
  onActivate,
  onOpenSlot,
  onDropFile,
  onRenamePage,
}: PageSheetProps) {
  const t = useT();
  const header = pageHeaderRect();
  const [draft, setDraft] = useState<string | null>(null);

  /** Reference millimetres -> a percentage of the real page. */
  const refY = (mm: number) => `${((mm * layout.scale) / layout.page.h) * 100}%`;
  const refCq = (mm: number) => `${((mm * layout.scale) / layout.page.w) * 100}cqw`;

  return (
    <div
      className={`page-sheet${active ? ' page-sheet--active' : ''}`}
      style={{ aspectRatio: `${layout.page.w} / ${layout.page.h}` }}
      // Capture, so touching a slot on the other page moves the page actions with it.
      onPointerDownCapture={onActivate}
    >
      <ShapeCanvas
        className="page-sheet__art"
        shapes={template.pageArt(artRng(template.id, 'page', pageNumber), REF_PAGE, pageNumber)}
        width={REF_PAGE.w}
        height={REF_PAGE.h}
      />

      <input
        className="page-sheet__heading"
        value={draft ?? page.title}
        placeholder={album.title}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== page.title) onRenamePage(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={t('editor.pageTitle')}
        style={{
          left: 0,
          top: refY(header.y),
          height: refY(header.h),
          fontSize: refCq(7),
          color: template.palette.pageInk,
        }}
      />

      {page.slots.map((slot) => (
        <SlotView
          key={slot.id}
          slot={slot}
          album={album}
          layout={layout}
          template={template}
          token={token}
          onOpen={onOpenSlot}
          onDropFile={onDropFile}
        />
      ))}

      <span
        style={{
          position: 'absolute',
          left: 0,
          width: '100%',
          top: refY(FOOTER_Y - 5),
          textAlign: 'center',
          fontSize: refCq(4),
          fontWeight: 700,
          color: template.palette.pageInk,
          opacity: 0.7,
        }}
      >
        {pageNumber}
      </span>
    </div>
  );
}
