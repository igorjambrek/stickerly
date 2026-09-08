import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { betterPictureUrl, unwrapSearchLink, widestInSrcset } from '../src/drops.ts';

/** The shape a browser puts an `<img>` in when one is dragged out of a page. */
const img = (attrs: string) => `<img ${attrs}>`;

describe('unwrapping a search result link', () => {
  it('reads the original out of a Google Images result', () => {
    const link =
      'https://www.google.com/imgres?q=lav&imgurl=https%3A%2F%2Fphotos.example%2Flion-4000px.jpg' +
      '&imgrefurl=https%3A%2F%2Fphotos.example%2Fpost&docid=abc';
    assert.equal(unwrapSearchLink(link), 'https://photos.example/lion-4000px.jpg');
  });

  it('follows Google to whichever country it answered from', () => {
    for (const host of ['www.google.com', 'www.google.rs', 'www.google.co.uk', 'images.google.de']) {
      assert.equal(
        unwrapSearchLink(`https://${host}/imgres?imgurl=https%3A%2F%2Fa.example%2Fb.jpg`),
        'https://a.example/b.jpg',
        host,
      );
    }
  });

  it('reads Bing, DuckDuckGo and Yandex, which each name the parameter differently', () => {
    assert.equal(
      unwrapSearchLink('https://www.bing.com/images/search?view=detailV2&mediaurl=https%3A%2F%2Fa.example%2Fb.jpg'),
      'https://a.example/b.jpg',
    );
    assert.equal(
      unwrapSearchLink('https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fa.example%2Fb.jpg&f=1'),
      'https://a.example/b.jpg',
    );
    assert.equal(
      unwrapSearchLink('https://yandex.ru/images/search?img_url=https%3A%2F%2Fa.example%2Fb.jpg'),
      'https://a.example/b.jpg',
    );
  });

  it('says nothing about an ordinary link, which is most of them', () => {
    assert.equal(unwrapSearchLink('https://photos.example/some/page'), undefined);
    assert.equal(unwrapSearchLink('https://www.google.com/search?q=lav'), undefined);
    assert.equal(unwrapSearchLink('not a url at all'), undefined);
  });

  it('refuses an original we would not be allowed to fetch anyway', () => {
    // http, and a `file:` smuggled through the parameter: `remotefetch` would
    // turn both away, and there is no sense making the round trip to hear it.
    assert.equal(unwrapSearchLink('https://www.google.com/imgres?imgurl=http%3A%2F%2Fa.example%2Fb.jpg'), undefined);
    assert.equal(unwrapSearchLink('https://www.google.com/imgres?imgurl=file%3A%2F%2F%2Fetc%2Fpasswd'), undefined);
    assert.equal(unwrapSearchLink('https://www.google.com/imgres?imgurl=javascript%3Aalert(1)'), undefined);
  });

  it('is not fooled by a host that merely ends in one of the names', () => {
    assert.equal(
      unwrapSearchLink('https://notgoogle.com/imgres?imgurl=https%3A%2F%2Fa.example%2Fb.jpg'),
      undefined,
    );
    assert.equal(
      unwrapSearchLink('https://google.com.evil.example/imgres?imgurl=https%3A%2F%2Fa.example%2Fb.jpg'),
      undefined,
    );
  });
});

