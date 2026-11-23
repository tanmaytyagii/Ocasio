import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoverageResponseSchema, parseEnvironment } from '@ocasio/contracts';

test('coverage never represents intended markets as bookable inventory', () => {
  const market = {id:'00000000-0000-4000-8000-000000000001',slug:'karnal',name:'Karnal',mode:'bookable'};
  assert.equal(CoverageResponseSchema.safeParse({items:[market]}).success,false);
});

test('invalid configuration does not leak database credentials', () => {
  assert.throws(() => parseEnvironment({DATABASE_URL:'secret-password-value'}),(error:unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('DATABASE_URL'));
    assert.ok(!error.message.includes('secret-password-value'));
    return true;
  });
});

test('production origin requires HTTPS and exact origins reject paths', () => {
  const env = {DATABASE_URL:'postgresql://localhost/example',SESSION_SECRET:'unit-test-secret-not-for-production-000000'};
  assert.throws(() => parseEnvironment({...env,NODE_ENV:'production',WEB_ORIGIN:'http://example.com'}));
  assert.throws(() => parseEnvironment({...env,WEB_ORIGIN:'http://localhost:3000/path'}));
  assert.equal(parseEnvironment({...env,WEB_ORIGIN:'http://localhost:3000'}).API_PORT,4100);
});
