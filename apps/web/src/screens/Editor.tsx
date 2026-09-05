/**
 * The album editor.
 *
 * An open album shows two pages, so the editor shows two pages: the spread the
 * child would be looking at with the finished book in their lap, facing pages
 * and all — page 1 alone beside the inside of the cover, then 2 and 3, then 4
 * and 5. `spreads()` in the shared module decides the pairing, the same rule
 * the folded sheets obey.
 *
 * A phone cannot show two A4 pages and still leave a sticker big enough to
 * hit, so there the spread becomes a swipe: the two halves sit in a
 * scroll-snapping row, one filling the screen at a time, and swiping between
 * them is the same gesture as glancing across a real spread. Which half is on
 * screen and which page is *active* are then one thing, kept in step in both
 * directions — swipe and the strip follows, tap the strip and it swipes.
 *
 * One of the two is the active page: the one the strip has selected and the
 * one page-wide actions name. Photos arrive by dropping a file straight onto a
 * slot or by tapping it; stickers are reordered by dragging one onto another
 * (on a touch screen, by pressing one until it lifts), and the numbers follow.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Page, Slot } from '@album/shared';
import { countEmpty, countFilled, getTemplate, layoutFor, spreadOfPage, spreads } from '@album/shared';
import { api } from '../api.ts';
import { useLangStore, useT } from '../lang.ts';
import { useLiveAlbum } from '../live.ts';
import { rememberAlbum, useStore } from '../store.ts';
import { PHONE, useMedia } from '../useMedia.ts';
import { PageSheet } from '../components/PageSheet.tsx';
import { InsideCoverSheet } from '../components/InsideCoverSheet.tsx';
import { CoverDialog } from '../components/CoverDialog.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { LangSwitch } from '../components/LangSwitch.tsx';
import { Presence } from '../components/Presence.tsx';
import { PrintDialog } from '../components/PrintDialog.tsx';
import { SlotDialog } from '../components/SlotDialog.tsx';
import { InviteDialog } from '../components/InviteDialog.tsx';

/**
 * One thing the child can do to the whole album. Described once, because the
 * bar and the phone's menu are two arrangements of the same list and a button
 * that exists in only one of them is a feature a phone silently loses.
 */
