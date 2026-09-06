/**
 * The print dialog.
 *
 * Two things go wrong on the way from a PDF to an album: the wrong scale, and
 * the wrong paper. Scale has always been step one. Paper is why each download
 * wears its own badge here — card for the cover, something heavier than office
 * paper for the pages, self-adhesive for the stickers.
 *
 * The other half of the job happens at a counter somewhere, where nobody can
 * see this screen, so the dialog also hands over two ways to take it along: a
 * note to paste into a message, and a link to the same thing as a page of its
 * own (`PrintNotice`) that opens on a phone.
 *
 * Everything technical — imposition, page size, margins, sticker pitch — has
 * already been decided by the server. What the paper is called and how many
 * sheets it takes comes from `@album/shared`, so this dialog, that page and
 * the PDFs' own metadata cannot end up telling a print shop different things.
 */

import { useEffect, useState } from 'react';
import type { Lang, NumberSide, PartPrintInfo, Template } from '@album/shared';
import { DEFAULT_NUMBER_SIDE, NUMBER_SIDES, printShopNote } from '@album/shared';
import { api, type PrintSummary } from '../api.ts';
import { useT } from '../lang.ts';
import { PART_LOOK, noticePath, printParts } from '../printing.ts';
import { Dialog } from './Dialog.tsx';

export interface PrintDialogProps {
  token: string;
  /** The album's name: the downloads are named after it, and so is the note. */
  title: string;
  /** The album's language: the download filenames say which PDF is which in it. */
  lang: Lang;
  template: Template;
  onClose: () => void;
}

function PartRow({ info, href, accent }: { info: PartPrintInfo; href: string; accent: string }) {
  const t = useT();
  const look = PART_LOOK[info.part];
  return (
    <div className="print-row">
      <span style={{ fontSize: 30 }} aria-hidden="true">
        {look.icon}
      </span>
      <span className="print-row__text">
        <strong>{t(`print.${info.part}`)}</strong>
        <span className={`paper-chip paper-chip--${look.chip}`}>{info.paper}</span>
        <span className="print-row__hint">{info.sheetsLine}</span>
      </span>
      <a className="btn btn--primary" style={{ background: accent }} href={href} download={info.file}>
        {t('print.download')}
      </a>
    </div>
  );
}

/**
 * The choice, drawn rather than described: one sticker with the number in its
 * corner, or two — the sticker and the backing behind it — with the number on
 * the paper that gets thrown away.
 */
function NumberSideGlyph({ side, accent }: { side: NumberSide; accent: string }) {
  const sticker = (x: number, dashed: boolean) => (
    <g>
      <rect
        x={x}
        y={3}
        width={24}
        height={34}
        rx={3}
        className={dashed ? 'numglyph__back' : 'numglyph__face'}
        strokeDasharray={dashed ? '3 2.4' : undefined}
      />
      {!dashed && <rect x={x + 2} y={28} width={20} height={7} rx={2} fill={accent} opacity={0.7} />}
    </g>
  );
  return (
    <svg className="numglyph" viewBox="0 0 60 40" aria-hidden="true">
      {side === 'sticker' ? (
        <>
          {sticker(18, false)}
          <circle cx={24} cy={11} r={6} fill={accent} />
          <text x={24} y={14.6} className="numglyph__n numglyph__n--badge">
            7
          </text>
        </>
      ) : (
        <>
          {sticker(4, false)}
          {sticker(32, true)}
          <text x={44} y={25} className="numglyph__n" fill={accent}>
            7
          </text>
        </>
      )}
    </svg>
  );
}

export function PrintDialog({ token, title, lang, template, onClose }: PrintDialogProps) {
  const t = useT();
  const [summary, setSummary] = useState<PrintSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<'note' | 'link' | null>(null);
  /**
   * Where the sticker numbers go. It belongs to this print run and not to the
   * album, so it lives here for as long as the dialog is open and travels on
   * in the download links and in the print-shop sheet's own address.
   */
  const [numbers, setNumbers] = useState<NumberSide>(DEFAULT_NUMBER_SIDE);

  useEffect(() => {
    let live = true;
    api
      .printSummary(token)
      .then((s) => live && setSummary(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [token]);

  // "Copied!" is a moment, not a state worth keeping.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const accent = template.palette.badge;
  const opts = { numbers };
  const parts = summary ? printParts(t, summary, title, lang, opts) : [];
  const shopNote = printShopNote(t, parts);

  const copy = async (what: 'note' | 'link', text: string) => {
    const ok = await navigator.clipboard
      ?.writeText(text)
      .then(() => true)
      .catch(() => false);
    if (ok) setCopied(what);
  };

  return (
    <Dialog
      variant="dialog--wide"
      title={t('print.title')}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('print.close')}
          </button>
        </>
      }
    >
      {failed && <p style={{ color: 'var(--danger)' }}>{t('print.error')}</p>}
      {!summary && !failed && <p style={{ color: 'var(--muted)' }}>{t('print.making')}</p>}

      {summary && (
        <>
          <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
            {t('editor.albumFormat', { paper: summary.sheetPaper, n: summary.slotsPerPage })}
          </p>

          {parts.map((info) => (
            <PartRow key={info.part} info={info} href={api.printUrl(token, info.part, opts)} accent={accent} />
          ))}

          {summary.fillerCount > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 15 }}>
              {t('print.filler', { count: summary.fillerCount })}
            </p>
          )}

          {/*
            The one choice left in the job. It changes the sticker sheet above
            it — one side or two — so the badges move as it is made.
          */}
          <h3 className="print-section">{t('print.numbers.title')}</h3>
          <div className="numgrid">
            {NUMBER_SIDES.map((side) => (
              <button
                key={side}
                type="button"
                className="numcard"
                aria-pressed={numbers === side}
                onClick={() => setNumbers(side)}
              >
                <NumberSideGlyph side={side} accent={accent} />
                <strong>{t(`print.numbers.${side}`)}</strong>
                <span className="numcard__hint">{t(`print.numbers.${side}Hint`)}</span>
              </button>
            ))}
          </div>

          <h3 className="print-section">{t('print.howToTitle')}</h3>
          <ol className="steps">
            <li>{t('print.step.scale')}</li>
            <li>{t('print.step.paper', { sheet: summary.sheetPaper })}</li>
            <li>{t('print.step.duplex')}</li>
            {numbers === 'backing' && <li>{t('print.step.stickerBacks')}</li>}
            <li>{t('print.step.fold')}</li>
            <li>{t('print.step.check')}</li>
          </ol>

          <h3 className="print-section">{t('print.shopTitle')}</h3>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            {t('print.noticeLead')}
          </p>
          <div className="print-actions">
            <a className="btn btn--primary" style={{ background: accent }} href={noticePath(token, opts)} target="_blank" rel="noreferrer">
              📄 {t('print.openNotice')}
            </a>
            <button
              type="button"
              className="btn"
              onClick={() => void copy('link', `${window.location.origin}${noticePath(token, opts)}`)}
            >
              🔗 {copied === 'link' ? t('editor.linkCopied') : t('print.copyLink')}
            </button>
          </div>

          <p className="hint" style={{ margin: '16px 0 0' }}>
            {t('print.shopHint')}
          </p>
          <pre className="shop-note">{shopNote}</pre>
          <button type="button" className="btn" onClick={() => void copy('note', shopNote)}>
            📋 {copied === 'note' ? t('print.shop.copied') : t('print.shop.copy')}
          </button>
        </>
      )}
    </Dialog>
  );
}
