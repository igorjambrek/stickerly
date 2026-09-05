/**
 * What this server can do.
 *
 * One question, asked once per page load and remembered, because the answer
 * cannot change while somebody is looking at it: picture search depends on how
 * the deployment was configured, not on the album or the child.
 *
 * It defaults to "no" until the answer arrives, so a door that opens onto
 * nothing is never drawn — the wrong way round would be a button that a child
 * presses and that then apologises.
 */

import { useEffect, useState } from 'react';
import type { Features } from '@album/shared';
import { api } from './api.ts';

const NONE: Features = { pictureSearch: false };

let asked: Promise<Features> | null = null;

/** A server that cannot answer is a server without the extras. */
const ask = (): Promise<Features> => (asked ??= api.features().catch(() => NONE));

export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(NONE);

  useEffect(() => {
    let alive = true;
    void ask().then((answer) => alive && setFeatures(answer));
    return () => {
      alive = false;
    };
  }, []);

  return features;
}
