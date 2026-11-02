import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecordDefaults } from '../app/lib/records/defaults.ts';

const resolve = (resolver, raw, ordinal) => resolver.resolve(raw, Object.keys(raw), ordinal);
const initialMpr = () => ({
  TEST_NUM: 200, HEAD_NUM: 1, SITE_NUM: 1, TEST_FLG: 0, PARM_FLG: 0,
  OPT_FLAG: 0, RES_SCAL: 0, LLM_SCAL: -3, HLM_SCAL: 2, LO_LIMIT: 0, HI_LIMIT: 10,
  START_IN: -1, INCR_IN: 1, RTN_INDX: [1, 2], UNITS: 'V', UNITS_IN: 's',
  C_RESFMT: '%7.2f', C_LLMFMT: '%7.2f', C_HLMFMT: '%7.2f', LO_SPEC: -2, HI_SPEC: 12,
});

test('FTR keeps first defaults and applies later overrides for only one record', () => {
  const resolver = createRecordDefaults('FTR');
  const spinMap = Object.freeze({ bitCount: 9, bytes: Object.freeze([1, 1]) });
  const first = Object.freeze({ TEST_NUM: 100, PATG_NUM: 5, SPIN_MAP: spinMap, TEST_TXT: 'Original name' });
  const original = resolve(resolver, first, 11);
  assert.deepEqual(original.inherited, {});
  const alternateMap = { bitCount: 9, bytes: [0, 0] }; // Nonempty all-zero map is a real override.
  const local = resolve(resolver, { TEST_NUM: 100, PATG_NUM: 0, SPIN_MAP: alternateMap, TEST_TXT: '' }, 12);
  assert.equal(local.effective.PATG_NUM, 0);
  assert.strictEqual(local.effective.SPIN_MAP, alternateMap);
  assert.deepEqual(local.inherited, {});
  assert.equal(local.effective.TEST_TXT, ''); // FTR text is outside the default fields.
  const third = resolve(resolver, { TEST_NUM: 100 }, 13);
  assert.equal(third.effective.PATG_NUM, 5);
  assert.strictEqual(third.effective.SPIN_MAP, spinMap);
  assert.deepEqual(third.inherited, { PATG_NUM: 11, SPIN_MAP: 11 });
  assert.equal(third.effective.TEST_TXT, undefined);
  assert.equal(first.PATG_NUM, 5);
  assert.strictEqual(original.effective.SPIN_MAP, spinMap);
});

test('FTR physical missing sentinels inherit without replacing or mutating raw values', () => {
  const resolver = createRecordDefaults('FTR');
  const spinMap = { bitCount: 1, bytes: [1] };
  resolve(resolver, { PATG_NUM: 0, SPIN_MAP: spinMap }, 0);
  const blank = Object.freeze({ PATG_NUM: 255, SPIN_MAP: Object.freeze({ bitCount: 0, bytes: Object.freeze([]) }) });
  const result = resolve(resolver, blank, 2);
  assert.equal(result.effective.PATG_NUM, 0);
  assert.strictEqual(result.effective.SPIN_MAP, spinMap);
  assert.deepEqual(result.inherited, { PATG_NUM: 0, SPIN_MAP: 0 });
  assert.equal(blank.PATG_NUM, 255);
  assert.equal(blank.SPIN_MAP.bitCount, 0);
});

test('MPR omitted third-record fields inherit first values and flags instead of second-record overrides', () => {
  const resolver = createRecordDefaults('MPR');
  const first = initialMpr();
  const before = structuredClone(first);
  const firstResult = resolve(resolver, first, 41);
  const second = { TEST_NUM: 200, OPT_FLAG: 0, RES_SCAL: -6, LO_LIMIT: -20, UNITS: 'mV', RTN_INDX: [8, 9] };
  const secondBefore = structuredClone(second);
  const local = resolve(resolver, second, 42);
  assert.equal(local.effective.RES_SCAL, -6);
  assert.equal(local.effective.LO_LIMIT, -20);
  assert.equal(local.effective.UNITS, 'mV');
  assert.strictEqual(local.effective.RTN_INDX, second.RTN_INDX);
  const third = resolve(resolver, { TEST_NUM: 200, RTN_RSLT: [1, 2] }, 43);
  assert.equal(third.effective.OPT_FLAG, 0);
  assert.equal(third.effective.RES_SCAL, 0);
  assert.equal(third.effective.LO_LIMIT, 0);
  assert.equal(third.effective.UNITS, 'V');
  assert.strictEqual(third.effective.RTN_INDX, first.RTN_INDX);
  assert.equal(third.inherited.OPT_FLAG, 41);
  assert.equal(third.inherited.RTN_INDX, 41);
  assert.equal(third.inherited.UNITS, 41);
  assert.deepEqual(first, before);
  assert.deepEqual(second, secondBefore);
  assert.notStrictEqual(firstResult.effective, first);
  firstResult.effective.UNITS = 'Changed outer result';
  assert.equal(resolve(resolver, {}, 44).effective.UNITS, 'V');
});

