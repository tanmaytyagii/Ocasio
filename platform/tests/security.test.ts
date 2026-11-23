import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseEnvironment, SessionBootstrapSchema } from '@ocasio/contracts';

const valid = { DATABASE_URL: 'postgresql://localhost/isolated_security_tests', SESSION_SECRET: randomBytes(32).toString('hex') };

test('session configuration refuses missing or short signing secrets without revealing values', () => {
  for (const secret of [undefined, '', 'short-private-secret', ' '.repeat(48)]) {
    assert.throws(() => parseEnvironment({ ...valid, SESSION_SECRET: secret }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('SESSION_SECRET'));
      if (secret) assert.ok(!error.message.includes(secret));
      return true;
    });
  }
});

test('session lifetime is finite and invalid duration cannot silently create a long-lived session', () => {
  assert.equal(parseEnvironment(valid).SESSION_TTL_MINUTES, 30);
  for (const value of [0, -1, 1441, 'not-a-duration', Infinity]) {
    assert.throws(() => parseEnvironment({ ...valid, SESSION_TTL_MINUTES: value }));
  }
});

test('session contract requires a boolean identity state and valid CSRF token', () => {
  const csrfToken = randomBytes(32).toString('hex');
  assert.equal(SessionBootstrapSchema.safeParse({ authenticated: false, csrfToken }).success, true);
  assert.equal(SessionBootstrapSchema.safeParse({ authenticated: true, csrfToken }).success, true);
  for (const token of ['', 'invalid', csrfToken.slice(1)]) {
    assert.equal(SessionBootstrapSchema.safeParse({ authenticated: false, csrfToken: token }).success, false);
  }
});
