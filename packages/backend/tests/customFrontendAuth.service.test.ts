import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isConfiguredAppOrigin,
  normalizeOrigin,
  originMatchesAllowedOrigins,
  publicKeyMatchesHash,
  shouldRequireCustomFrontendAuth,
} from '../src/services/customFrontendAuth.service';
import { hashCustomFrontendPublicKey } from '../src/services/customFrontendSettings.service';

test('normalizeOrigin returns canonical origin only', () => {
  assert.equal(normalizeOrigin('https://apply.example.com/path?q=1'), 'https://apply.example.com');
  assert.equal(normalizeOrigin('not a url'), null);
  assert.equal(normalizeOrigin(undefined), null);
});

test('configured app origins do not require public frontend auth', () => {
  assert.equal(isConfiguredAppOrigin('http://localhost:3000'), true);
  assert.equal(
    shouldRequireCustomFrontendAuth({ origin: 'http://localhost:3000', publicKey: null }),
    false,
  );
});

test('custom origins require public frontend auth unless request is JWT-authenticated', () => {
  assert.equal(
    shouldRequireCustomFrontendAuth({ origin: 'https://apply.example.com', publicKey: null }),
    true,
  );
  assert.equal(
    shouldRequireCustomFrontendAuth({ origin: 'https://apply.example.com', publicKey: null, isAuthenticated: true }),
    false,
  );
  assert.equal(shouldRequireCustomFrontendAuth({ origin: null, publicKey: 'pk_test_public_frontend_key_value' }), true);
});

test('tenant origin allowlist uses exact canonical origins', () => {
  const allowlist = ['https://apply.example.com', 'http://localhost:3009'];
  assert.equal(originMatchesAllowedOrigins('https://apply.example.com/start', allowlist), true);
  assert.equal(originMatchesAllowedOrigins('https://evil.example.com', allowlist), false);
  assert.equal(originMatchesAllowedOrigins('not a url', allowlist), false);
  assert.equal(originMatchesAllowedOrigins(null, allowlist), true);
});

test('public key comparison uses stored SHA-256 hash', () => {
  const key = 'pk_test_public_frontend_key_value';
  assert.equal(publicKeyMatchesHash(key, hashCustomFrontendPublicKey(key)), true);
  assert.equal(publicKeyMatchesHash('pk_test_other_public_key_value', hashCustomFrontendPublicKey(key)), false);
});
