/**
 * Serbian Latin, respelled in Cyrillic.
 *
 * The one thing worth a table rather than an example: digraphs, and the case
 * of the single Cyrillic glyph that stands for one. Everything else is a
 * one-to-one letter swap.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCyrillic } from '../src/transliterate.ts';

describe('respelling Serbian Latin as Cyrillic', () => {
  it('spells the word this whole feature exists for', () => {
    // The example from entities.ts: Latin ranks a singer above the animal,
    // Cyrillic does not — and this is the function that makes the query
    // Cyrillic before it is asked.
    assert.equal(toCyrillic('lav'), 'лав');
  });

  it('reads a digraph as one letter, not two', () => {
    assert.equal(toCyrillic('njegov'), 'његов');
    assert.equal(toCyrillic('ljubav'), 'љубав');
    assert.equal(toCyrillic('džak'), 'џак');
  });

  it('gives a title-case digraph the one capital Cyrillic has for it', () => {
    assert.equal(toCyrillic('Njegoš'), 'Његош');
    assert.equal(toCyrillic('NJEGOŠ'), 'ЊЕГОШ');
    assert.equal(toCyrillic('Džak'), 'Џак');
  });

  it('carries diacritics that are their own letters, not accents', () => {
    assert.equal(toCyrillic('Đorđe'), 'Ђорђе');
    assert.equal(toCyrillic('čačak'), 'чачак');
  });

  it('keeps a whole name, spaces and capitals included', () => {
    // The phonetic spelling a Serbian speech recogniser writes for the
    // footballer Lamine Yamal — see entities.ts.
    assert.equal(toCyrillic('lamin Jamal'), 'ламин Јамал');
  });

  it('leaves anything it does not know how to spell alone', () => {
    assert.equal(toCyrillic('LAV-3'), 'ЛАВ-3');
    assert.equal(toCyrillic(''), '');
  });

  it('is safe to run on text that is already Cyrillic', () => {
    // Serbian Wikipedia has no trouble with Cyrillic; this only needs to not
    // make it worse, so a caller does not have to know which script it got.
    assert.equal(toCyrillic('лав'), 'лав');
    assert.equal(toCyrillic('Ламин Јамал'), 'Ламин Јамал');
  });
});
