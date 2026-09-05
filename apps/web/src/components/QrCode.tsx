/**
 * A QR code, drawn as SVG.
 *
 * This app never reads a QR — the other device's own camera app does that, and
 * the code holds an ordinary link so opening it is all that has to happen. All
 * that is needed here is the drawing, which is a solved problem and not one to
 * hand-roll.
 *
 * SVG rather than a canvas or a data URL so it stays crisp on a tablet held up
 * to a phone at whatever angle a child manages, and so the quiet zone and the
 * colours come from the page rather than from a bitmap.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        // The formatted code underneath is the fallback: it is the same secret,
        // and a child can always type it.
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!svg) return <div className={className} aria-hidden />;
  // The markup comes from the encoder, not from anything a user supplied.
  return <div className={className} role="img" dangerouslySetInnerHTML={{ __html: svg }} />;
}
