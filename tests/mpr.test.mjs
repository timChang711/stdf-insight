import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMprRecord } from '../app/lib/records/mpr.ts';

const scalar = (type, value, little = true) => {
  const size = { u1: 1, i1: 1, u2: 2, u4: 4, r4: 4 }[type];
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  if (type === 'u1') view.setUint8(0, value);
  if (type === 'i1') view.setInt8(0, value);
  if (type === 'u2') view.setUint16(0, value, little);
  if (type === 'u4') view.setUint32(0, value, little);
  if (type === 'r4') view.setFloat32(0, value, little);
  return [...bytes];
};
const cn = value => [value.length, ...Array.from(value, char => char.charCodeAt(0))];
const prefix = little => [...scalar('u4', 0x12345678, little), 2, 7, 0x84, 0xc0];
const decode = (bytes, little = true) => decodeMprRecord(new DataView(Uint8Array.from(bytes).buffer), 0, bytes.length, little);
const counts = (pins, results, little = true) => [...scalar('u2', pins, little), ...scalar('u2', results, little)];
const packed = states => {
  const bytes = [];
  for (let index = 0; index < states.length; index += 2) bytes.push(states[index] | ((states[index + 1] ?? 0) << 4));
  return bytes;
};
const bodyThroughResults = (states, results, little = true) => [
  ...prefix(little), ...counts(states.length, results.length, little), ...packed(states),
  ...results.flatMap(value => scalar('r4', value, little)),
];
const fullFixture = little => [
  ...bodyThroughResults([1, 2, 15], [1.25, -2.5, 0, Infinity, NaN], little),
  ...cn('  Scan\0 label  '), ...cn('ALARM_1'), 0x52,
  ...scalar('i1', -3), ...scalar('i1', -2), ...scalar('i1', 1),
  ...scalar('r4', -10.25, little), ...scalar('r4', 20.5, little),
  ...scalar('r4', 3.5, little), ...scalar('r4', -.25, little),
  ...[100, 513, 65535].flatMap(value => scalar('u2', value, little)),
  ...cn('V'), ...cn('Hz'), ...cn('%7.2f'), ...cn('%8.3f'), ...cn('%9.4f'),
  ...scalar('r4', -11.5, little), ...scalar('r4', 22.75, little),
];

for (const little of [true, false]) {
  test(`complete ${little ? 'little' : 'big'} endian MPR preserves independent arrays, scan fields and all raw tails`, () => {
    const result = decode(fullFixture(little), little), fields = result.fields;
    assert.deepEqual(fields, {
      TEST_NUM: 0x12345678, HEAD_NUM: 2, SITE_NUM: 7, TEST_FLG: 0x84, PARM_FLG: 0xc0,
      RTN_ICNT: 3, RSLT_CNT: 5, RTN_STAT: [1, 2, 15], RTN_RSLT: [1.25, -2.5, 0, Infinity, NaN],
      TEST_TXT: '  Scan\0 label  ', ALARM_ID: 'ALARM_1', OPT_FLAG: 0x52,
      RES_SCAL: -3, LLM_SCAL: -2, HLM_SCAL: 1, LO_LIMIT: -10.25, HI_LIMIT: 20.5,
      START_IN: 3.5, INCR_IN: -.25, RTN_INDX: [100, 513, 65535], UNITS: 'V', UNITS_IN: 'Hz',
      C_RESFMT: '%7.2f', C_LLMFMT: '%8.3f', C_HLMFMT: '%9.4f', LO_SPEC: -11.5, HI_SPEC: 22.75,
    });
    assert.deepEqual(result.present, Object.keys(fields));
    assert.equal(result.trailingBytes, 0);
    assert.equal(new Set(result.present).size, result.present.length);
    assert.equal(fields.TEST_NUM, 0x12345678); // One test identity, not incremented per result.
    assert.equal(Object.hasOwn(fields, 'partCount'), false);
  });
}

test('required eight-byte prefix permits absent counts without inventing zero-valued fields', () => {
  const result = decode(prefix(true));
  assert.deepEqual(result.fields, { TEST_NUM: 0x12345678, HEAD_NUM: 2, SITE_NUM: 7, TEST_FLG: 0x84, PARM_FLG: 0xc0 });
  assert.deepEqual(result.present, ['TEST_NUM', 'HEAD_NUM', 'SITE_NUM', 'TEST_FLG', 'PARM_FLG']);
  assert.equal(Object.hasOwn(result.fields, 'RTN_ICNT'), false);
  assert.equal(Object.hasOwn(result.fields, 'RSLT_CNT'), false);
});

