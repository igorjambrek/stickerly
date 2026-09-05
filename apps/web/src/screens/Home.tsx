/**
 * Making an album: four small choices and a live picture of the result.
 *
 * The choices are ordered by how much they change that picture — theme, then
 * cover, then how big the book is, then whose name goes on it — and the cover
 * preview beside them updates on every one of them, so a child is choosing
 * between pictures rather than between words.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlbumSize, Lang, Template } from '@album/shared';
import {
  ALBUM_SIZES,
  DEFAULT_SLOTS_PER_PAGE,
  GRID_CHOICES,
  PAPER_NAME,
  TEMPLATES,
  getAvatar,
  layoutFor,
} from '@album/shared';
import { api } from '../api.ts';
import { useIdentity } from '../identity.ts';
import { useLangStore, useT } from '../lang.ts';
import { suggestNickname } from '../nickname.ts';
import { readRecent, rememberAlbum } from '../store.ts';
import { PHONE, useMedia } from '../useMedia.ts';
import { CoverSheet, type CoverPhoto } from '../components/CoverSheet.tsx';
import { CoverPicker } from '../components/CoverPicker.tsx';
import { LangSwitch } from '../components/LangSwitch.tsx';

const GROUPS: { key: Template['group']; labelKey: string }[] = [
  { key: 'action', labelKey: 'home.group.action' },
  { key: 'friends', labelKey: 'home.group.friends' },
];

/** A numbered heading, so four decisions read as a path rather than a form. */
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="step">
      <span className="step__n">{n}</span>
      <span className="step__text">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </span>
    </div>
  );
}

function TemplateCard({
  template,
  variantId,
  selected,
  lang,
  onPick,
}: {
  template: Template;
  variantId: string;
  selected: boolean;
  lang: Lang;
  onPick: () => void;
}) {
  return (
    <button type="button" className="template-card" aria-pressed={selected} onClick={onPick}>
      <CoverSheet
        className="template-card__art"
        template={template}
        variantId={variantId}
        title=""
        lang={lang}
        bare
      />
      <span className="template-card__name">
        {template.emoji} {template.name[lang]}
      </span>
    </button>
  );
}

/**
 * The choice, at a glance: an open album, because the count is per page and an
 * open album is two pages. Drawing one page here is what made a child expect
 * nine stickers where the finished book gives them eighteen.
 */
