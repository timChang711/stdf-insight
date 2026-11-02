import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFailingTestsByPart, buildPartTestMeasurements, getPartTestMeasurements } from '../app/lib/die-inspection.ts';

const measurement = (partIndex, pass, value = 1, coordinates = {}) => ({
  partIndex, pass, value, site: 1, x: 10, y: 20, ...coordinates,
});
const item = (id, values, name = `Synthetic test ${id}`) => ({ id, name, unit: 'V', low: 0, high: 2, values });

test('lists every failing test while keeping a selected passing result separate', () => {
  const longName = `SYNTHETIC_LONG_TEST_NAME_${'a'.repeat(300)}`;
  const selectedTest = item(10, [measurement(7, true)]);
  const tests = [selectedTest, item(20, [measurement(7, false)], longName), item(30, [measurement(7, false)])];
  const failures = buildFailingTestsByPart(tests).get(7);
  assert.deepEqual(failures.map(failure => failure.testId), [20, 30]);
  assert.equal(failures[0].name, longName);
  assert.equal(failures[0].unit, 'V');
  assert.equal(getPartTestMeasurements(selectedTest, 7).latestMeasurement.pass, true);
  assert.deepEqual(getPartTestMeasurements(selectedTest, 7), {
    measurementCount: 1, failureCount: 0, latestMeasurement: selectedTest.values[0],
  });
});

test('preserves earlier failures and exact values when the latest record and overall die pass', () => {
  const part = { index: 8, pass: true, values: { 20: 1 } };
  const values = [measurement(8, true, 1), measurement(8, false, 5), measurement(8, false, 4), measurement(8, true, 1)];
  const testData = item(20, values);
  const failure = buildFailingTestsByPart([testData]).get(part.index)[0];
  assert.equal(failure.measurementCount, 4);
  assert.equal(failure.failureCount, 2);
  assert.strictEqual(failure.firstFailedMeasurement, values[1]);
  assert.strictEqual(failure.lastFailedMeasurement, values[2]);
  assert.strictEqual(failure.latestMeasurement, values[3]);
  assert.equal(part.pass, true);
  assert.deepEqual(getPartTestMeasurements(testData, 8), { measurementCount: 4, failureCount: 2, latestMeasurement: values[3] });
});

test('missing reasons and unsupported record coverage never create a passing explanation', () => {
  const run = { parts: [{ index: 4, pass: false }], tests: [item(10, [measurement(4, true)])], ignoredRecords: { ftr: 3, mpr: 2 } };
  assert.equal(buildFailingTestsByPart(run.tests).get(4), undefined);
  assert.equal(run.parts[0].pass, false);
  assert.deepEqual(run.ignoredRecords, { ftr: 3, mpr: 2 });
  assert.deepEqual(getPartTestMeasurements(run.tests[0], 5), { measurementCount: 0, failureCount: 0, latestMeasurement: null });
  assert.deepEqual(getPartTestMeasurements(undefined, 4), { measurementCount: 0, failureCount: 0, latestMeasurement: null });
});

test('repeated die coordinates remain distinct parser part indices, including index zero', () => {
  const tests = [item(10, [measurement(0, false, 3), measurement(1, true, 1), measurement(2, false, 4)])];
  const failures = buildFailingTestsByPart(tests);
  assert.deepEqual([...failures.keys()], [0, 2]);
  assert.equal(failures.get(1), undefined);
  assert.equal(failures.get(0)[0].lastFailedMeasurement.value, 3);
  assert.equal(failures.get(2)[0].lastFailedMeasurement.value, 4);
  assert.equal(getPartTestMeasurements(tests[0], 1).latestMeasurement.pass, true);
});

test('groups duplicate test IDs once while preserving all recorded failures and later passes', () => {
  const last = measurement(3, true, 1);
  const tests = [item(10, [measurement(3, false, 4)]), item(20, [measurement(3, false, 5)]), item(10, [measurement(3, false, 3), last])];
  const failures = buildFailingTestsByPart(tests).get(3);
  assert.deepEqual(failures.map(failure => failure.testId), [10, 20]);
  assert.equal(failures[0].failureCount, 2);
  assert.equal(failures[0].measurementCount, 3);
  assert.strictEqual(failures[0].latestMeasurement, last);
});

