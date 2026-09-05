import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LANGS } from '../src/types.ts';
import { AVATARS, getAvatar } from '../src/avatars.ts';
import { ADJECTIVES, makeNickname, pickNicknameIds } from '../src/nicknames.ts';
import { CODE_ALPHABET, CODE_LENGTH, formatCode, isCode, normaliseCode } from '../src/codes.ts';

describe('avatars', () => {
  it('has a unique id for every avatar', () => {
    assert.equal(new Set(AVATARS.map((a) => a.id)).size, AVATARS.length);
  });

  it('names every avatar in every language', () => {
    for (const avatar of AVATARS) {
      for (const lang of LANGS) {
        const name = avatar.name[lang];
        assert.ok(name?.word, `${avatar.id} has no name in ${lang}`);
        assert.match(name.gender, /^[mfn]$/, `${avatar.id} has no gender in ${lang}`);
      }
    }
  });

  it('falls back to a real avatar for an unknown id', () => {
    assert.equal(getAvatar('no-such-animal').id, 'lion');
    assert.equal(getAvatar(null).id, 'lion');
  });
});

describe('makeNickname', () => {
  /**
   * The loop that earns its keep: a missing translation or a missing gender
   * form is invisible in review and shows up as a half-blank name on a child's
   * passport.
   */
  it('produces two real words for every combination', () => {
    for (const avatar of AVATARS) {
      for (const adjective of ADJECTIVES) {
        for (const lang of LANGS) {
          const nickname = makeNickname(lang, avatar.id, adjective.id);
          const words = nickname.split(' ');
          assert.equal(words.length, 2, `${nickname} (${lang}) is not two words`);
          assert.ok(words.every((w) => w.length > 1), `${nickname} (${lang}) has a stub word`);
        }
      }
    }
  });

  it('agrees with the noun gender in Serbian and Russian', () => {
    // лав is masculine, ракета feminine, сунце neuter.
    assert.equal(makeNickname('sr-Cyrl', 'lion', 'fast'), 'Брзи Лав');
    assert.equal(makeNickname('sr-Cyrl', 'rocket', 'fast'), 'Брза Ракета');
    assert.equal(makeNickname('sr-Cyrl', 'sun', 'fast'), 'Брзо Сунце');

    assert.equal(makeNickname('sr-Latn', 'rocket', 'fast'), 'Brza Raketa');

    assert.equal(makeNickname('ru', 'lion', 'fast'), 'Быстрый Лев');
    assert.equal(makeNickname('ru', 'rocket', 'fast'), 'Быстрая Ракета');
    assert.equal(makeNickname('ru', 'sun', 'fast'), 'Быстрое Солнце');
  });

  it('follows a noun whose gender differs between languages', () => {
    // облак is masculine in Serbian, облако neuter in Russian.
    assert.equal(makeNickname('sr-Cyrl', 'cloud', 'quiet'), 'Тихи Облак');
    assert.equal(makeNickname('ru', 'cloud', 'quiet'), 'Тихое Облако');
  });

  it('does not inflect in English', () => {
    assert.equal(makeNickname('en', 'lion', 'fast'), 'Fast Lion');
    assert.equal(makeNickname('en', 'rocket', 'fast'), 'Fast Rocket');
    assert.equal(makeNickname('en', 'sun', 'fast'), 'Fast Sun');
  });

  it('still names a child when the ids are nonsense', () => {
    assert.ok(makeNickname('en', 'gremlin', 'sparkly').includes('Lion'));
  });
});

describe('pickNicknameIds', () => {
  it('only ever returns ids that exist', () => {
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const { avatarId, adjectiveId } = pickNicknameIds((bound) => (n++ * 7) % bound);
      assert.ok(AVATARS.some((a) => a.id === avatarId));
      assert.ok(ADJECTIVES.some((a) => a.id === adjectiveId));
    }
  });
});

describe('codes', () => {
  it('leaves out every character that can be misread', () => {
    for (const c of '01ILOU') assert.ok(!CODE_ALPHABET.includes(c), `${c} is still in the alphabet`);
  });

  it('accepts a code however a child types it', () => {
    for (const typed of ['ab3-k9p', 'AB3K9P', 'ab3 k9p', 'AB3-K9P']) {
      assert.equal(normaliseCode(typed), 'AB3K9P');
      assert.ok(isCode(normaliseCode(typed)));
    }
  });

  it('rejects a code that is the wrong length or holds a look-alike', () => {
    assert.ok(!isCode('AB3K9'));
    assert.ok(!isCode('AB3K9PQ'));
    assert.ok(!isCode('AB3K9O'), 'O is not in the alphabet, so it cannot be a valid code');
    assert.ok(!isCode(normaliseCode('ab3-k9!')));
  });

  it('shows a code in two halves', () => {
    assert.equal(formatCode('AB3K9P'), 'AB3-K9P');
    assert.equal(formatCode('AB3K9P').replace('-', '').length, CODE_LENGTH);
  });
});