test('explicit zero count is distinguishable from omitted count and both counts can be zero', () => {
  const oneCount = decode([...prefix(true), 0, 0]);
  assert.equal(oneCount.fields.RTN_ICNT, 0);
  assert.deepEqual(oneCount.fields.RTN_STAT, []);
  assert.equal(Object.hasOwn(oneCount.fields, 'RSLT_CNT'), false);
  assert.equal(Object.hasOwn(oneCount.fields, 'RTN_RSLT'), false);
  const both = decode([...prefix(true), ...counts(0, 0)]);
  assert.equal(both.fields.RSLT_CNT, 0);
  assert.deepEqual(both.fields.RTN_STAT, []);
  assert.deepEqual(both.fields.RTN_RSLT, []);
  assert.equal(Object.hasOwn(both.fields, 'TEST_TXT'), false);
});

test('independent pin and result counts support scan results without pins and pins without results', () => {
  const scan = decode(bodyThroughResults([], [1, 2, 3]));
  assert.deepEqual(scan.fields.RTN_STAT, []);
  assert.deepEqual(scan.fields.RTN_RSLT, [1, 2, 3]);
  const pins = decode(bodyThroughResults([4, 5, 6], []));
  assert.deepEqual(pins.fields.RTN_STAT, [4, 5, 6]);
  assert.deepEqual(pins.fields.RTN_RSLT, []);
  assert.equal(pins.fields.RTN_INDX, undefined);
});

test('nibbles decode low-first and consume exactly ceil(count/2) bytes', () => {
  const bytes = [...prefix(true), ...counts(3, 1), 0x21, 0x03, ...scalar('r4', 17.5), ...cn('after')];
  const result = decode(bytes);
  assert.deepEqual(result.fields.RTN_STAT, [1, 2, 3]);
  assert.deepEqual(result.fields.RTN_RSLT, [17.5]);
  assert.equal(result.fields.TEST_TXT, 'after');
});

test('zero-length strings, single-NUL overrides and byte values survive unchanged', () => {
  const base = [...bodyThroughResults([], []), ...cn(''), ...cn('\0'), 0, 0, 0, 0,
    ...scalar('r4', 0), ...scalar('r4', 0), ...scalar('r4', 0), ...scalar('r4', 0)];
  const result = decode([...base, ...cn('\0'), ...cn('\u0080\u00e9 ')]);
  assert.equal(result.fields.TEST_TXT, '');
  assert.equal(result.fields.ALARM_ID, '\0');
  assert.equal(result.fields.UNITS, '\0');
  assert.equal(result.fields.UNITS_IN, '\u0080\u00e9 ');
  assert.deepEqual(result.fields.RTN_INDX, []);
  assert.equal(result.fields.OPT_FLAG, 0);
  assert.equal(result.fields.RES_SCAL, 0);
  assert.equal(result.fields.LO_LIMIT, 0);
  assert.equal(result.fields.INCR_IN, 0);
  assert.equal(Object.hasOwn(result.fields, 'C_RESFMT'), false);
});

test('optional tails can end at every complete scalar or string boundary', () => {
  const chunks = [bodyThroughResults([], [2]), cn(''), cn(''), [0xff], scalar('i1', -1), scalar('i1', 0), scalar('i1', 2),
    scalar('r4', -1), scalar('r4', 1), scalar('r4', 10), scalar('r4', -2), cn('V'), cn('s'), cn('%g'), cn('%g'), cn('%g'), scalar('r4', -2), scalar('r4', 2)];
  const names = ['RTN_RSLT', 'TEST_TXT', 'ALARM_ID', 'OPT_FLAG', 'RES_SCAL', 'LLM_SCAL', 'HLM_SCAL', 'LO_LIMIT', 'HI_LIMIT', 'START_IN', 'INCR_IN', 'UNITS', 'UNITS_IN', 'C_RESFMT', 'C_LLMFMT', 'C_HLMFMT', 'LO_SPEC', 'HI_SPEC'];
  const bytes = [];
  for (let index = 0; index < chunks.length; index++) {
    bytes.push(...chunks[index]);
    const result = decode(bytes);
    assert.ok(result.present.includes(names[index]), names[index]);
    if (index < chunks.length - 1) assert.equal(Object.hasOwn(result.fields, names[index + 1]), false, names[index + 1]);
    assert.equal(result.trailingBytes, 0);
  }
});

