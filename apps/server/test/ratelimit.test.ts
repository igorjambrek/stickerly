import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiter } from '../src/ratelimit.ts';

/**
 * This is what makes a six-character code safe to put in front of a child. The
 * per-code attempt counter in the database cannot see a wrong guess — a wrong
 * guess matches no row — so guessing is stopped here or not at all.
 */
describe('rate limiter', () => {
  it('allows exactly the limit, then refuses', () => {
    const limiter = createRateLimiter(3, 60_000);

    assert.deepEqual(
      [1, 2, 3, 4, 5].map(() => limiter.take('1.2.3.4')),
      [true, true, true, false, false],
    );
  });

  it('counts each caller separately', () => {
    const limiter = createRateLimiter(1, 60_000);

    assert.equal(limiter.take('1.2.3.4'), true);
    assert.equal(limiter.take('1.2.3.4'), false);
    assert.equal(limiter.take('5.6.7.8'), true, 'one child guessing must not lock out another');
  });

  it('forgives once the window has passed', async () => {
    const limiter = createRateLimiter(2, 30);

    assert.equal(limiter.take('1.2.3.4'), true);
    assert.equal(limiter.take('1.2.3.4'), true);
    assert.equal(limiter.take('1.2.3.4'), false);

    await new Promise((resolve) => setTimeout(resolve, 45));
    assert.equal(limiter.take('1.2.3.4'), true, 'a minute later, try again');
  });

  /** Without the sweep this leaks one entry per address that ever tried a code. */
  it('forgets callers it has not heard from in a whole window', async () => {
    const limiter = createRateLimiter(5, 20);
    for (let i = 0; i < 200; i++) limiter.take(`10.0.0.${i}`);
    assert.equal(limiter.size(), 200);

    await new Promise((resolve) => setTimeout(resolve, 45));

    // The sweep is inline, so it happens on the next call rather than on a timer.
    limiter.take('192.168.0.1');
    assert.equal(limiter.size(), 1, 'only the caller still talking to us is kept');
  });
});