test('MPR empty strings inherit while explicit NUL and spaces override only their own record', () => {
  const resolver = createRecordDefaults('MPR');
  resolve(resolver, initialMpr(), 1);
  const blank = resolve(resolver, { UNITS: '', C_RESFMT: '' }, 2);
  assert.equal(blank.effective.UNITS, 'V');
  assert.equal(blank.effective.C_RESFMT, '%7.2f');
  assert.equal(blank.inherited.UNITS, 1);
  const explicitClear = { UNITS: '\0', C_RESFMT: '   ' };
  const local = resolve(resolver, explicitClear, 3);
  assert.equal(local.effective.UNITS, '\0');
  assert.equal(local.effective.C_RESFMT, '   ');
  assert.equal(local.inherited.UNITS, undefined);
  assert.equal(local.inherited.C_RESFMT, undefined);
  assert.equal(explicitClear.UNITS, '\0');
  assert.equal(resolve(resolver, {}, 4).effective.UNITS, 'V');
});

test('MPR explicit default flags inherit scale and limits despite placeholder numeric bytes', () => {
  const resolver = createRecordDefaults('MPR');
  resolve(resolver, initialMpr(), 5);
  const raw = { OPT_FLAG: 0x31, RES_SCAL: 99, LLM_SCAL: 99, HLM_SCAL: 99, LO_LIMIT: 99, HI_LIMIT: 99 };
  const result = resolve(resolver, raw, 6);
  assert.equal(result.effective.OPT_FLAG, 0x31);
  assert.equal(result.effective.RES_SCAL, 0);
  assert.equal(result.effective.LLM_SCAL, -3);
  assert.equal(result.effective.HLM_SCAL, 2);
  assert.equal(result.effective.LO_LIMIT, 0);
  assert.equal(result.effective.HI_LIMIT, 10);
  for (const field of ['RES_SCAL', 'LLM_SCAL', 'HLM_SCAL', 'LO_LIMIT', 'HI_LIMIT']) assert.equal(result.inherited[field], 5);
  assert.equal(raw.LO_LIMIT, 99);
  assert.equal(resolve(resolver, {}, 7).effective.OPT_FLAG, 0);
});

test('MPR no-limit/no-spec and invalid input-condition flags exclude effective fields while preserving raw', () => {
  const resolver = createRecordDefaults('MPR');
  resolve(resolver, initialMpr(), 10);
  // Include bits4/5 too: no-limit bits6/7 must win over use-default flags.
  const raw = { OPT_FLAG: 0xfe, LO_LIMIT: 100, HI_LIMIT: 101, LLM_SCAL: 9, HLM_SCAL: 9, LO_SPEC: 102, HI_SPEC: 103, START_IN: 104, INCR_IN: 105 };
  const before = structuredClone(raw);
  const result = resolve(resolver, raw, 11);
  for (const field of ['LO_LIMIT', 'HI_LIMIT', 'LLM_SCAL', 'HLM_SCAL', 'LO_SPEC', 'HI_SPEC', 'START_IN', 'INCR_IN']) {
    assert.equal(Object.hasOwn(result.effective, field), false, field);
    assert.equal(Object.hasOwn(result.inherited, field), false, field);
  }
  assert.equal(result.effective.RES_SCAL, 0);
  assert.equal(result.effective.UNITS, 'V');
  assert.deepEqual(raw, before);
  const next = resolve(resolver, {}, 12);
  assert.equal(next.effective.OPT_FLAG, 0);
  assert.equal(next.effective.LO_LIMIT, 0);
  assert.equal(next.effective.LO_SPEC, -2);
});

test('fields missing or invalid in the first record never gain later defaults', () => {
  const ftr = createRecordDefaults('FTR');
  resolve(ftr, { PATG_NUM: 255, SPIN_MAP: { bitCount: 0, bytes: [] } }, 1);
  assert.equal(resolve(ftr, { PATG_NUM: 7 }, 2).effective.PATG_NUM, 7);
  assert.deepEqual(resolve(ftr, {}, 3), { effective: {}, inherited: {} });
  const mpr = createRecordDefaults('MPR');
  resolve(mpr, { OPT_FLAG: 0xff, LO_LIMIT: 100, RES_SCAL: 99 }, 4);
  const local = resolve(mpr, { OPT_FLAG: 0, LO_LIMIT: 1, RES_SCAL: -3, UNITS: 'V' }, 5);
  assert.equal(local.effective.LO_LIMIT, 1);
  const later = resolve(mpr, {}, 6);
  assert.deepEqual(later, { effective: { OPT_FLAG: 0xff }, inherited: { OPT_FLAG: 4 } });
  const firstMissing = createRecordDefaults('MPR');
  resolve(firstMissing, {}, 7);
  resolve(firstMissing, { OPT_FLAG: 0, UNITS: 'V' }, 8);
  assert.deepEqual(resolve(firstMissing, {}, 9), { effective: {}, inherited: {} });
});

