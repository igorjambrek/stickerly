/**
 * Who is in the album right now.
 *
 * The roster is who has ever joined; presence is who has the album open at this
 * moment. They are drawn as one thing, because that is how a child reads them:
 * the same row of faces, with the ones who are here lit up.
 *
 * This browser's own connection is left out of the lighting, so a lit face
 * always means *somebody else* is in your album — an album with one child in it
 * stays quiet, which is the only way the signal means anything.
 *
 * A guest is a child who followed the link without a passport. They have no
 * face and no name to show, and they are as entitled to be here as anyone, so
 * they are counted rather than named.
 */

import type { AlbumMember, LivePeer } from '@album/shared';
import { getAvatar } from '@album/shared';
import { useT } from '../lang.ts';

/** Beyond this many nameless guests, the row says how many rather than showing them. */
const GUEST_FACES = 3;

interface PresenceProps {
  members: AlbumMember[];
  peers: LivePeer[];
  /** This screen's own connection, so it can be told apart from everybody else's. */
  socketId: string | null;
  /** The phone's menu has room for names; the top bar only has room for faces. */
  withNames?: boolean;
  /** Where the row sits, when the caller has an opinion about that. */
  className?: string;
}

export function Presence({ members, peers, socketId, withNames = false, className }: PresenceProps) {
  const t = useT();

  const others = peers.filter((p) => p.id !== socketId);
  const here = new Set(others.map((p) => p.person?.id).filter((id): id is string => Boolean(id)));
  const guests = others.filter((p) => !p.person).length;

  if (members.length === 0 && guests === 0) return null;

  const hereNames = [
    ...members.filter((m) => here.has(m.id)).map((m) => m.nickname),
    ...Array.from({ length: guests }, () => t('editor.guest')),
  ];
  const title = hereNames.length
    ? `${t('editor.hereNow')}: ${hereNames.join(', ')}`
    : members.map((m) => m.nickname).join(', ');

  const face = (key: string, emoji: string, live: boolean, name?: string) =>
    withNames ? (
      <span key={key} className="members__one">
        <span className="members__face" data-live={live}>
          {emoji}
        </span>
        {name}
      </span>
    ) : (
      <span key={key} className="members__face" data-live={live}>
        {emoji}
      </span>
    );

  return (
    <span className={className ? `members ${className}` : 'members'} title={title}>
      {members.map((m) => face(m.id, getAvatar(m.avatar).emoji, here.has(m.id), m.nickname))}

      {Array.from({ length: Math.min(guests, GUEST_FACES) }, (_, i) =>
        face(`guest-${i}`, '👤', true, t('editor.guest')),
      )}
      {guests > GUEST_FACES && <span className="members__more">+{guests - GUEST_FACES}</span>}
    </span>
  );
}
