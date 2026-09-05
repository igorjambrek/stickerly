/**
 * Finding a picture by saying what you want.
 *
 * The third way into a slot, beside the drag and the camera, and the only one
 * that works when the child wants a lion and nobody in the family has ever
 * photographed one. Press the microphone, say `лав`, pick one off the shelf.
 *
 * The typed box is not a fallback bolted on for browsers without a microphone,
 * although it serves as one. A child who is being listened to by a machine
 * should always be able to stop and type instead, and one sitting in a noisy
 * classroom will want to.
 *
 * Thumbnails are loaded straight from whoever is hosting them, with the referrer
 * turned off: this component is rendered at `/a/<token>`, and that token is the
 * album's only secret. Browsers trim the path from a cross-origin referrer by
 * default, but "by default" is not where a secret belongs.
 */

import { useCallback, useState } from 'react';
import type { Lang, PictureHit } from '@album/shared';
import { MAX_QUERY, cleanQuery } from '@album/shared';
import { api } from '../api.ts';
import { useT } from '../lang.ts';
import { useVoice } from '../voice.ts';

export interface PictureSearchProps {
  token: string;
  lang: Lang;
  /** A cover picture is kept at a higher resolution than a sticker. */
  role?: 'sticker' | 'cover';
  onPicked: (image: { id: string; w: number; h: number }) => void;
  onBack: () => void;
}

export function PictureSearch({ token, lang, role = 'sticker', onPicked, onBack }: PictureSearchProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PictureHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(
    async (raw: string) => {
      const q = cleanQuery(raw);
      if (!q) return;
      setSearching(true);
      setFailure(null);
      try {
        const found = await api.searchPictures(token, q, lang);
        setResults(found.results);
      } catch (error) {
        setFailure((error as Error).message);
        setResults(null);
      } finally {
        setSearching(false);
      }
    },
    [token, lang],
  );

  // A finished sentence goes straight into a search: a child who has just said
  // `лав` out loud has already asked, and a "now press search" step reads as
  // the machine not having listened.
  const voice = useVoice(lang, (heard) => {
    setQuery(heard);
    void run(heard);
  });

  async function take(hit: PictureHit) {
    setTaking(hit.id);
    setFailure(null);
    try {
      onPicked(await api.addPicture(token, hit.pick, role));
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setTaking(null);
    }
  }

  const busy = searching || taking !== null;
  // The recogniser says `denied`, `nothing` or `failed`; which sentence a child
  // reads for each of those is i18n's business, not the microphone's.
  const message = voice.error && `pictures.error.${voice.error}`;

  return (
    <div className="picsearch">
      <div className="picsearch__ask">
        {voice.supported && (
          <button
            type="button"
            className={`picsearch__mic${voice.listening ? ' picsearch__mic--on' : ''}`}
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
            aria-label={voice.listening ? t('pictures.stop') : t('pictures.listen')}
            aria-pressed={voice.listening}
            disabled={busy}
          >
            {voice.listening ? '🔴' : '🎤'}
          </button>
        )}

        <input
          className="field picsearch__field"
          value={voice.listening && voice.heard ? voice.heard : query}
          placeholder={voice.listening ? t('pictures.listening') : t('pictures.placeholder')}
          aria-label={t('pictures.say')}
          maxLength={MAX_QUERY}
          disabled={voice.listening}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void run(query);
          }}
        />

        <button
          type="button"
          className="btn btn--primary picsearch__go"
          onClick={() => void run(query)}
          disabled={busy || voice.listening || !cleanQuery(query)}
        >
          {searching ? t('pictures.searching') : t('pictures.go')}
        </button>
      </div>

      {message && <p className="picsearch__note">{t(message)}</p>}
      {!voice.supported && !message && <p className="picsearch__note">{t('pictures.noVoice')}</p>}
      {failure && <p className="picsearch__note picsearch__note--bad">{failure}</p>}

      {results && results.length === 0 && !searching && (
        <p className="picsearch__note">{t('pictures.empty')}</p>
      )}

      {results && results.length > 0 && (
        <ul className="picsearch__grid">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className={`picsearch__hit${taking === hit.id ? ' picsearch__hit--taking' : ''}`}
                onClick={() => void take(hit)}
                disabled={busy}
                title={`${hit.title}${hit.source ? ` — ${hit.source}` : ''}`}
              >
                <img
                  src={hit.thumbUrl}
                  alt={hit.title || t('pictures.use')}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
                <span className="picsearch__credit">
                  {/* Where it came from, and whether it may be reused. An empty
                      licence is not silence: it means nobody promised. */}
                  {hit.licence || t('pictures.unknownLicence')}
                  {hit.source && <span className="picsearch__source">{hit.source}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {taking && <p className="picsearch__note">{t('pictures.adding')}</p>}

      <button type="button" className="btn btn--ghost picsearch__back" onClick={onBack} disabled={busy}>
        ← {t('pictures.back')}
      </button>
    </div>
  );
}
