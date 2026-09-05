/** Unit conversions. Every length in this project is expressed in millimetres. */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

/** Millimetres -> PDF points (1/72 inch). */
export const mmToPt = (mm: number): number => (mm * PT_PER_INCH) / MM_PER_INCH;

/** PDF points -> millimetres. */
export const ptToMm = (pt: number): number => (pt * MM_PER_INCH) / PT_PER_INCH;

/** Millimetres -> raster pixels at a given DPI. */
export const mmToPx = (mm: number, dpi: number): number => Math.round((mm * dpi) / MM_PER_INCH);

/** Print resolution used for image derivatives. */
export const PRINT_DPI = 300;