test('retains nonfinite values and recorded flags without deriving a new outcome from limits', () => {
  const values = [measurement(0, false, NaN), measurement(1, false, Infinity), measurement(2, false, -Infinity), measurement(3, true, NaN), measurement(4, true, 100)];
  const source = item(10, values);
  const failures = buildFailingTestsByPart([source]);
  assert.deepEqual([...failures.keys()], [0, 1, 2]);
  for (const index of [0, 1, 2]) assert.strictEqual(failures.get(index)[0].firstFailedMeasurement, values[index]);
  assert.ok(Number.isNaN(failures.get(0)[0].lastFailedMeasurement.value));
  assert.equal(getPartTestMeasurements(source, 3).latestMeasurement.pass, true);
  assert.equal(getPartTestMeasurements(source, 4).latestMeasurement.pass, true);
});

test('handles empty data and does not mutate source data or leak state between runs', () => {
  assert.equal(buildFailingTestsByPart([]).size, 0);
  assert.equal(buildFailingTestsByPart([item(1, [])]).size, 0);
  const values = Object.freeze([Object.freeze(measurement(0, false, 3))]);
  const source = Object.freeze(item(1, values));
  const tests = Object.freeze([source]);
  const first = buildFailingTestsByPart(tests);
  assert.equal(first.get(0)[0].failureCount, 1);
  assert.equal(buildFailingTestsByPart([item(1, [measurement(0, true)])]).size, 0);
  assert.equal(buildFailingTestsByPart(tests).get(0)[0].failureCount, 1);
});

test('selected-test index preserves interleaved repeated results by part and leaves missing parts absent', () => {
  const firstFailure = measurement(0, false, 5);
  const otherFailure = measurement(1, false, 4);
  const laterPass = measurement(0, true, 1);
  const source = item(10, [firstFailure, measurement(1, true, 1), laterPass, otherFailure]);
  const indexed = buildPartTestMeasurements(source);
  assert.equal(indexed.size, 2);
  assert.deepEqual(indexed.get(0), { measurementCount: 2, failureCount: 1, latestMeasurement: laterPass });
  assert.deepEqual(indexed.get(1), { measurementCount: 2, failureCount: 1, latestMeasurement: otherFailure });
  assert.strictEqual(indexed.get(0).latestMeasurement, laterPass);
  assert.equal(indexed.has(2), false);
  assert.equal(indexed.get(2), undefined);
  assert.equal(buildPartTestMeasurements(undefined).size, 0);
  assert.equal(buildPartTestMeasurements(item(20, [])).size, 0);
});

test('selected-test index retains raw nonfinite values, recorded flags and source immutability', () => {
  const values = Object.freeze([
    Object.freeze(measurement(0, false, NaN)),
    Object.freeze(measurement(1, true, Infinity)),
    Object.freeze(measurement(2, false, -Infinity)),
  ]);
  const source = Object.freeze(item(10, values));
  const indexed = buildPartTestMeasurements(source);
  for (const index of [0, 1, 2]) {
    assert.strictEqual(indexed.get(index).latestMeasurement, values[index]);
    assert.equal(indexed.get(index).measurementCount, 1);
  }
  assert.equal(indexed.get(0).failureCount, 1);
  assert.equal(indexed.get(1).failureCount, 0);
  assert.equal(indexed.get(2).failureCount, 1);
  assert.ok(Number.isNaN(indexed.get(0).latestMeasurement.value));
  assert.equal(indexed.get(1).latestMeasurement.value, Infinity);
  assert.equal(indexed.get(2).latestMeasurement.value, -Infinity);
});

// Compact die table: all test kinds remain separate observations on their PRR part.
const { buildDieResultIndex, getDieTestRows, dieTestVerdict, dieTestLimits } = await import('../app/lib/die-results.ts');
const typedObservation = (kind, partIndex, ordinal, verdict = 'pass', effective = {}) => ({
  kind, partIndex, testNumber: 20, head: 1, site: 1,
  record: { ordinal, offset: ordinal * 20, bodyLength: 12, type: 15, subtype: kind === 'FTR' ? 20 : 15 },
  verdict, execution: 'executed', diagnostics: [], raw: {}, effective, present: [], inherited: {},
});

