/**
 * The album editor.
 *
 * An open album shows two pages, so the editor shows two pages: the spread the
 * child would be looking at with the finished book in their lap, facing pages
 * and all — page 1 alone beside the inside of the cover, then 2 and 3, then 4
 * and 5. `spreads()` in the shared module decides the pairing, the same rule
 * the folded sheets obey.
 *
 * One of the two is the active page: the one the strip has selected and the
 * one page-wide actions name. Photos arrive by dropping a file straight onto a
 * slot or by tapping it; stickers are reordered by dragging one onto another,
 * and the numbers follow.
 */

import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { Lang, Page, Slot } from '@album/shared';
import { countEmpty, countFilled, getAvatar, getTemplate, layoutFor, spreadOfPage, spreads } from '@album/shared';
import { api } from '../api.ts';
import { useLangStore, useT } from '../lang.ts';
import { rememberAlbum, useStore } from '../store.ts';
import { PageSheet } from '../components/PageSheet.tsx';
import { InsideCoverSheet } from '../components/InsideCoverSheet.tsx';
import { CoverDialog } from '../components/CoverDialog.tsx';
import { PrintDialog } from '../components/PrintDialog.tsx';
import { SlotDialog } from '../components/SlotDialog.tsx';
import { InviteDialog } from '../components/InviteDialog.tsx';

