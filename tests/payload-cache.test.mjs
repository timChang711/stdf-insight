import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordPayloadCache } from '../app/lib/records/payload-cache.ts';

const dataView = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fnv32 = bytes => bytes.reduce((hash, byte) => Math.imul(hash ^ byte, 16777619) >>> 0, 2166136261);

test('shares only byte-identical immutable payloads across offsets, preserving embedded NUL differences', () => {
  const bytes = Uint8Array.from([65, 0, 66, 65, 0, 66, 65, 0, 67, 65, 66, 0]);
  const cache = new RecordPayloadCache(dataView(bytes));
  const payload = Object.freeze({ text: 'A\0B', array: Object.freeze([1, 2]) });
  assert.equal(cache.get(0, 3), undefined);
  cache.set(0, 3, payload);
  assert.strictEqual(cache.get(0, 3), payload);
  assert.strictEqual(cache.get(3, 6), payload);
  assert.equal(cache.get(6, 9), undefined);
  assert.equal(cache.get(9, 12), undefined);
  assert.equal(cache.get(0, 2), undefined);
  assert.strictEqual(cache.get(3, 6).array, payload.array);
});

test('different IEEE-754 NaN payloads and signed zeros never share just because decoded numbers compare similarly', () => {
  const bytes = new Uint8Array(20);
  const view = dataView(bytes);
  [0x7fc00001, 0x7fc00002, 0x7fc00001, 0, 0x80000000].forEach((bits, index) => view.setUint32(index * 4, bits, true));
  assert.ok(Number.isNaN(view.getFloat32(0, true)));
  assert.ok(Number.isNaN(view.getFloat32(4, true)));
  const cache = new RecordPayloadCache(view);
  const first = { raw: 'NaN payload 1' }, second = { raw: 'NaN payload 2' }, positiveZero = { raw: '+0' };
  cache.set(0, 4, first);
  assert.equal(cache.get(4, 8), undefined);
  cache.set(4, 8, second);
  assert.strictEqual(cache.get(8, 12), first);
  assert.strictEqual(cache.get(4, 8), second);
  cache.set(12, 16, positiveZero);
  assert.equal(cache.get(16, 20), undefined);
});

test('uses DataView-relative offsets rather than backing-buffer offsets', () => {
  const bytes = Uint8Array.from([99, 99, 99, 1, 2, 3, 1, 2, 3, 99, 99]);
  const cache = new RecordPayloadCache(new DataView(bytes.buffer, 3, 6));
  const payload = { source: 'window' };
  cache.set(0, 3, payload);
  assert.strictEqual(cache.get(3, 6), payload);
  assert.throws(() => cache.get(0, 7), RangeError);
  assert.throws(() => cache.set(0, 7, {}), RangeError);
});

test('resolves real same-length FNV-1a collisions with full byte comparison', () => {
  // Deterministically found collision, eight bytes each; length checks alone
  // cannot distinguish these bodies. Neither input is a decoded-value shortcut.
  const firstBytes = Buffer.from('036a5b51ce9579bf', 'hex');
  const secondBytes = Buffer.from('5c4e9f8fb653cbac', 'hex');
  assert.equal(fnv32(firstBytes), 0xa3cedb91);
  assert.equal(fnv32(secondBytes), 0xa3cedb91);
  assert.notDeepEqual(firstBytes, secondBytes);
  const bytes = Buffer.concat([firstBytes, secondBytes, firstBytes, secondBytes]);
  const cache = new RecordPayloadCache(dataView(bytes));
  const first = { kind: 'first' }, second = { kind: 'second' };
  cache.set(0, 8, first);
  assert.equal(cache.get(8, 16), undefined);
  cache.set(8, 16, second);
  assert.strictEqual(cache.get(16, 24), first);
  assert.strictEqual(cache.get(24, 32), second);
});

test('counts unique entries toward the cap and preserves earlier hits after capacity is reached', () => {
  const bytes = Uint8Array.from([1, 1, 2, 3, 2, 1]);
  const cache = new RecordPayloadCache(dataView(bytes), 2);
  const first = { value: 1 }, second = { value: 2 };
  cache.set(0, 1, first);
  cache.set(1, 2, { shouldNotReplaceCanonical: true });
  cache.set(2, 3, second);
  cache.set(3, 4, { notRetained: true });
  assert.strictEqual(cache.get(5, 6), first);
  assert.strictEqual(cache.get(4, 5), second);
  assert.equal(cache.get(3, 4), undefined);
  cache.set(5, 6, { shouldNotReplaceAtCapacity: true });
  assert.strictEqual(cache.get(0, 1), first);
});

test('default capacity retains exactly the first 32 unique bodies without evicting them', () => {
  const bytes = Uint8Array.from({ length: 34 }, (_, index) => index);
  const cache = new RecordPayloadCache(dataView(bytes));
  const payloads = Array.from(bytes, value => ({ value }));
  payloads.forEach((payload, index) => cache.set(index, index + 1, payload));
  for (let index = 0; index < 32; index++) assert.strictEqual(cache.get(index, index + 1), payloads[index]);
  assert.equal(cache.get(32, 33), undefined);
  assert.equal(cache.get(33, 34), undefined);
});

test('zero capacity disables retention; empty bodies compare by their exact zero-byte content', () => {
  const view = dataView(Uint8Array.from([1, 2]));
  const disabled = new RecordPayloadCache(view, 0);
  disabled.set(0, 1, {});
  assert.equal(disabled.get(0, 1), undefined);
  const cache = new RecordPayloadCache(view);
  const empty = { empty: true };
  cache.set(0, 0, empty);
  assert.strictEqual(cache.get(2, 2), empty);
  assert.equal(cache.get(0, 1), undefined);
});

test('rejects invalid ranges and capacities without reading outside the supplied DataView', () => {
  const view = dataView(Uint8Array.from([1, 2, 3]));
  for (const capacity of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => new RecordPayloadCache(view, capacity), RangeError);
  const cache = new RecordPayloadCache(view);
  for (const [body, end] of [[-1, 1], [2, 1], [0, 4], [0.5, 2], [0, 2.5], [NaN, 1], [0, Infinity]]) {
    assert.throws(() => cache.get(body, end), RangeError);
    assert.throws(() => cache.set(body, end, {}), RangeError);
  }
});
