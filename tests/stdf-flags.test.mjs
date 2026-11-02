import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTestFlags, decodePartFlags, decodeParametricFlags, decodePtrNumericEligibility } from '../app/lib/records/stdf-flags.ts';

// Independent table notation: index zero is the least-significant spec bit.
const bitsOf = raw => [...raw.toString(2).padStart(8, '0')].reverse().map(bit => bit === '1');
const kinds = ['PTR', 'MPR', 'FTR'];

for (const kind of kinds) test(`${kind}: all 256 TEST_FLG combinations retain raw flags, execution, verdict and diagnostics`, () => {
  for (let raw = 0; raw <= 255; raw += 1) {
    const bits = bitsOf(raw);
    const decoded = decodeTestFlags(kind, raw);
    const label = `${kind} TEST_FLG=${raw}`;
    assert.equal(decoded.raw, raw, label);
    assert.equal(decoded.execution, bits[4] ? 'not-executed' : 'executed', label);
    assert.equal(decoded.verdict, bits[4] || bits[6] ? 'unknown' : bits[7] ? 'fail' : 'pass', label);
    assert.equal(decoded.numericValidity, kind === 'PTR' ? (bits.slice(0, 6).some(Boolean) ? 'invalid' : 'valid') : 'not-applicable', label);
    const names = ['alarm', kind === 'PTR' ? 'invalid-result' : 'reserved-bit-1-set', 'unreliable', 'timeout', 'not-executed', 'abort', 'no-pass-fail-indication'];
    assert.deepEqual(decoded.diagnostics, names.filter((_, index) => bits[index]), label);
    assert.equal(new Set(decoded.diagnostics).size, decoded.diagnostics.length, label);
  }
});

test('all 256 PART_FLG combinations retain supersession declarations without choosing part identity', () => {
  for (let raw = 0; raw <= 255; raw += 1) {
    const bits = bitsOf(raw);
    const decoded = decodePartFlags(raw);
    const label = `PART_FLG=${raw}`;
    assert.equal(decoded.raw, raw, label);
    assert.equal(decoded.verdict, bits[4] ? 'unknown' : bits[3] ? 'fail' : 'pass', label);
    assert.equal(decoded.completion, bits[2] ? 'abnormal' : 'normal', label);
    assert.deepEqual(decoded.supersession, { byPartId: bits[0], byCoordinates: bits[1] }, label);
    const expected = [];
    if (bits[0] && bits[1]) expected.push('conflicting-supersession-flags');
    if (bits[2]) expected.push('abnormal-end-of-testing');
    if (bits[4]) expected.push('no-pass-fail-indication');
    for (const bit of [5, 6, 7]) if (bits[bit]) expected.push(`reserved-bit-${bit}-set`);
    assert.deepEqual(decoded.diagnostics, expected, label);
  }
});

test('all 256 PARM_FLG combinations retain each independent diagnostic, comparison and boundary flag', () => {
  const names = ['scaleError', 'driftError', 'oscillation', 'aboveHighLimit', 'belowLowLimit', 'passedAlternateLimits', 'lowLimitEqualityPass', 'highLimitEqualityPass'];
  for (let raw = 0; raw <= 255; raw += 1) {
    const bits = bitsOf(raw);
    const decoded = decodeParametricFlags(raw);
    assert.equal(decoded.raw, raw, `PARM_FLG=${raw}`);
    names.forEach((name, bit) => assert.equal(decoded[name], bits[bit], `${name} PARM_FLG=${raw}`));
    assert.deepEqual(decoded.diagnostics, ['scale-error', 'drift-error', 'oscillation'].filter((_, bit) => bits[bit]));
  }
});

test('unknown indication and not-executed records cannot be converted to PASS or FAIL by bit 7', () => {
  for (const kind of kinds) {
    for (const raw of [0x10, 0x90, 0x40, 0xc0, 0x50, 0xd0]) assert.equal(decodeTestFlags(kind, raw).verdict, 'unknown');
    assert.equal(decodeTestFlags(kind, 0).verdict, 'pass');
    assert.equal(decodeTestFlags(kind, 0x80).verdict, 'fail');
  }
  assert.equal(decodePartFlags(0x10).verdict, 'unknown');
  assert.equal(decodePartFlags(0x18).verdict, 'unknown');
});