export function Editor({ token, onHome }: { token: string; onHome: () => void }) {
  const t = useT();
  const setUiLang = useLangStore((s) => s.setLang);
  const store = useStore();
  const { album, status, error, undo, toast } = store;

  // The active page is held by id, not by index: pages are renumbered on every
  // insert and delete, and an id is the only handle that survives that.
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Keyed by the token alone: the store instance is stable for the session.
  useEffect(() => {
    void store.load(token);
  }, [token]);

  // The album carries the language, because it decides what goes into the PDFs.
  useEffect(() => {
    if (album) {
      setUiLang(album.lang);
      rememberAlbum(album, token);
    }
  }, [album?.lang, album?.title, token, setUiLang, album]);

  const template = useMemo(() => getTemplate(album?.templateId ?? ''), [album?.templateId]);
  const layout = useMemo(() => layoutFor(album?.size, album?.slotsPerPage), [album?.size, album?.slotsPerPage]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (error && !album) {
    return (
      <div className="center-note">
        <h2>🙈</h2>
        <p>{error}</p>
        <button type="button" className="btn" onClick={onHome}>
          {t('home.back')}
        </button>
      </div>
    );
  }

  if (!album) return <div className="center-note">{t('editor.saving')}</div>;

  const pages = album.pages;
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0]!;
  const activeNumber = activePage.position + 1;
  const pageAt = (number: number): Page | undefined => pages.find((p) => p.position === number - 1);

  const allSpreads = spreads(pages.length);
  const spread = allSpreads[spreadOfPage(activeNumber)] ?? allSpreads[0]!;
  const shownPages = [spread.left, spread.right].filter((n) => n !== null).length;

  const openSlot = pages.flatMap((p) => p.slots).find((s) => s.id === openSlotId) ?? null;

  /** Uploading and assigning are one action from the child's point of view. */
  async function putPhoto(slot: Slot, file: File) {
    setUploading(true);
    try {
      const image = await api.uploadImage(token, file);
      await store.setSlot(slot, { imageId: image.id });
    } catch (err) {
      store.showToast((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const from = String(event.active.id);
    const to = event.over ? String(event.over.id) : null;
    if (to && to !== from) void store.swapSlots(from, to);
  }

  /** A page added at the end is a page the child means to look at. */
  async function appendPage() {
    await store.addPage();
    const grown = useStore.getState().album?.pages ?? [];
    const last = grown[grown.length - 1];
    if (last) setActivePageId(last.id);
  }

  async function removePage(page: Page) {
    if (!window.confirm(t('editor.confirmDeletePage'))) return;
    const at = pages.findIndex((p) => p.id === page.id);
    setActivePageId(pages[at - 1]?.id ?? pages[at + 1]?.id ?? null);
    await store.deletePage(page.id);
  }

  async function removeAlbum() {
    if (!window.confirm(t('editor.confirmDeleteAlbum'))) return;
    setDeleting(true);
    try {
      await store.deleteAlbum();
      onHome();
    } catch (err) {
      store.showToast((err as Error).message);
      setDeleting(false);
    }
  }

  /** One half of the open album: a page, or the cover panel facing it. */
  function half(number: number | null, side: 'left' | 'right') {
    if (number === null) {
      return (
        <InsideCoverSheet
          template={template}
          variantId={album!.coverVariantId}
          layout={layout}
          panel={side === 'left' ? 'insideFront' : 'insideBack'}
        />
      );
    }
    const page = pageAt(number);
    if (!page) return null;
    return (
      <PageSheet
        album={album!}
        layout={layout}
        page={page}
        pageNumber={number}
        template={template}
        token={token}
        active={page.id === activePage.id}
        onActivate={() => setActivePageId(page.id)}
        onOpenSlot={(slot) => setOpenSlotId(slot.id)}
        onDropFile={(slot, file) => void putPhoto(slot, file)}
        onRenamePage={(title) => void store.setPageTitle(page.id, title)}
      />
    );
  }

  const filled = countFilled(album);
  const empty = countEmpty(album);
  const accent = template.palette.badge;

  return (
    <div className="editor" style={{ ['--accent' as string]: accent, ['--ground' as string]: template.palette.pageBg }}>
      <header className="topbar">
        <button type="button" className="btn btn--ghost" onClick={onHome} aria-label={t('home.back')}>
          ←
        </button>

        <input
          className="topbar__title"
          value={titleDraft ?? album.title}
          maxLength={60}
          aria-label={t('editor.albumTitle')}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft !== null && titleDraft.trim() && titleDraft !== album.title) {
              void store.setTitle(titleDraft.trim());
            }
            setTitleDraft(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />

        <span className="status">
          {status === 'saving' && t('editor.saving')}
          {status === 'saved' && `✓ ${t('editor.saved')}`}
          {status === 'error' && `⚠ ${error ?? ''}`}
        </span>

        {/* Counter, languages and the album's actions: one group, so a narrow
            window drops them to a row of their own instead of on top of each other. */}
        <div className="topbar__actions">
          <span className="status">
            {filled} {t('editor.stickerCount')} · {empty} {t('editor.emptyCount')}
          </span>

          {undo && (
            <button type="button" className="btn btn--ghost" onClick={() => void store.undoLast()}>
              ↩ {t('editor.undo')}
            </button>
          )}

          <div className="langswitch">
            {(['sr-Cyrl', 'sr-Latn', 'en', 'ru'] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={album.lang === code}
                onClick={() => void store.setLang(code)}
              >
                {t(`lang.${code}`)}
              </button>
            ))}
          </div>

          {album.members.length > 0 && (
            <span className="members" title={album.members.map((m) => m.nickname).join(', ')}>
              {album.members.map((m) => (
                <span key={m.id} className="members__face">
                  {getAvatar(m.avatar).emoji}
                </span>
              ))}
            </span>
          )}

          <button type="button" className="btn btn--ghost" onClick={() => setInviting(true)}>
            🔗 {t('editor.share')}
          </button>

          <button type="button" className="btn btn--ghost" onClick={() => setCoverOpen(true)}>
            📕 {t('editor.cover')}
          </button>

          <button type="button" className="btn btn--primary" onClick={() => setPrinting(true)}>
            🖨 {t('editor.print')}
          </button>

          <button type="button" className="btn btn--ghost btn--danger" disabled={deleting} onClick={() => void removeAlbum()}>
            🗑 {t('editor.deleteAlbum')}
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="editor__stage">
          <div className="spread" role="group" aria-label={t('editor.spread')}>
            {half(spread.left, 'left')}
            <span className="spread__spine" aria-hidden="true" />
            {half(spread.right, 'right')}
          </div>
        </div>
      </DndContext>

      {/* What the child is looking at, and how many stickers it holds. */}
      <p className="spread-note">
        <strong>
          {spread.left !== null && spread.right !== null
            ? t('editor.spreadPages', { a: spread.left, b: spread.right })
            : t('editor.spreadPage', { a: spread.left ?? spread.right ?? 1 })}
        </strong>
        {' · '}
        {shownPages === 2
          ? t('editor.spreadCount', { n: layout.slotsPerPage, m: layout.slotsPerPage * 2 })
          : t('home.perPage', { n: layout.slotsPerPage })}
      </p>

      <nav className="pagestrip" aria-label={t('editor.page')}>
        {/* Chips are grouped the way the pages are bound, so the strip teaches the pairing. */}
        {allSpreads.map((s) => (
          <span key={s.index} className="pagepair" data-current={s.index === spread.index}>
            {[s.left, s.right]
              .filter((n): n is number => n !== null)
              .map((n) => (
                <button
                  key={n}
                  type="button"
                  className="pagechip"
                  aria-current={n === activeNumber}
                  onClick={() => setActivePageId(pageAt(n)?.id ?? null)}
                >
                  {n}
                </button>
              ))}
          </span>
        ))}
        <button type="button" className="pagechip" onClick={() => void appendPage()} title={t('editor.addPage')}>
          +
        </button>
        {pages.length > 1 && (
          <button type="button" className="btn btn--ghost btn--danger" onClick={() => void removePage(activePage)}>
            🗑 {t('editor.deletePage', { n: activeNumber })}
          </button>
        )}
      </nav>

      {openSlot && (
        <SlotDialog
          slot={openSlot}
          album={album}
          template={template}
          token={token}
          uploading={uploading}
          onUpload={(file) => void putPhoto(openSlot, file)}
          onChange={(patch) => void store.setSlot(openSlot, patch)}
          onClose={() => setOpenSlotId(null)}
        />
      )}

      {coverOpen && (
        <CoverDialog
          album={album}
          template={template}
          token={token}
          onChange={(patch) => void store.setCover(patch)}
          onOwnerNameChange={(ownerName) => void store.setOwnerName(ownerName)}
          onClose={() => setCoverOpen(false)}
        />
      )}

      {inviting && (
        <InviteDialog
          token={token}
          members={album.members}
          onClose={() => setInviting(false)}
          onCopied={() => store.showToast(t('editor.linkCopied'))}
        />
      )}

      {printing && (
        <PrintDialog token={token} title={album.title} template={template} onClose={() => setPrinting(false)} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