test('present fields govern inheritance and arrays remain shared instead of copied', () => {
  const resolver = createRecordDefaults('MPR');
  const first = Object.freeze({ OPT_FLAG: 0, RTN_INDX: Object.freeze([2, 4]), UNITS: 'V' });
  resolve(resolver, first, 20);
  const payload = Object.freeze([1, NaN, Infinity]);
  const raw = Object.freeze({ UNITS: 'not physically present', RTN_INDX: Object.freeze([]), RTN_RSLT: payload });
  const result = resolver.resolve(raw, ['RTN_INDX', 'RTN_RSLT'], 21);
  assert.equal(result.effective.UNITS, 'V');
  assert.strictEqual(result.effective.RTN_INDX, first.RTN_INDX);
  assert.strictEqual(result.effective.RTN_RSLT, payload);
  assert.equal(result.inherited.RTN_INDX, 20);
  assert.equal(result.inherited.UNITS, 20);
  assert.equal(raw.UNITS, 'not physically present');
});

test('separate kind/test resolvers retain independent defaults and ordinal provenance', () => {
  const first = createRecordDefaults('FTR'), second = createRecordDefaults('FTR'), mpr = createRecordDefaults('MPR');
  resolve(first, { PATG_NUM: 3 }, 100);
  resolve(second, { PATG_NUM: 9 }, 200);
  resolve(mpr, { OPT_FLAG: 0, UNITS: '\0' }, 300);
  assert.deepEqual(resolve(first, {}, 101), { effective: { PATG_NUM: 3 }, inherited: { PATG_NUM: 100 } });
  assert.deepEqual(resolve(second, {}, 201), { effective: { PATG_NUM: 9 }, inherited: { PATG_NUM: 200 } });
  assert.equal(resolve(mpr, { UNITS: '' }, 301).effective.UNITS, '\0');
});

test('rejects unsupported kinds and invalid source ordinals without initializing defaults', () => {
  assert.throws(() => createRecordDefaults('PTR'), RangeError);
  const resolver = createRecordDefaults('FTR');
  for (const ordinal of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => resolve(resolver, { PATG_NUM: 9 }, ordinal), RangeError);
  resolve(resolver, { PATG_NUM: 2 }, 0);
  assert.equal(resolve(resolver, {}, 1).effective.PATG_NUM, 2);
});

test('all 256 FTR OPT_FLAG combinations exclude only flagged invalid counts and addresses from effective data', () => {
  const fieldsByBit = [['CYCL_CNT'], ['REL_VADR'], ['REPT_CNT'], ['NUM_FAIL'], ['XFAIL_AD', 'YFAIL_AD'], ['VECT_OFF']];
  const resolver = createRecordDefaults('FTR');
  for (let flag = 0; flag <= 255; flag++) {
    const raw = Object.freeze({
      OPT_FLAG: flag, CYCL_CNT: 0, REL_VADR: 100, REPT_CNT: 101, NUM_FAIL: 102,
      XFAIL_AD: -103, YFAIL_AD: -104, VECT_OFF: -2, TEST_FLG: 128, PATG_NUM: 1,
    });
    const before = structuredClone(raw);
    const result = resolve(resolver, raw, flag);
    const bits = [...flag.toString(2).padStart(8, '0')].reverse().map(value => value === '1');
    fieldsByBit.forEach((fields, bit) => {
      for (const field of fields) {
        assert.equal(Object.hasOwn(result.effective, field), !bits[bit], `${field}, OPT_FLAG=${flag}`);
        if (!bits[bit]) assert.equal(result.effective[field], raw[field]);
        assert.equal(Object.hasOwn(result.inherited, field), false);
      }
    });
    assert.equal(result.effective.OPT_FLAG, flag);
    assert.equal(result.effective.TEST_FLG, 128);
    assert.equal(result.effective.PATG_NUM, 1);
    assert.deepEqual(raw, before);
  }
});

test('FTR invalid offset remains unavailable instead of manufacturing a recorded zero; flags do not carry across records', () => {
  const resolver = createRecordDefaults('FTR');
  const first = { OPT_FLAG: 0xff, VECT_OFF: 22, NUM_FAIL: 9, PATG_NUM: 4 };
  const invalid = resolve(resolver, first, 1);
  assert.equal(Object.hasOwn(invalid.effective, 'VECT_OFF'), false);
  assert.equal(Object.hasOwn(invalid.effective, 'NUM_FAIL'), false);
  assert.equal(first.VECT_OFF, 22);
  assert.equal(first.NUM_FAIL, 9);
  const valid = resolve(resolver, { OPT_FLAG: 0xc0, VECT_OFF: 0, NUM_FAIL: 0 }, 2);
  assert.equal(valid.effective.VECT_OFF, 0);
  assert.equal(valid.effective.NUM_FAIL, 0);
  assert.equal(valid.effective.PATG_NUM, 4);
  assert.equal(valid.inherited.PATG_NUM, 1);
  const noPayload = resolve(resolver, {}, 3);
  assert.equal(Object.hasOwn(noPayload.effective, 'VECT_OFF'), false);
  assert.equal(Object.hasOwn(noPayload.effective, 'OPT_FLAG'), false);
});
