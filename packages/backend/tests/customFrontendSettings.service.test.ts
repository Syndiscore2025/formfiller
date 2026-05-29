import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN,
  deriveCustomFrontendPublicKeyConfig,
  hashCustomFrontendPublicKey,
  normalizeStringList,
} from '../src/services/customFrontendSettings.service';

test('custom frontend public key config stores only hash and preview', () => {
  const key = 'pk_live_switchbox_frontend_key_1234567890';
  const config = deriveCustomFrontendPublicKeyConfig(key);

  assert.equal(config.hash, hashCustomFrontendPublicKey(key));
  assert.equal(config.hash.length, 64);
  assert.notEqual(config.hash, key);
  assert.equal(config.preview, 'pk_live_swit…7890');
});

test('custom frontend public key pattern is limited to browser-safe public keys', () => {
  assert.equal(CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN.test('pk_test_abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN.test('pk_live_abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN.test('secret_live_abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(CUSTOM_FRONTEND_PUBLIC_KEY_PATTERN.test('plain-secret'), false);
});

test('normalizeStringList trims, splits, de-duplicates, and preserves order', () => {
  assert.deepEqual(
    normalizeStringList('https://a.example\nhttps://b.example, https://a.example  '),
    ['https://a.example', 'https://b.example'],
  );
  assert.deepEqual(normalizeStringList([' one ', '', 'two', 'one']), ['one', 'two']);
  assert.equal(normalizeStringList(null), null);
});