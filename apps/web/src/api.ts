import type { Album, AlbumSize, Crop, Lang, Person } from '@album/shared';
import { readDeviceKey } from './deviceKey.ts';

export interface PrintSummary {
  stickerCount: number;
  pageCount: number;
  fillerCount: number;
  coverSheets: number;
  pageSheets: number;
  stickerSheets: number;
  /** 'A3' or 'A4' — what the cover and pages must be printed on. */
  sheetPaper: string;
  /** Always 'A4': sticker sheets do not grow with the album. */
  stickerPaper: string;
  size: AlbumSize;
  slotsPerPage: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * One place adds the passport, so every call carries it and none of them has to
 * remember to. It is a header rather than a cookie because the browser must not
 * attach it on its own — an `<img src>` or a link someone else wrote should
 * never be able to act as this child.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const deviceKey = readDeviceKey();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...(deviceKey ? { 'x-nalepko-device': deviceKey } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Every mutation returns the whole album, so the editor never merges partial state. */
type AlbumResponse = { album: Album };

const albumBase = (token: string) => `/api/albums/${encodeURIComponent(token)}`;

export interface CreateAlbumInput {
  templateId: string;
  coverVariantId: string;
  size: AlbumSize;
  slotsPerPage: number;
  title: string;
  ownerName: string;
  lang: Lang;
}

export interface Passport {
  person: Person;
  /** Handed over once. It lives in localStorage from here on. */
  deviceKey: string;
}

/** Enough to draw an album card and open it, without loading the album. */
export interface AlbumCard {
  editToken: string;
  title: string;
  templateId: string;
  coverVariantId: string;
  role: 'owner' | 'editor';
  updatedAt: string;
}

export interface MeResponse {
  person: Person;
  albums: AlbumCard[];
}

export interface MintedCode {
  code: string;
  expiresAt: string;
}

export interface CoverPatch {
  coverVariantId?: string;
  coverImageId?: string | null;
  coverCrop?: Crop;
}

export const api = {
  createAlbum: (input: CreateAlbumInput) =>
    request<{ id: string; editToken: string; album: Album }>('/api/albums', jsonBody('POST', input)),

  getAlbum: (token: string) => request<AlbumResponse>(albumBase(token)).then((r) => r.album),

  updateAlbum: (token: string, patch: { title?: string; ownerName?: string; lang?: Lang }) =>
    request<AlbumResponse>(albumBase(token), jsonBody('PATCH', patch)).then((r) => r.album),

  deleteAlbum: (token: string) => request<{ ok: true }>(albumBase(token), { method: 'DELETE' }).then(() => undefined),

  setCover: (token: string, patch: CoverPatch) =>
    request<AlbumResponse>(`${albumBase(token)}/cover`, jsonBody('PUT', patch)).then((r) => r.album),

  addPage: (token: string) =>
    request<AlbumResponse>(`${albumBase(token)}/pages`, { method: 'POST' }).then((r) => r.album),

  deletePage: (token: string, pageId: string) =>
    request<AlbumResponse>(`${albumBase(token)}/pages/${pageId}`, { method: 'DELETE' }).then((r) => r.album),

  updatePage: (token: string, pageId: string, patch: { title?: string; position?: number }) =>
    request<AlbumResponse>(`${albumBase(token)}/pages/${pageId}`, jsonBody('PATCH', patch)).then((r) => r.album),

  setSlot: (token: string, slotId: string, patch: { label?: string; imageId?: string | null; crop?: Crop }) =>
    request<AlbumResponse>(`${albumBase(token)}/slots/${slotId}`, jsonBody('PUT', patch)).then((r) => r.album),

  swapSlots: (token: string, slotId: string, withId: string) =>
    request<AlbumResponse>(`${albumBase(token)}/slots/${slotId}/swap`, jsonBody('POST', { withId })).then((r) => r.album),

  /** `role` decides how big a derivative is kept: a cover fills a whole page. */
  async uploadImage(token: string, file: File, role: 'sticker' | 'cover' = 'sticker'): Promise<{ id: string; w: number; h: number }> {
    const form = new FormData();
    form.append('file', file);
    const res = await request<{ image: { id: string; w: number; h: number } }>(
      `${albumBase(token)}/images${role === 'cover' ? '?role=cover' : ''}`,
      { method: 'POST', body: form },
    );
    return res.image;
  },

  imageUrl: (token: string, imageId: string, size?: 'thumb') =>
    `${albumBase(token)}/images/${imageId}${size ? `?size=${size}` : ''}`,

  printSummary: (token: string) => request<PrintSummary>(`${albumBase(token)}/print/summary`),

  printUrl: (token: string, part: 'cover' | 'pages' | 'stickers') => `${albumBase(token)}/print/${part}.pdf`,

  /** A passport. Nothing here needs one to already exist except `me`. */
  createPerson: (input: { nickname?: string; avatar?: string; lang: Lang }) =>
    request<Passport>('/api/people', jsonBody('POST', input)),

  me: () => request<MeResponse>('/api/me'),

  updateMe: (patch: { nickname?: string; avatar?: string; lang: Lang }) =>
    request<{ person: Person }>('/api/me', jsonBody('PATCH', patch)),

  claimAlbums: (tokens: string[]) =>
    request<MeResponse & { claimed: number }>('/api/me/albums/claim', jsonBody('POST', { tokens })),

  /** Device A mints, device B claims. Both halves of "add another device". */
  createPairing: () => request<MintedCode>('/api/me/pairings', { method: 'POST' }),

  claimPairing: (code: string) =>
    request<Passport>(`/api/pairings/${encodeURIComponent(code)}/claim`, { method: 'POST' }),

  createInvite: (token: string) => request<MintedCode>(`${albumBase(token)}/invites`, { method: 'POST' }),

  claimInvite: (code: string) =>
    request<{ album: Album; editToken: string }>(`/api/invites/${encodeURIComponent(code)}/claim`, {
      method: 'POST',
    }),
};