function SpreadGlyph({ cols, rows, size }: { cols: number; rows: number; size: AlbumSize }) {
  const page = layoutFor(size, cols * rows).page;
  const gutter = 6;
  const gap = 8;
  const cellW = 50;
  const cellH = 76;
  const blockW = cols * cellW + (cols - 1) * gap;
  const blockH = rows * cellH + (rows - 1) * 6;
  const slots = Array.from({ length: cols * rows }, (_, i) => ({
    x: (page.w - blockW) / 2 + (i % cols) * (cellW + gap),
    y: (page.h - blockH) / 2 + Math.floor(i / cols) * (cellH + 6),
  }));
  return (
    <svg className="gridglyph" viewBox={`0 0 ${page.w * 2 + gutter} ${page.h}`} aria-hidden="true">
      {[0, page.w + gutter].map((originX) => (
        <g key={originX} transform={`translate(${originX} 0)`}>
          <rect x="0" y="0" width={page.w} height={page.h} rx="6" className="gridglyph__page" />
          <rect
            x={page.w * 0.25}
            y={page.h * 0.055}
            width={page.w * 0.5}
            height={page.h * 0.028}
            rx="2"
            className="gridglyph__bar"
          />
          {slots.map((slot, i) => (
            <rect
              key={i}
              x={slot.x}
              y={slot.y}
              width={cellW}
              height={cellH - 6}
              rx="3"
              className="gridglyph__slot"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Read a picture the child has just chosen, before any album exists to put it in. */
function readLocalPhoto(file: File): Promise<CoverPhoto> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable image'));
    };
    img.src = url;
  });
}

export function Home({ onOpen, onPassport }: { onOpen: (token: string) => void; onPassport: () => void }) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const identity = useIdentity();

  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0]!.id);
  const [variantId, setVariantId] = useState<string>(TEMPLATES[0]!.variants[0]!.id);
  const [size, setSize] = useState<AlbumSize>('a3');
  const [slotsPerPage, setSlotsPerPage] = useState<number>(DEFAULT_SLOTS_PER_PAGE.a3);
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<CoverPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [ownerTouched, setOwnerTouched] = useState(false);
  const localRecent = useMemo(readRecent, []);
  const photoUrl = useRef<string | null>(null);
  const preview = useRef<HTMLElement>(null);
  const phone = useMedia(PHONE);

  /**
   * A name is waiting in the box before the child gets there — theirs if they
   * have a passport, an invented one if this is their first visit. Typing your
   * real name stops being the path of least resistance, and a six-year-old is
   * no longer blocked by a text field they cannot spell their way past.
   */
  const [suggested] = useState(() => suggestNickname(lang));

  useEffect(() => {
    void identity.load();
  }, []);

  // Set on the first keystroke, not on blur like `ownerTouched`: the passport
  // arrives from the network, and a name that landed mid-word would type over
  // what the child was in the middle of writing.
  const [ownerEdited, setOwnerEdited] = useState(false);

  useEffect(() => {
    if (!ownerEdited) setOwnerName(identity.person?.nickname ?? suggested.nickname);
  }, [identity.person, ownerEdited, suggested]);

  /**
   * The passport's list when there is one — it followed the child here from
   * whatever device they last used — and this browser's own memory otherwise.
   */
  const recent = identity.person
    ? identity.albums.map((a) => ({ token: a.editToken, title: a.title, templateId: a.templateId }))
    : localRecent;

  const chosen = TEMPLATES.find((x) => x.id === templateId)!;
  const layout = layoutFor(size, slotsPerPage);

  // A different theme means a different set of covers.
  useEffect(() => {
    setVariantId(chosen.variants[0]!.id);
  }, [chosen]);

  // A slot count the new paper cannot print snaps to one it can.
  useEffect(() => {
    setSlotsPerPage((current) => layoutFor(size, current).slotsPerPage);
  }, [size]);

  useEffect(() => () => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
  }, []);

  async function pickPhoto(file: File) {
    try {
      const photo = await readLocalPhoto(file);
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = photo.url;
      setCoverFile(file);
      setCoverPhoto(photo);
      setError(null);
    } catch {
      setError(t('print.error'));
    }
  }

  function dropPhoto() {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = null;
    setCoverFile(null);
    setCoverPhoto(null);
  }

  async function create() {
    if (!title.trim() || !ownerName.trim()) {
      setNameTouched(true);
      setOwnerTouched(true);
      setError(!title.trim() ? t('home.nameRequired') : t('home.ownerNameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The passport is made here, at the first moment it means anything: the
      // child now owns something worth being able to find again. The name on
      // the cover and the name on the passport are one value, not two, so a
      // name typed over the suggestion renames the passport as well.
      await identity
        .ensure(lang, { nickname: ownerName.trim() })
        .then((person) =>
          ownerEdited && ownerName.trim() !== person.nickname
            ? identity.update({ nickname: ownerName.trim() }, lang)
            : undefined,
        )
        .catch(() => undefined); // An album without a passport is still an album.

      const made = await api.createAlbum({
        templateId,
        coverVariantId: variantId,
        size,
        slotsPerPage,
        title: title.trim(),
        ownerName: ownerName.trim(),
        lang,
      });

      // The photo can only be uploaded once the album it belongs to exists.
      if (coverFile) {
        const image = await api.uploadImage(made.editToken, coverFile, 'cover');
        await api.setCover(made.editToken, { coverImageId: image.id });
      }

      rememberAlbum(made.album, made.editToken);
      onOpen(made.editToken);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home" style={{ ['--accent' as string]: chosen.palette.badge }}>
      <header className="home__bar">
        <span className="brand">
          <span className="brand__mark">✨</span>
          {t('app.name')}
        </span>
        <span className="spacer" />
        <LangSwitch lang={lang} onPick={setLang} />
        <button type="button" className="btn btn--ghost" onClick={onPassport}>
          {identity.person ? getAvatar(identity.person.avatar).emoji : '🪪'}
          <span className="btn__label">{t('passport.open')}</span>
        </button>
      </header>

      <div className="home__hero">
        <h1>{t('home.title')}</h1>
        <p>{t('home.subtitle')}</p>
      </div>

      {recent.length > 0 && (
        <>
          <h2 className="group__name">{t('home.recent')}</h2>
          <div className="recent">
            {recent.map((album) => (
              <a key={album.token} className="recent__item" href={`/a/${album.token}`}>
                <span style={{ fontSize: 22 }}>{TEMPLATES.find((x) => x.id === album.templateId)?.emoji ?? '📔'}</span>
                <strong className="spacer">{album.title}</strong>
                <span style={{ color: 'var(--muted)' }}>{t('home.openAlbum')} →</span>
              </a>
            ))}
          </div>
        </>
      )}

      <div className="home__layout">
        <div className="home__steps">
          <section className="panel">
            <Step n={1} title={t('home.pickTemplate')} />
            {GROUPS.map((group) => (
              <div key={group.key}>
                <h3 className="group__name">{t(group.labelKey)}</h3>
                <div className="template-grid">
                  {TEMPLATES.filter((x) => x.group === group.key).map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      variantId={template.id === templateId ? variantId : template.variants[0]!.id}
                      selected={template.id === templateId}
                      lang={lang}
                      onPick={() => setTemplateId(template.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <Step n={2} title={t('home.pickCover')} hint={t('home.coverHint')} />
            <CoverPicker
              template={chosen}
              variantId={variantId}
              lang={lang}
              photo={coverPhoto}
              onPick={setVariantId}
              onPhoto={(file) => void pickPhoto(file)}
              onRemovePhoto={dropPhoto}
            />
          </section>

          <section className="panel">
            <Step n={3} title={t('home.pickSize')} hint={t('home.sizeNote')} />
            <div className="sizegrid">
              {ALBUM_SIZES.map((option) => {
                const preview = layoutFor(option, DEFAULT_SLOTS_PER_PAGE[option]);
                return (
                  <button
                    key={option}
                    type="button"
                    className="sizecard"
                    aria-pressed={size === option}
                    onClick={() => setSize(option)}
                  >
                    <span className="sizecard__paper">
                      {/* Both pages at true relative scale: the choice is a physical one. */}
                      <span
                        className="sizecard__page"
                        style={{
                          height: `${(preview.page.h / 297) * 100}%`,
                          aspectRatio: `${preview.page.w} / ${preview.page.h}`,
                        }}
                      >
                        {PAPER_NAME[option]}
                      </span>
                    </span>
                    <strong>{t(`home.size.${option}`)}</strong>
                    <span className="sizecard__hint">{t(`home.size.${option}Hint`)}</span>
                  </button>
                );
              })}
            </div>

            <h3 className="group__name">{t('home.pickPerPage')}</h3>
            <div className="pergrid">
              {GRID_CHOICES[size].map((choice) => (
                <button
                  key={choice.perPage}
                  type="button"
                  className="percard"
                  aria-pressed={slotsPerPage === choice.perPage}
                  onClick={() => setSlotsPerPage(choice.perPage)}
                >
                  <SpreadGlyph cols={choice.cols} rows={choice.rows} size={size} />
                  <span>{t('home.perPage', { n: choice.perPage })}</span>
                  <span className="percard__open">{t('home.perPageOpen', { m: choice.perPage * 2 })}</span>
                </button>
              ))}
            </div>
            <p className="hint">
              {t('home.perPageHint', { n: slotsPerPage, m: slotsPerPage * 2 })}
            </p>
          </section>

          <section className="panel">
            <Step n={4} title={t('home.albumName')} />
            <div className="form-row">
              <div>
                <label className="label" htmlFor="album-title">
                  {t('home.albumName')} *
                </label>
                <input
                  id="album-title"
                  className="field"
                  value={title}
                  maxLength={60}
                  required
                  aria-required="true"
                  aria-invalid={nameTouched && !title.trim()}
                  placeholder={t('home.albumNamePlaceholder')}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                />
              </div>
              <div>
                <label className="label" htmlFor="owner-name">
                  {t('home.yourName')} *
                </label>
                <input
                  id="owner-name"
                  className="field"
                  value={ownerName}
                  maxLength={30}
                  required
                  aria-required="true"
                  aria-invalid={ownerTouched && !ownerName.trim()}
                  placeholder={t('home.yourNamePlaceholder')}
                  onChange={(e) => {
                    setOwnerEdited(true);
                    setOwnerName(e.target.value);
                  }}
                  onBlur={() => setOwnerTouched(true)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="home__preview" ref={preview}>
          <div className="preview">
            <h3 className="group__name">{t('home.preview')}</h3>
            <CoverSheet
              template={chosen}
              variantId={variantId}
              title={title.trim() || chosen.name[lang]}
              ownerName={ownerName.trim()}
              stickerCount={0}
              lang={lang}
              photo={coverPhoto}
            />
            <p className="preview__facts">
              {t('editor.albumFormat', { paper: PAPER_NAME[size], n: layout.slotsPerPage })}
              {' · '}
              {t('home.perPageOpen', { m: layout.slotsPerPage * 2 })}
            </p>

            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

            <button
              type="button"
              className="btn btn--primary btn--big"
              disabled={busy || !title.trim() || !ownerName.trim()}
              title={!title.trim() ? t('home.nameRequired') : !ownerName.trim() ? t('home.ownerNameRequired') : undefined}
              onClick={create}
            >
              {busy ? t('home.creating') : `${chosen.emoji} ${t('home.create')}`}
            </button>
          </div>
        </aside>
      </div>

      {/*
        On a phone the cover sits at the bottom of a long page, so the thing
        being made and the button that makes it would both be out of sight for
        most of the making. This keeps them on the screen the whole way down;
        the thumbnail scrolls back to the full-size cover.
      */}
      {phone && (
        <div className="makebar">
          {error && <p className="makebar__error">{error}</p>}

          <div className="makebar__row">
            <button
              type="button"
              className="makebar__thumb"
              aria-label={t('home.preview')}
              onClick={() => preview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              <CoverSheet
                template={chosen}
                variantId={variantId}
                title=""
                lang={lang}
                photo={coverPhoto}
                bare
              />
            </button>

            <span className="makebar__text">
              <strong>{title.trim() || chosen.name[lang]}</strong>
              <span>
                {PAPER_NAME[size]} · {t('home.perPage', { n: layout.slotsPerPage })}
              </span>
            </span>

            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !title.trim() || !ownerName.trim()}
              onClick={create}
            >
              {busy ? t('home.creating') : t('home.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
