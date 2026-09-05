/**
 * Routing. Six screens is still not worth a router library: the home page, an
 * album at /a/<secret token> with its print-shop sheet one level below, the
 * child's passport at /me, and the two ways a code arrives — /join/<code> from
 * their own other device, /i/<code> from a friend.
 *
 * The code routes exist as real URLs because that is what makes the QR work
 * with nothing but the other device's camera app: scanning it opens a link,
 * and the link is this.
 */

import { useEffect, useState } from 'react';
import { Editor } from './screens/Editor.tsx';
import { Home } from './screens/Home.tsx';
import { Join } from './screens/Join.tsx';
import { Passport } from './screens/Passport.tsx';
import { PrintNotice } from './screens/PrintNotice.tsx';

type Route =
  | { view: 'editor' | 'print'; token: string }
  | { view: 'passport' }
  | { view: 'pairing' | 'invite'; code: string };

const routeFromPath = (path: string): Route | null => {
  const album = /^\/a\/([^/?#]+)(\/print)?/.exec(path);
  if (album) return { view: album[2] ? 'print' : 'editor', token: decodeURIComponent(album[1]!) };

  if (/^\/me\/?$/.test(path)) return { view: 'passport' };

  const join = /^\/join\/([^/?#]*)/.exec(path);
  if (join) return { view: 'pairing', code: decodeURIComponent(join[1] ?? '') };

  const invite = /^\/i\/([^/?#]*)/.exec(path);
  if (invite) return { view: 'invite', code: decodeURIComponent(invite[1] ?? '') };

  return null;
};

export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next: string) => {
    window.history.pushState({}, '', next);
    setPath(next);
  };

  const openAlbum = (token: string) => go(`/a/${encodeURIComponent(token)}`);
  const route = routeFromPath(path);

  if (!route) return <Home onOpen={openAlbum} onPassport={() => go('/me')} />;

  switch (route.view) {
    case 'passport':
      return <Passport onHome={() => go('/')} onOpenAlbum={openAlbum} />;
    case 'pairing':
    case 'invite':
      return (
        <Join
          kind={route.view === 'invite' ? 'invite' : 'pairing'}
          code={route.code}
          onHome={() => go('/')}
          onOpenAlbum={openAlbum}
        />
      );
    case 'print':
      return <PrintNotice token={route.token} onBack={() => openAlbum(route.token)} />;
    default:
      return <Editor token={route.token} onHome={() => go('/')} />;
  }
}