describe('picking the biggest picture a srcset offers', () => {
  it('reads width descriptors and takes the widest', () => {
    assert.equal(
      widestInSrcset('https://a.example/s.jpg 320w, https://a.example/l.jpg 2000w, https://a.example/m.jpg 800w'),
      'https://a.example/l.jpg',
    );
  });

  it('reads density descriptors the same way', () => {
    assert.equal(
      widestInSrcset('https://a.example/1x.jpg, https://a.example/3x.jpg 3x, https://a.example/2x.jpg 2x'),
      'https://a.example/3x.jpg',
    );
  });

  it('splits on the comma that separates candidates, not the ones inside a URL', () => {
    const srcset = 'https://a.example/i.jpg?crop=1,2,3,4 400w, https://a.example/big.jpg?crop=1,2,3,4 1600w';
    assert.equal(widestInSrcset(srcset), 'https://a.example/big.jpg?crop=1,2,3,4');
  });

  it('drops candidates it could never fetch, and keeps the best of the rest', () => {
    // The widest is relative and the next is http; neither can be gone and got,
    // so the answer is the biggest *usable* one rather than nothing at all.
    const srcset = '/local/huge.jpg 4000w, http://a.example/big.jpg 2000w, https://a.example/ok.jpg 1200w';
    assert.equal(widestInSrcset(srcset), 'https://a.example/ok.jpg');
  });

  it('has nothing to say about an empty or unusable set', () => {
    assert.equal(widestInSrcset(''), undefined);
    assert.equal(widestInSrcset('/only/relative.jpg 900w'), undefined);
  });
});

describe('what a drop is really pointing at', () => {
  it('prefers the original named by the link over the thumbnail in hand', () => {
    // The case this whole module exists for: a child drags a result out of
    // Google Images, and the file the browser gives is the 300px thumbnail.
    const uriList = 'https://www.google.com/imgres?imgurl=https%3A%2F%2Fphotos.example%2Flion.jpg&docid=x';
    const html = img('src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ" width="275" height="183"');
    assert.equal(betterPictureUrl(uriList, html), 'https://photos.example/lion.jpg');
  });

  it('falls back to the biggest copy the page itself offers', () => {
    const html = img(
      'src="https://a.example/small.jpg" srcset="https://a.example/small.jpg 400w, https://a.example/huge.jpg 2400w"',
    );
    assert.equal(betterPictureUrl('https://a.example/article', html), 'https://a.example/huge.jpg');
  });

  it('says nothing when the page is already showing the biggest it has', () => {
    // Nothing to improve on means "upload the file you were given", not a
    // failure — and it saves a round trip to arrive back where we started.
    const html = img('src="https://a.example/photo.jpg" srcset="https://a.example/photo.jpg 1200w"');
    assert.equal(betterPictureUrl('https://a.example/photo.jpg', html), undefined);
  });

  it('says nothing for a plain drag off a page, or off the desktop', () => {
    assert.equal(betterPictureUrl('https://a.example/photo.jpg', img('src="https://a.example/photo.jpg"')), undefined);
    assert.equal(betterPictureUrl('', ''), undefined);
  });

  it('ignores the comment lines a uri-list is allowed to carry', () => {
    const uriList = '# dragged from a browser\r\nhttps://www.google.com/imgres?imgurl=https%3A%2F%2Fa.example%2Fb.jpg';
    assert.equal(betterPictureUrl(uriList, ''), 'https://a.example/b.jpg');
  });

  it('reads single-quoted markup, which some browsers write', () => {
    const html = "<img src='https://a.example/s.jpg' srcset='https://a.example/big.jpg 1800w'>";
    assert.equal(betterPictureUrl('', html), 'https://a.example/big.jpg');
  });

  it('never answers with anything but an https address', () => {
    // Everything this returns is handed to a route that will go and fetch it,
    // so the one property that must hold is that it is fetchable at all.
    const cases: [string, string][] = [
      ['https://www.google.com/imgres?imgurl=http%3A%2F%2Fa.example%2Fb.jpg', ''],
      ['', img('src="https://a.example/s.jpg" srcset="data:image/png;base64,AAAA 900w"')],
      ['', img('src="https://a.example/s.jpg" srcset="//a.example/protocol-relative.jpg 900w"')],
    ];
    for (const [uriList, html] of cases) {
      const answer = betterPictureUrl(uriList, html);
      assert.ok(answer === undefined || answer.startsWith('https://'), `${uriList} ${html}`);
    }
  });
});
