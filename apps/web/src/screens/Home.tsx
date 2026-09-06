/**
 * Making an album: four small choices and a live picture of the result.
 *
 * The choices are ordered by how much they change that picture — theme, then
 * cover, then how big the book is, then whose name goes on it — and the cover
 * preview beside them updates on every one of them, so a child is choosing
 * between pictures rather than between words.
 *
 * The third of them has grown a middle question: standing stickers or lying
 * ones. It sits between the paper and the count because that is the order they
 * decide each other in — paper and turn together decide which counts can be
 * printed at all, so a count is offered only once both are known, and a count
 * the new shape cannot print snaps to one it can.
 *
 * Unlike the paper and the count, this one is only a starting point. It sets
 * the shape of the cells and of every sticker made in them; a child who later
 * wants one wide sticker for the whole team turns that one inside the album,
 * where they can see what it costs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlbumSize, Lang, PageLayout, StickerOrientation, Template } from '@album/shared';
import {
  ALBUM_SIZES,
  DEFAULT_ORIENTATION,
  DEFAULT_SLOTS_PER_PAGE,
  PAPER_NAME,
  STICKER_ORIENTATIONS,
  TEMPLATES,
  getAvatar,
  gridChoices,
  layoutFor,
  pageHeaderRect,
} from '@album/shared';
import { api } from '../api.ts';
import { readDeviceKey } from '../deviceKey.ts';
import { useIdentity } from '../identity.ts';
import { useLangStore, useT } from '../lang.ts';
import { suggestNickname } from '../nickname.ts';
import { readRecent, rememberAlbum } from '../store.ts';
import { PHONE, useMedia } from '../useMedia.ts';
import { CoverSheet, type CoverPhoto } from '../components/CoverSheet.tsx';
import { CoverPicker } from '../components/CoverPicker.tsx';
import { LangSwitch } from '../components/LangSwitch.tsx';
import { Welcome } from './Welcome.tsx';

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
 *
 * Every rectangle is asked of the layout rather than guessed at, so the glyph
 * is a true miniature of the page that gets printed — which is the only way a
 * picture of nine standing slots and a picture of eight lying ones can be
 * compared honestly.
 */
function SpreadGlyph({ layout }: { layout: PageLayout }) {
  const { page } = layout;
  const header = pageHeaderRect();
  const gutter = 6;
  const slots = Array.from({ length: layout.slotsPerPage }, (_, i) => layout.slotRect(i));
  return (
    <svg className="gridglyph" viewBox={`0 0 ${page.w * 2 + gutter} ${page.h}`} aria-hidden="true">
      {[0, page.w + gutter].map((originX) => (
        <g key={originX} transform={`translate(${originX} 0)`}>
          <rect x="0" y="0" width={page.w} height={page.h} rx="6" className="gridglyph__page" />
          <rect
            x={(header.x + header.w * 0.25) * layout.scale}
            y={header.y * layout.scale}
            width={header.w * 0.5 * layout.scale}
            height={header.h * 0.55 * layout.scale}
            rx="2"
            className="gridglyph__bar"
          />
          {slots.map((slot, i) => (
            <rect key={i} x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx="3" className="gridglyph__slot" />
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
  const [orientation, setOrientation] = useState<StickerOrientation>(DEFAULT_ORIENTATION);
  const [slotsPerPage, setSlotsPerPage] = useState<number>(DEFAULT_SLOTS_PER_PAGE[DEFAULT_ORIENTATION].a3);
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

  /**
   * A genuinely first visit gets asked who it is before it gets asked to make
   * anything. Both halves are read from storage rather than waited for, so
   * neither screen flashes on its way to the other: a device key means a
   * passport, and albums remembered here mean this browser has been through
   * this before — passports are younger than the albums some children already
   * have, and re-introducing yourself to an app you have used is nonsense.
   */
  const [welcome, setWelcome] = useState(() => !readDeviceKey() && localRecent.length === 0);

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
  const layout = layoutFor(size, slotsPerPage, orientation);

  // A different theme means a different set of covers.
  useEffect(() => {
    setVariantId(chosen.variants[0]!.id);
  }, [chosen]);

  // A slot count the new paper — or the new shape of sticker — cannot print
  // snaps to one it can, rather than leaving a card selected that is no longer
  // on the row.
  useEffect(() => {
    setSlotsPerPage((current) => layoutFor(size, current, orientation).slotsPerPage);
  }, [size, orientation]);

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
      // A passport, if this browser somehow got here without one — the welcome
      // was skipped by an old local album, or its minting failed. The name on
      // the cover seeds it, but never renames a passport that already exists:
      // this box takes both children in "Милица и Ана", and the child already
      // said who they are on a screen that asked properly.
      await identity
        .ensure(lang, { nickname: ownerName.trim() })
        .catch(() => undefined); // An album without a passport is still an album.

      const made = await api.createAlbum({
        templateId,
        coverVariantId: variantId,
        size,
        stickerOrientation: orientation,
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

  /*
   * Before anything else, once: a face and a name. It is rendered from here
   * rather than routed to, because it is a moment in making an album and not a
   * place — nothing links to it, and reloading lands on whichever of the two
   * screens is now true.
   */
  if (welcome) return <Welcome onDone={() => setWelcome(false)} />;

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
                const preview = layoutFor(option, undefined, orientation);
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

            <h3 className="group__name">{t('home.pickOrientation')}</h3>
            <div className="turngrid">
              {STICKER_ORIENTATIONS.map((option) => {
                const shape = layoutFor(size, undefined, option).sticker;
                return (
                  <button
                    key={option}
                    type="button"
                    className="turncard"
                    aria-pressed={orientation === option}
                    onClick={() => setOrientation(option)}
                  >
                    {/* The sticker itself, both at true relative scale: one is the other turned. */}
                    <span className="turncard__paper">
                      <span
                        className="turncard__sticker"
                        style={{ height: `${(shape.h / 70) * 100}%`, aspectRatio: `${shape.w} / ${shape.h}` }}
                      />
                    </span>
                    <strong>{t(`home.orientation.${option}`)}</strong>
                    <span className="sizecard__hint">{t(`home.orientation.${option}Hint`)}</span>
                  </button>
                );
              })}
            </div>
            <p className="hint">{t('home.orientationNote')}</p>

            <h3 className="group__name">{t('home.pickPerPage')}</h3>
            <div className="pergrid">
              {gridChoices(size, orientation).map((choice) => (
                <button
                  key={choice.perPage}
                  type="button"
                  className="percard"
                  aria-pressed={slotsPerPage === choice.perPage}
                  onClick={() => setSlotsPerPage(choice.perPage)}
                >
                  <SpreadGlyph layout={layoutFor(size, choice.perPage, orientation)} />
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
