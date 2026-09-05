/**
 * The sheet you show at the copy shop.
 *
 * Same three files as the print dialog, but on a page of its own at
 * /a/<token>/print: readable at arm's length on a phone, with the paper for
 * each file said in colour, the two settings that get printing wrong said
 * first, and the whole thing repeated as text that can be pasted into a
 * message to whoever is doing the printing.
 */

import { useEffect, useState } from 'react';
import type { Album } from '@album/shared';
import { getTemplate, printShopNote } from '@album/shared';
import { api, type PrintSummary } from '../api.ts';
import { useLangStore, useT } from '../lang.ts';
import { PART_LOOK, printParts } from '../printing.ts';

export function PrintNotice({ token, onBack }: { token: string; onBack: () => void }) {
  const t = useT();
  const setUiLang = useLangStore((s) => s.setLang);
  const [album, setAlbum] = useState<Album | null>(null);
  const [summary, setSummary] = useState<PrintSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.getAlbum(token), api.printSummary(token)])
      .then(([a, s]) => {
        if (!live) return;
        setAlbum(a);
        setSummary(s);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [token]);

  // The album decides the language here too: the note is for a shop near the
  // child, not near whichever browser opened the link.
  useEffect(() => {
    if (album) setUiLang(album.lang);
  }, [album, setUiLang]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (failed) {
    return (
      <div className="notice">
        <p style={{ color: 'var(--danger)' }}>{t('print.error')}</p>
        <button type="button" className="btn" onClick={onBack}>
          ← {t('print.noticeBack')}
        </button>
      </div>
    );
  }

  if (!album || !summary) {
    return (
      <div className="notice">
        <p style={{ color: 'var(--muted)' }}>{t('print.making')}</p>
      </div>
    );
  }

  const parts = printParts(t, summary, album.title);
  const shopNote = printShopNote(t, parts);
  const accent = getTemplate(album.templateId).palette.badge;

  const copyNote = async () => {
    const ok = await navigator.clipboard
      ?.writeText(shopNote)
      .then(() => true)
      .catch(() => false);
    if (ok) setCopied(true);
  };

  return (
    <div className="notice" style={{ ['--accent' as string]: accent }}>
      <header className="notice__bar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← {t('print.noticeBack')}
        </button>
      </header>

      <h1 className="notice__title">{t('print.noticeTitle')}</h1>
      <p className="notice__lead">{t('print.noticeLead')}</p>
      <p className="notice__album">
        <strong>{album.title}</strong> · {t('editor.albumFormat', { paper: summary.sheetPaper, n: summary.slotsPerPage })}
      </p>

      {/* The one thing that ruins a print run, before anything else. */}
      <p className="notice__rule">{t('print.shop.intro')}</p>

      <h2 className="notice__section">{t('print.noticeFiles')}</h2>
      {parts.map((info) => (
        <div className="print-row" key={info.part}>
          <span style={{ fontSize: 30 }} aria-hidden="true">
            {PART_LOOK[info.part].icon}
          </span>
          <span className="print-row__text">
            <strong>{t(`print.${info.part}`)}</strong>
            <span className={`paper-chip paper-chip--${PART_LOOK[info.part].chip}`}>{info.paper}</span>
            <span className="print-row__hint">
              {info.sheetsLine} · {info.file}
            </span>
          </span>
          <a
            className="btn btn--primary"
            style={{ background: accent }}
            href={api.printUrl(token, info.part)}
            download={info.file}
          >
            {t('print.download')}
          </a>
        </div>
      ))}

      <h2 className="notice__section">{t('print.noticeFinish')}</h2>
      <p className="notice__body">{t('print.shop.finish')}</p>
      <p className="notice__body">{t('print.step.check')}</p>

      <h2 className="notice__section">{t('print.noticeNote')}</h2>
      <pre className="shop-note">{shopNote}</pre>
      <button type="button" className="btn" onClick={copyNote}>
        📋 {copied ? t('print.shop.copied') : t('print.shop.copy')}
      </button>
    </div>
  );
}
