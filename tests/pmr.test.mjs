import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePmrRecord } from '../app/lib/records/pmr.ts';

const u2 = (value, little = true) => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, little);
  return [...bytes];
};
const cn = value => [value.length, ...Array.from(value, char => char.charCodeAt(0))];
const decode = (bytes, little = true) => decodePmrRecord(new DataView(Uint8Array.from(bytes).buffer), 0, bytes.length, little);
const complete = little => [...u2(513, little), ...u2(0x1234, little), ...cn(' ATE_CH_9 '), ...cn('PAD_A'), ...cn('VDDA'), 2, 7];

for (const little of [true, false]) {
  test(`PMR ${little ? 'little' : 'big'} endian fields and byte order`, () => {
    const result = decode(complete(little), little);
    assert.deepEqual(result.fields, {
      PMR_INDX: 513, CHAN_TYP: 0x1234, CHAN_NAM: ' ATE_CH_9 ', PHY_NAM: 'PAD_A', LOG_NAM: 'VDDA', HEAD_NUM: 2, SITE_NUM: 7,
    });
    assert.deepEqual(result.present, ['PMR_INDX', 'CHAN_TYP', 'CHAN_NAM', 'PHY_NAM', 'LOG_NAM', 'HEAD_NUM', 'SITE_NUM']);
    assert.equal(result.trailingBytes, 0);
  });
}

test('PMR two-byte required prefix retains omitted tails without supplying default head/site', () => {
  const result = decode(u2(17));
  assert.deepEqual(result, { fields: { PMR_INDX: 17 }, present: ['PMR_INDX'], trailingBytes: 0 });
  assert.equal(Object.hasOwn(result.fields, 'HEAD_NUM'), false);
  assert.equal(Object.hasOwn(result.fields, 'SITE_NUM'), false);
});

test('PMR optional fields can be omitted after every complete field boundary', () => {
  const chunks = [u2(17), u2(0), cn(''), cn('PHYS'), cn(''), [1], [0]];
  const names = ['PMR_INDX', 'CHAN_TYP', 'CHAN_NAM', 'PHY_NAM', 'LOG_NAM', 'HEAD_NUM', 'SITE_NUM'];
  const bytes = [];
  for (let index = 0; index < chunks.length; index++) {
    bytes.push(...chunks[index]);
    const result = decode(bytes);
    assert.deepEqual(result.present, names.slice(0, index + 1));
    assert.deepEqual(Object.keys(result.fields), names.slice(0, index + 1));
    assert.equal(result.trailingBytes, 0);
    if (index < names.length - 1) assert.equal(Object.hasOwn(result.fields, names[index + 1]), false);
  }
  const result = decode(bytes);
  assert.equal(result.fields.CHAN_TYP, 0);
  assert.equal(result.fields.HEAD_NUM, 1);
  assert.equal(result.fields.SITE_NUM, 0);
});

test('PMR raw strings retain empty values, NUL bytes, whitespace and C1 byte values', () => {
  const result = decode([...u2(1), ...u2(0), ...cn('\0'), ...cn(''), ...cn(' \u0080\u00e9\0 '), 0, 1]);
  assert.equal(result.fields.CHAN_NAM, '\0');
  assert.equal(result.fields.PHY_NAM, '');
  assert.equal(result.fields.LOG_NAM, ' \u0080\u00e9\0 ');
  assert.equal(result.fields.HEAD_NUM, 0);
  assert.equal(result.fields.SITE_NUM, 1);
});

test('PMR 255-byte strings are bounded correctly and do not consume the following field', () => {
  const name = 'X'.repeat(255);
  const result = decode([...u2(1), ...u2(0), ...cn(name), ...cn('P'), ...cn('L'), 3, 4]);
  assert.equal(result.fields.CHAN_NAM, name);
  assert.equal(result.fields.PHY_NAM, 'P');
  assert.equal(result.fields.SITE_NUM, 4);
});

test('PMR rejects partial required index, channel type and any counted string', () => {
  assert.throws(() => decode([]), /PMR_INDX/);
  assert.throws(() => decode([1]), /PMR_INDX/);
  assert.throws(() => decode([...u2(1), 0]), /CHAN_TYP/);
  const base = [...u2(1), ...u2(0)];
  assert.throws(() => decode([...base, 2, 65]), /CHAN_NAM/);
  assert.throws(() => decode([...base, 0, 2, 65]), /PHY_NAM/);
  assert.throws(() => decode([...base, 0, 0, 2, 65]), /LOG_NAM/);
});

test('PMR respects record boundaries inside an offset DataView and reports unknown trailing bytes', () => {
  const body = complete(false), backing = Uint8Array.from([98, 97, 96, 95, 11, 12, ...body, 0xde, 0xad, 0xff]);
  const view = new DataView(backing.buffer, 4, backing.length - 5);
  const result = decodePmrRecord(view, 2, view.byteLength, false);
  assert.equal(result.fields.PMR_INDX, 513);
  assert.equal(result.fields.SITE_NUM, 7);
  assert.equal(result.trailingBytes, 2);
  const stringBytes = new DataView(Uint8Array.from([...u2(1), ...u2(0), 3, 65, 66, 67]).buffer);
  assert.throws(() => decodePmrRecord(stringBytes, 0, stringBytes.byteLength - 1, true), /CHAN_NAM/);
});

test('PMR rejects invalid bounds but preserves out-of-spec wire index values for the normalizer', () => {
  const bytes = new DataView(Uint8Array.from(u2(1)).buffer);
  for (const [body, end] of [[-1, 2], [0, 3], [1, 0], [0.5, 2], [0, NaN]]) {
    assert.throws(() => decodePmrRecord(bytes, body, end, true), /bounds/);
  }
  assert.equal(decode(u2(0)).fields.PMR_INDX, 0);
  assert.equal(decode(u2(65535)).fields.PMR_INDX, 65535);
});