test('rejects partial required prefix, either count, packed states and float result arrays', () => {
  for (let length = 0; length < 8; length++) assert.throws(() => decode(prefix(true).slice(0, length)), /required prefix/);
  assert.throws(() => decode([...prefix(true), 0]), /RTN_ICNT/);
  assert.throws(() => decode([...prefix(true), 0, 0, 0]), /RSLT_CNT/);
  assert.throws(() => decode([...prefix(true), ...scalar('u2', 1)]), /RTN_STAT/);
  assert.throws(() => decode([...prefix(true), ...counts(3, 0), 0x21]), /RTN_STAT/);
  assert.throws(() => decode([...prefix(true), ...counts(0, 2), ...scalar('r4', 1)]), /RTN_RSLT/);
  assert.throws(() => decode([...prefix(true), ...counts(0, 1), 0, 0, 0]), /RTN_RSLT/);
});

test('rejects partial C*n strings and partially present four-byte tail values', () => {
  const base = bodyThroughResults([], []);
  assert.throws(() => decode([...base, 3, 65, 66]), /TEST_TXT/);
  assert.throws(() => decode([...base, ...cn('ok'), 2, 65]), /ALARM_ID/);
  const throughScales = [...base, 0, 0, 0, 0, 0, 0];
  for (let bytes = 1; bytes < 4; bytes++) assert.throws(() => decode([...throughScales, ...Array(bytes).fill(0)]), /LO_LIMIT/);
  const throughInputs = [...throughScales, ...scalar('r4', 0), ...scalar('r4', 1), ...scalar('r4', 2), ...scalar('r4', 3)];
  assert.throws(() => decode([...throughInputs, 2, 65]), /UNITS/);
  const throughFormats = [...throughInputs, 0, 0, 0, 0, 0];
  assert.throws(() => decode([...throughFormats, 0, 0, 0]), /LO_SPEC/);
  assert.throws(() => decode([...throughFormats, ...scalar('r4', 0), 0]), /HI_SPEC/);
});

test('RTN_INDX is optional when wholly omitted and rejects a partial declared index array', () => {
  const throughInputs = [...bodyThroughResults([1, 2, 3], [10]), 0, 0, 0, 0, 0, 0,
    ...scalar('r4', 0), ...scalar('r4', 1), ...scalar('r4', 2), ...scalar('r4', 3)];
  assert.equal(decode(throughInputs).fields.RTN_INDX, undefined);
  for (let length = 1; length < 6; length++) {
    assert.throws(() => decode([...throughInputs, ...Array(length).fill(0)]), /RTN_INDX/);
  }
  assert.deepEqual(decode([...throughInputs, ...[256, 513, 1024].flatMap(value => scalar('u2', value))]).fields.RTN_INDX, [256, 513, 1024]);
});

test('respects DataView offsets and record end, reports only unknown trailing bytes', () => {
  const body = fullFixture(false), backing = Uint8Array.from([99, 98, 97, 96, 11, 12, ...body, 0xde, 0xad, 0xff]);
  const view = new DataView(backing.buffer, 4, backing.length - 5);
  const result = decodeMprRecord(view, 2, view.byteLength, false);
  assert.equal(result.fields.TEST_NUM, 0x12345678);
  assert.equal(result.fields.HI_SPEC, 22.75);
  assert.equal(result.trailingBytes, 2);
  const strict = new DataView(Uint8Array.from([...bodyThroughResults([], []), 3, 65, 66, 67]).buffer);
  assert.throws(() => decodeMprRecord(strict, 0, strict.byteLength - 1, true), /TEST_TXT/);
  assert.throws(() => decodeMprRecord(strict, -1, strict.byteLength, true), /bounds/);
  assert.throws(() => decodeMprRecord(strict, 0, strict.byteLength + 1, true), /bounds/);
  assert.throws(() => decodeMprRecord(strict, 1.5, strict.byteLength, true), /bounds/);
});
