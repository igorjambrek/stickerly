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
 *
 * Loading them here is also the only place their being loadable can be found
 * out. The server picks the most reliable thumbnail it can name, but it cannot
 * try them without fetching twenty pictures before it answers, and a provider
 * that hands out a dead one is not rare enough to leave to chance. So a tile
 * whose picture does not arrive removes itself from the shelf: a child choosing
 * between eleven photographs is not owed the nine that were never going to
 * paint, and a grey broken square reads as the app being broken.
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
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  // What the pictures were actually found by, when that is not what was asked.
  const [foundAs, setFoundAs] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(
    async (raw: string) => {
      const q = cleanQuery(raw);
      if (!q) return;
      setSearching(true);
      setFailure(null);
      setBroken(new Set());
      try {
        const found = await api.searchPictures(token, q, lang);
        setResults(found.results);
        // A name said in Serbian is spelled in Serbian, and the pictures are
        // labelled in English, so the server may have looked for something
        // else. Saying which is the difference between a search that
        // understood the child and one that quietly did its own thing.
        setFoundAs(found.query.toLowerCase() === q.toLowerCase() ? null : found.query);
      } catch (error) {
        setFailure((error as Error).message);
        setResults(null);
        setFoundAs(null);
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

  // What the child actually gets to choose between: everything found, less
  // whatever would not load.
  const shelf = results?.filter((hit) => !broken.has(hit.id)) ?? null;
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

      {foundAs && !searching && <p className="picsearch__note">{t('pictures.foundAs', { name: foundAs })}</p>}
      {message && <p className="picsearch__note">{t(message)}</p>}
      {!voice.supported && !message && <p className="picsearch__note">{t('pictures.noVoice')}</p>}
      {failure && <p className="picsearch__note picsearch__note--bad">{failure}</p>}

      {results && results.length === 0 && !searching && (
        <p className="picsearch__note">{t('pictures.empty')}</p>
      )}

      {/* Found something, and not one of them would paint. Saying "nothing for
          that word" here would be a lie, and would send the child looking for a
          different word when the word was never the problem. */}
      {results && results.length > 0 && shelf!.length === 0 && !searching && (
        <p className="picsearch__note">{t('pictures.unshowable')}</p>
      )}

      {shelf && shelf.length > 0 && (
        <ul className="picsearch__grid">
          {shelf.map((hit) => (
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
                  // The address behind this picture is deliberately not here to
                  // retry with, so there is nothing to do but stand down.
                  onError={() => setBroken((was) => new Set(was).add(hit.id))}
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