test('PTR invalid numeric evidence never erases a valid recorded verdict', () => {
  for (const bit of [0x01, 0x02, 0x04, 0x08, 0x20]) {
    assert.equal(decodeTestFlags('PTR', bit).verdict, 'pass');
    assert.equal(decodeTestFlags('PTR', bit).numericValidity, 'invalid');
    assert.equal(decodeTestFlags('PTR', bit | 0x80).verdict, 'fail');
    assert.equal(decodeTestFlags('PTR', bit | 0x80).numericValidity, 'invalid');
  }
  assert.equal(decodeTestFlags('PTR', 0x40).numericValidity, 'valid');
  assert.equal(decodeTestFlags('PTR', 0xc0).numericValidity, 'valid');
});

test('MPR/FTR reserved bit 1 is diagnostic and never claims invalid or valid child numeric results', () => {
  for (const kind of ['MPR', 'FTR']) {
    assert.deepEqual(decodeTestFlags(kind, 0x02), {
      verdict: 'pass', execution: 'executed', numericValidity: 'not-applicable', diagnostics: ['reserved-bit-1-set'], raw: 2,
    });
    assert.equal(decodeTestFlags(kind, 0x82).verdict, 'fail');
    assert.equal(decodeTestFlags(kind, 0x06).numericValidity, 'not-applicable');
  }
});

test('PRR abnormal completion and conflicting supersession retain explicit disposition and both source bits', () => {
  assert.equal(decodePartFlags(0x04).verdict, 'pass');
  assert.equal(decodePartFlags(0x0c).verdict, 'fail');
  assert.equal(decodePartFlags(0x1c).verdict, 'unknown');
  assert.deepEqual(decodePartFlags(0x03).supersession, { byPartId: true, byCoordinates: true });
  assert.deepEqual(decodePartFlags(0x03).diagnostics, ['conflicting-supersession-flags']);
});

test('PTR combined numeric flag eligibility covers all 65,536 TEST_FLG/PARM_FLG combinations', () => {
  for (let testRaw = 0; testRaw <= 255; testRaw += 1) {
    const testBits = bitsOf(testRaw);
    for (let parmRaw = 0; parmRaw <= 255; parmRaw += 1) {
      const parmBits = bitsOf(parmRaw);
      const eligible = !testBits.slice(0, 6).some(Boolean) && !parmBits.slice(0, 3).some(Boolean);
      const decoded = decodePtrNumericEligibility(testRaw, parmRaw);
      assert.equal(decoded.validity, eligible ? 'valid' : 'invalid', `TEST_FLG=${testRaw}, PARM_FLG=${parmRaw}`);
      assert.equal(decoded.rawTestFlag, testRaw);
      assert.equal(decoded.rawParametricFlag, parmRaw);
      assert.equal(decoded.diagnostics.length === 0, eligible);
    }
  }
});

test('numeric flag eligibility keeps high/low/alternate/boundary flags separate from numerical error flags', () => {
  assert.deepEqual(decodePtrNumericEligibility(0xc0, 0xf8), {
    validity: 'valid', diagnostics: [], rawTestFlag: 0xc0, rawParametricFlag: 0xf8,
  });
  assert.deepEqual(decodePtrNumericEligibility(0x83, 0x07).diagnostics, ['alarm', 'invalid-result', 'scale-error', 'drift-error', 'oscillation']);
  assert.equal(decodeParametricFlags(0xc0).lowLimitEqualityPass, true);
  assert.equal(decodeParametricFlags(0xc0).highLimitEqualityPass, true);
  assert.equal(decodeParametricFlags(0).lowLimitEqualityPass, false);
  assert.equal(decodeParametricFlags(0).highLimitEqualityPass, false);
});

test('invalid bytes or unknown record kinds are rejected rather than silently masked or misclassified', () => {
  const invalid = [-1, 256, 1.5, NaN, Infinity, -Infinity, undefined, null, '128'];
  for (const raw of invalid) {
    assert.throws(() => decodeTestFlags('PTR', raw), RangeError);
    assert.throws(() => decodePartFlags(raw), RangeError);
    assert.throws(() => decodeParametricFlags(raw), RangeError);
    assert.throws(() => decodePtrNumericEligibility(raw, 0), RangeError);
    assert.throws(() => decodePtrNumericEligibility(0, raw), RangeError);
  }
  assert.throws(() => decodeTestFlags('PRR', 0), RangeError);
});