test('die table retains all PTR repetitions and separates parts with identical coordinates', () => {
  const first = measurement(7, false, 3), repeated = measurement(7, true, 1), otherPart = measurement(8, true, 1.5);
  const source = item(10, [first, otherPart, repeated]);
  const index = buildDieResultIndex([source]);
  const rows = getDieTestRows(index, 7);
  assert.equal(rows.length, 2);
  assert.strictEqual(rows[0].measurement, first);
  assert.strictEqual(rows[1].measurement, repeated);
  assert.strictEqual(rows[0].test, source);
  assert.deepEqual(rows.map(dieTestVerdict), ['fail', 'pass']);
  assert.equal(new Set(rows.map(row => row.key)).size, 2);
  assert.equal(getDieTestRows(index, 8).length, 1);
  assert.equal(getDieTestRows(index, 9).length, 0);
});

test('die table preserves FTR/MPR records, UNKNOWN, and source order within a test without cross-part leakage', () => {
  const unknown = typedObservation('FTR', 2, 30, 'unknown');
  unknown.execution = 'not-executed';
  const failed = typedObservation('FTR', 2, 21, 'fail');
  const mpr = typedObservation('MPR', 2, 15, 'pass', { RTN_RSLT: [1, 2, 3], RTN_INDX: [8] });
  const rows = getDieTestRows(buildDieResultIndex([item(10, [measurement(2, true)])]), 2, [unknown, typedObservation('FTR', null, 12), failed, mpr, typedObservation('MPR', 3, 17)]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.kind), ['PTR', 'MPR', 'FTR', 'FTR']);
  assert.deepEqual(rows.map(dieTestVerdict), ['pass', 'pass', 'fail', 'unknown']);
  assert.strictEqual(rows[1].observation, mpr);
  assert.deepEqual(rows[1].observation.effective.RTN_RSLT, [1, 2, 3]);
  assert.deepEqual(rows[1].observation.effective.RTN_INDX, [8]);
  assert.equal(rows[3].observation.execution, 'not-executed');
});

test('die table keeps nonfinite PTR values and existing parser outcome independent', () => {
  const values = [measurement(0, false, NaN), measurement(0, true, Infinity), measurement(0, false, -Infinity)];
  const source = item(10, values);
  const rows = getDieTestRows(buildDieResultIndex([source]), 0);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(dieTestVerdict), ['fail', 'pass', 'fail']);
  assert.ok(Number.isNaN(rows[0].measurement.value));
  assert.equal(rows[1].measurement.value, Infinity);
  assert.equal(rows[2].measurement.value, -Infinity);
  assert.deepEqual(dieTestLimits(rows[0]), { low: 0, high: 2 });
});

test('die table uses only effective MPR limits, retains raw scale, and never applies limits to FTR', () => {
  const mpr = typedObservation('MPR', 0, 4, 'unknown', { RTN_RSLT: [100], RES_SCAL: -3, LO_LIMIT: 10, LLM_SCAL: -3, HI_LIMIT: Infinity });
  mpr.raw = { HI_LIMIT: 200, OPT_FLAG: 0x80 };
  const ftr = typedObservation('FTR', 0, 5, 'fail', { LO_LIMIT: 1, HI_LIMIT: 2 });
  const rows = getDieTestRows(buildDieResultIndex([]), 0, [mpr, ftr]);
  assert.deepEqual(dieTestLimits(rows[0]), { low: 10, high: null });
  assert.deepEqual(dieTestLimits(rows[1]), { low: null, high: null });
  assert.equal(rows[0].observation.effective.RTN_RSLT[0], 100);
  assert.equal(dieTestVerdict(rows[0]), 'unknown');
  assert.equal(dieTestVerdict(rows[1]), 'fail');
});

test('die index handles 100000 measurements once and selected rows retain original references', () => {
  const values = Array.from({ length: 100000 }, (_, index) => measurement(index % 1000, index % 2 === 0, index));
  const tests = [item(42, values), item(1, [measurement(-1, false), measurement(NaN, false)])];
  const indexed = buildDieResultIndex(tests);
  assert.equal(indexed.byPart.size, 1000);
  const rows = getDieTestRows(indexed, 999);
  assert.equal(rows.length, 100);
  assert.strictEqual(rows[99].measurement, values[99999]);
  assert.equal(indexed.byPart.get(999).length, 200);
  assert.equal(getDieTestRows(indexed, -1).length, 0);
});