interface Action {
  key: string;
  icon: string;
  label: string;
  run: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export function Editor({ token, onHome }: { token: string; onHome: () => void }) {
  const t = useT();
  const setUiLang = useLangStore((s) => s.setLang);
  const store = useStore();
  const { album, status, error, undo, toast, peers, socketId, offline } = store;
  const phone = useMedia(PHONE);

  /**
   * The other half of the album: everything anybody else does to it, arriving
   * while this screen is open. It only ever writes to the store, so nothing
   * below has to know it is there.
   */
  useLiveAlbum(token);

  // The active page is held by id, not by index: pages are renumbered on every
  // insert and delete, and an id is the only handle that survives that.
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLElement>(null);
  /** Where a scroll we started ourselves is heading, so we do not read it back. */
  const settling = useRef<number | null>(null);
  const positioned = useRef(false);
  /** Which spread the track was last put on: a turn jumps, a swipe glides. */
  const staged = useRef(0);

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

  /**
   * A mouse drags on the eighth pixel; a finger has to hold still for a moment
   * first, or every attempt to scroll the album would tear a sticker off the
   * page. Two sensors rather than one `PointerSensor`, because those are two
   * different promises to make.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const pages = album?.pages ?? [];
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];
  const activeNumber = (activePage?.position ?? 0) + 1;
  const allSpreads = spreads(Math.max(1, pages.length));
  const spread = allSpreads[spreadOfPage(activeNumber)] ?? allSpreads[0]!;
  const halves: (number | null)[] = [spread.left, spread.right];
  const activeHalf = Math.max(0, halves.indexOf(activeNumber));

  /*
   * Which way the child has just turned, so the pages can come in the way the
   * paper would move. Read while rendering rather than in an effect: an effect
   * would paint the new spread once, sitting still, before anything could
   * start moving it.
   */
  const seenSpread = useRef(spread.index);
  const lastTurn = useRef<'forward' | 'back'>('forward');
  if (seenSpread.current !== spread.index) {
    lastTurn.current = spread.index > seenSpread.current ? 'forward' : 'back';
    seenSpread.current = spread.index;
  }

  /**
   * The swiped half and the selected page are the same fact seen twice. This
   * half of the loop moves the strip's choice onto the screen; `onStageScroll`
   * moves the screen's choice back onto the strip.
   *
   * A scroll we started ourselves passes through the other half on its way,
   * and reading it back mid-flight would drag the album straight home again —
   * so the destination is remembered until it is reached, or until it is
   * plainly not going to be.
   *
   * Only a move between the halves of one spread glides. A turn has motion of
   * its own — the page falling shut, below — so the track is simply put where
   * it belongs, before the frame that would otherwise show the wrong half of
   * a spread that has already changed underneath it.
   */
  useLayoutEffect(() => {
    const el = stage.current;
    if (!phone || !el) return;
    const turned = staged.current !== spread.index;
    staged.current = spread.index;
    const target = activeHalf * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) <= 4) return;
    settling.current = target;
    el.scrollTo({ left: target, behavior: positioned.current && !turned ? 'smooth' : 'auto' });
    positioned.current = true;
    const giveUp = window.setTimeout(() => (settling.current = null), 600);
    return () => window.clearTimeout(giveUp);
  }, [phone, activeHalf, spread.index, pages.length]);

  // The strip is one long row on a phone; the page being edited has to be on it.
  useEffect(() => {
    if (!phone) return;
    strip.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [phone, spread.index]);

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

  if (!album || !activePage) return <div className="center-note">{t('editor.saving')}</div>;

  const pageAt = (number: number): Page | undefined => pages.find((p) => p.position === number - 1);
  /*
   * A leaf turns onto the left page when the child goes forward and onto the
   * right one when they go back; the other half of the spread was underneath
   * it the whole time and is merely uncovered. The stylesheet moves them.
   */
  const leafRole = (side: 'left' | 'right') =>
    (lastTurn.current === 'forward') === (side === 'left') ? 'turn' : 'uncover';
  const shownPages = halves.filter((n) => n !== null).length;
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

  /** Which half of the spread a finger has come to rest on. */
  function onStageScroll() {
    const el = stage.current;
    if (!phone || !el || el.clientWidth === 0) return;
    if (settling.current !== null) {
      if (Math.abs(el.scrollLeft - settling.current) > 4) return;
      settling.current = null;
      return;
    }
    const number = halves[Math.round(el.scrollLeft / el.clientWidth)];
    const page = number === null || number === undefined ? undefined : pageAt(number);
    if (page && page.id !== activePage!.id) setActivePageId(page.id);
  }

  /** Turning a page: forward lands on the left of the next spread, back on the right. */
  function turn(delta: number) {
    const next = allSpreads[spread.index + delta];
    if (!next) return;
    const number = delta > 0 ? (next.left ?? next.right) : (next.right ?? next.left);
    const page = number === null ? undefined : pageAt(number);
    if (page) setActivePageId(page.id);
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
        active={page.id === activePage!.id}
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
  const counts = `${filled} ${t('editor.stickerCount')} · ${empty} ${t('editor.emptyCount')}`;
  const run = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  const actions: Action[] = [
    ...(undo ? [{ key: 'undo', icon: '↩', label: t('editor.undo'), run: () => void store.undoLast() }] : []),
    { key: 'share', icon: '🔗', label: t('editor.share'), run: () => setInviting(true) },
    { key: 'cover', icon: '📕', label: t('editor.cover'), run: () => setCoverOpen(true) },
    { key: 'print', icon: '🖨', label: t('editor.print'), run: () => setPrinting(true), primary: true },
    ...(pages.length > 1
      ? [
          {
            key: 'deletePage',
            icon: '🗑',
            label: t('editor.deletePage', { n: activeNumber }),
            run: () => void removePage(activePage!),
            danger: true,
          },
        ]
      : []),
    {
      key: 'deleteAlbum',
      icon: '🗑',
      label: t('editor.deleteAlbum'),
      run: () => void removeAlbum(),
      danger: true,
      disabled: deleting,
    },
  ];

  const printAction = actions.find((a) => a.key === 'print')!;
  const deletePageAction = actions.find((a) => a.key === 'deletePage');
  /* On a wide screen deleting a page stays down beside the pages it names. */
  const barActions = actions.filter((a) => a.key !== 'deletePage');
  const saved = status === 'saving' ? '⏳' : status === 'error' ? '⚠' : '✓';

  return (
    <div className="editor" style={{ ['--accent' as string]: accent, ['--ground' as string]: template.palette.pageBg }}>
      <header className="topbar">
        <button type="button" className="btn btn--ghost btn--icon" onClick={onHome} aria-label={t('home.back')}>
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

        {/* On a phone the same three states, said in one character. */}
        <span className="status" title={status === 'error' ? (error ?? '') : undefined}>
          {phone ? (
            saved
          ) : (
            <>
              {status === 'saving' && t('editor.saving')}
              {status === 'saved' && `✓ ${t('editor.saved')}`}
              {status === 'error' && `⚠ ${error ?? ''}`}
            </>
          )}
        </span>

        {/* Only while the news is actually stuck. Edits are still saving — this
            says the album has stopped moving on its own, not that it is broken. */}
        {offline && (
          <span
            className="status status--offline"
            title={t('editor.reconnecting')}
            aria-label={t('editor.reconnecting')}
          >
            {phone ? '📡' : `📡 ${t('editor.reconnecting')}`}
          </span>
        )}

        {/* Counter, languages and the album's actions: one group, so a narrow
            window drops them to a row of their own instead of on top of each other. */}
        <div className="topbar__actions">
          {phone ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--icon"
                onClick={printAction.run}
                aria-label={printAction.label}
              >
                {printAction.icon}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setMenuOpen(true)}
                aria-label={t('editor.more')}
              >
                ⋯
              </button>
            </>
          ) : (
            <>
              <span className="status">{counts}</span>

              <LangSwitch lang={album.lang} onPick={(code) => void store.setLang(code)} />

              <Presence members={album.members} peers={peers} socketId={socketId} />

              {barActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className={`btn ${action.primary ? 'btn--primary' : 'btn--ghost'}${action.danger ? ' btn--danger' : ''}`}
                  disabled={action.disabled}
                  onClick={action.run}
                >
                  {action.icon} {action.label}
                </button>
              ))}
            </>
          )}
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="editor__stage">
          <div
            className="spread"
            role="group"
            aria-label={t('editor.spread')}
            ref={stage}
            onScroll={onStageScroll}
          >
            {/* Keyed by the spread: a turn hands the browser a new element, so the
                animation runs again even when the child turns the same way twice.
                The blank sheet is what the leaf comes off and what the uncovered
                page comes out from under; it is paper, and it has no meaning. */}
            <div className="spread__half">
              <div className="spread__under" key={`u${spread.index}`} aria-hidden="true" />
              <div className="spread__leaf" key={spread.index} data-leaf={leafRole('left')}>
                {half(spread.left, 'left')}
              </div>
            </div>
            <span className="spread__spine" aria-hidden="true" />
            <div className="spread__half">
              <div className="spread__under" key={`u${spread.index}`} aria-hidden="true" />
              <div className="spread__leaf" key={spread.index} data-leaf={leafRole('right')}>
                {half(spread.right, 'right')}
              </div>
            </div>
          </div>
        </div>
      </DndContext>

      {/* What the child is looking at, how many stickers it holds, and the two
          ways to leave it: an arrow either side, big enough for a thumb. */}
      <div className="pager">
        <button
          type="button"
          className="btn pager__arrow"
          disabled={spread.index === 0}
          onClick={() => turn(-1)}
          aria-label={t('editor.prevSpread')}
        >
          ‹
        </button>

        {/*
          A phone gets the page numbers and the gesture, and nothing else: the
          per-page count is a fact about the whole album, and every line spent
          on it here is a line taken off the page above.
        */}
        <p className="spread-note">
          <strong>
            {spread.left !== null && spread.right !== null
              ? t('editor.spreadPages', { a: spread.left, b: spread.right })
              : t('editor.spreadPage', { a: spread.left ?? spread.right ?? 1 })}
          </strong>
          {!phone && (
            <>
              {' · '}
              {shownPages === 2
                ? t('editor.spreadCount', { n: layout.slotsPerPage, m: layout.slotsPerPage * 2 })
                : t('home.perPage', { n: layout.slotsPerPage })}
            </>
          )}
          {/* Every spread has two halves — the odd ones face the inside of the cover. */}
          {phone && <span className="spread-note__hint">{t('editor.swipeHint')}</span>}
        </p>

        <button
          type="button"
          className="btn pager__arrow"
          disabled={spread.index === allSpreads.length - 1}
          onClick={() => turn(1)}
          aria-label={t('editor.nextSpread')}
        >
          ›
        </button>
      </div>

      <nav className="pagestrip" aria-label={t('editor.page')} ref={strip}>
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
        {!phone && deletePageAction && (
          <button type="button" className="btn btn--ghost btn--danger" onClick={deletePageAction.run}>
            {deletePageAction.icon} {deletePageAction.label}
          </button>
        )}
      </nav>

      {menuOpen && (
        <Dialog variant="dialog--menu" title={t('editor.more')} onClose={() => setMenuOpen(false)}>
          <p className="menu__facts">{counts}</p>
          {offline && <p className="menu__facts">📡 {t('editor.reconnecting')}</p>}

          <LangSwitch
            lang={album.lang}
            onPick={(code) => {
              setMenuOpen(false);
              void store.setLang(code);
            }}
          />

          <Presence
            members={album.members}
            peers={peers}
            socketId={socketId}
            withNames
            className="menu__members"
          />

          <div className="menu__list">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={`menu__item${action.danger ? ' menu__item--danger' : ''}`}
                disabled={action.disabled}
                onClick={run(action.run)}
              >
                <span className="menu__icon" aria-hidden="true">
                  {action.icon}
                </span>
                {action.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}

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
        <PrintDialog
          token={token}
          title={album.title}
          lang={album.lang}
          template={template}
          onClose={() => setPrinting(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
