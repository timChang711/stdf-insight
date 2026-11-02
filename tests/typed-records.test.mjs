import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { parseStdfFile } from '../app/lib/stdf.ts';
import { readRecordBytes } from '../app/lib/record-source.ts';
import {
  TEST_IDS, createStdfBuilder, scanRecords, ftrOnlyFixture, ftrDefaultsFixture,
  mprDefaultsFixture, mprScanFixture, mprFlagsFixture, defaultOnlyFixture,
  orphanFixture, malformedArrayFixtures,
} from './fixtures/typed-stdf.mjs';

const file = (bytes, name = 'synthetic-typed.stdf') => new File([bytes], name, { lastModified: 1700000000000 });
const parse = (fixture, compressed = false) => parseStdfFile(file(compressed ? gzipSync(fixture.buffer) : fixture.buffer, `${fixture.name}.stdf${compressed ? '.gz' : ''}`));
const observations = (run, kind) => (run.typedTests ?? []).filter(item => !kind || item.kind === kind).flatMap(item => item.observations).sort((a, b) => a.record.ordinal - b.record.ordinal);
const associated = (run, kind) => observations(run, kind).filter(item => item.partIndex !== null);
const legacyPart = ({ index, site, hardBin, softBin, pass, x, y, testTimeMs, values, firstFailTestId }) => ({ index, site, hardBin, softBin, pass, x, y, testTimeMs, values, firstFailTestId });
const bitIndexes = value => {
  if (!value) return [];
  return Array.from({ length: value.bitCount }, (_, index) => index).filter(index => value.bytes[index >> 3] & (1 << (index % 8)));
};

for (const little of [true, false]) {
  const order = little ? 'little endian' : 'big endian';
  test(`FTR-only ${order}: six real parts, one test, seven original observations and recorded outcomes`, async () => {
    const fixture = ftrOnlyFixture({ little }), run = await parse(fixture);
    assert.equal(run.parts.length, 6);
    assert.deepEqual(run.tests, [], 'functional results must not become synthetic numeric PTR tests');
    assert.equal(run.typedTests.length, 1);
    assert.equal(run.typedTests[0].kind, 'FTR');
    assert.equal(run.typedTests[0].number, TEST_IDS.ftr);
    const rows = associated(run, 'FTR');
    assert.equal(rows.length, 7);
    assert.deepEqual(rows.map(row => row.partIndex), [0, 1, 2, 3, 4, 5, 5]);
    assert.deepEqual(rows.map(row => row.raw.TEST_FLG), [0, 128, 16, 192, 2, 128, 0]);
    assert.deepEqual(rows.map(row => row.verdict), ['pass', 'fail', 'unknown', 'unknown', 'pass', 'fail', 'pass']);
    assert.equal(rows[2].execution, 'not-executed');
    assert.match(rows[4].diagnostics.join(' '), /reserved.*1/i);
    assert.equal(rows[4].diagnostics.includes('invalid-result'), false);
    assert.deepEqual(rows[1].raw.RTN_INDX, [10, 11, 12]);
    assert.deepEqual(rows[1].raw.RTN_STAT, [0, 5, 10]);
    assert.deepEqual(bitIndexes(rows[1].raw.FAIL_PIN), [11, 12]);
    assert.deepEqual(run.parts.map(part => part.rawFlags), [0, 8, 0, 8, 0, 0]);
    assert.deepEqual(run.parts.map(part => part.recordedVerdict), ['pass', 'fail', 'pass', 'fail', 'pass', 'pass']);
    assert.ok(run.parts.every(part => part.head === 1 && part.record.type === 5 && part.record.subtype === 20));
  });

  test(`MPR-only ${order}: independent state/result counts, original identity and one-record default overrides`, async () => {
    const fixture = mprDefaultsFixture({ little }), run = await parse(fixture);
    assert.equal(run.parts.length, 4);
    assert.deepEqual(run.tests, [], 'result arrays do not create synthetic PTR test IDs');
    assert.equal(run.typedTests.length, 1);
    assert.equal(run.typedTests[0].kind, 'MPR');
    assert.equal(run.typedTests[0].number, TEST_IDS.mpr);
    const all = observations(run, 'MPR'), defaults = all.find(row => row.execution === 'not-executed');
    assert.equal(all.length, 5);
    assert.ok(defaults);
    assert.equal(defaults.partIndex, null);
    assert.equal(defaults.verdict, 'unknown');
    const rows = associated(run, 'MPR');
    assert.deepEqual(rows.map(row => row.partIndex), [0, 1, 2, 3]);
    assert.deepEqual(rows.map(row => row.raw.RTN_ICNT), fixture.expected.returnCounts);
    assert.deepEqual(rows.map(row => row.raw.RSLT_CNT), fixture.expected.resultCounts);
    assert.deepEqual(rows.map(row => row.raw.RTN_RSLT), fixture.expected.resultArrays);
    assert.ok(rows.every(row => row.raw.TEST_NUM === TEST_IDS.mpr));
    assert.deepEqual(rows.map(row => row.effective.RES_SCAL), [-3, -6, -3, -3]);
    assert.deepEqual(rows.map(row => row.effective.UNITS), ['V', 'A', 'V', 'V']);
    assert.deepEqual(rows.map(row => row.effective.LLM_SCAL), [-3, -6, -3, -3]);
    assert.deepEqual(rows.map(row => row.effective.HLM_SCAL), [-3, -6, -3, -3]);
    assert.deepEqual(rows.map(row => row.effective.RTN_INDX), fixture.expected.effectiveReturnIndexes);
    assert.deepEqual(rows.map(row => ({ start: row.effective.START_IN, increment: row.effective.INCR_IN })), fixture.expected.effectiveScan);
    for (const index of [0, 2, 3]) {
      assert.equal(rows[index].present.includes('RES_SCAL'), false);
      assert.equal(rows[index].raw.RES_SCAL, undefined);
      assert.equal(rows[index].inherited.RES_SCAL, defaults.record.ordinal);
      assert.equal(rows[index].inherited.UNITS, defaults.record.ordinal);
    }
    assert.equal(rows[1].present.includes('RES_SCAL'), true);
    assert.equal(rows[1].inherited.RES_SCAL, undefined);
    assert.deepEqual(rows[0].raw.RTN_STAT, [0, 5, 10]);
    assert.equal(rows[3].verdict, 'fail');
  });

  test(`FTR ${order}: only PATG_NUM/SPIN_MAP defaults inherit, local override does not leak`, async () => {
    const run = await parse(ftrDefaultsFixture({ little }));
    assert.equal(run.parts.length, 4);
    const rows = associated(run, 'FTR');
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.slice(0, 3).map(row => row.effective.PATG_NUM), [7, 12, 7]);
    assert.deepEqual(rows.slice(0, 3).map(row => bitIndexes(row.effective.SPIN_MAP)), [[10, 11, 12, 13, 14], [11], [10, 11, 12, 13, 14]]);
    assert.equal(rows[2].raw.PATG_NUM, undefined);
    assert.equal(rows[2].inherited.PATG_NUM, rows[0].record.ordinal);
    assert.equal(rows[2].inherited.SPIN_MAP, rows[0].record.ordinal);
    assert.equal(rows[3].record.bodyLength, 7);
    assert.deepEqual(rows[3].present, ['TEST_NUM', 'HEAD_NUM', 'SITE_NUM', 'TEST_FLG']);
    assert.equal(rows[3].raw.OPT_FLAG, undefined);
    assert.equal(rows[3].raw.CYCL_CNT, undefined);
  });

  test(`MPR ${order}: scans without pin arrays and legal missing zero-count tails`, async () => {
    const run = await parse(mprScanFixture({ little })), rows = associated(run, 'MPR');
    assert.equal(run.parts.length, 2);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].raw.RTN_ICNT, 0);
    assert.equal(rows[0].raw.RSLT_CNT, 5);
    assert.deepEqual(rows[0].raw.RTN_RSLT, [.1, .2, .3, .4, .5].map(Math.fround));
    assert.deepEqual(rows[0].raw.RTN_STAT, []);
    assert.equal(rows[0].effective.START_IN, 2);
    assert.equal(rows[0].effective.INCR_IN, -.5);
    assert.deepEqual(rows[0].raw.RTN_RSLT.map((_, index) => rows[0].effective.START_IN + rows[0].effective.INCR_IN * index), [2, 1.5, 1, .5, 0]);
    assert.equal(rows[1].record.bodyLength, 8);
    assert.equal(rows[1].raw.RTN_ICNT, undefined);
    assert.equal(rows[1].raw.RSLT_CNT, undefined);
    assert.equal(rows[1].execution, 'not-executed');
    assert.equal(rows[1].verdict, 'unknown');
  });
}

test('PMR optional names and unresolved pin indexes remain distinguishable', async () => {
  const run = await parse(mprDefaultsFixture()), pins = new Map(run.pins.map(pin => [pin.index, pin]));
  assert.equal(pins.get(10).logicalName, 'SYNTHETIC_SUPPLY_A');
  assert.equal(pins.get(10).physicalName, 'P1');
  assert.equal(pins.get(10).channelName, 'SYNTHETIC_CHANNEL_A');
  assert.equal(pins.get(11).physicalName, 'P2');
  assert.equal(pins.get(12).channelName, 'SYNTHETIC_CHANNEL_C');
  assert.equal(pins.get(13).logicalName ?? '', '');
  assert.equal(pins.get(13).physicalName ?? '', '');
  assert.equal(pins.get(13).head ?? 1, 1);
  assert.equal(pins.get(13).site ?? 1, 1);
  assert.equal(pins.has(15), false);
  assert.deepEqual(associated(run, 'MPR')[1].effective.RTN_INDX, [13, 14, 15]);
  const unnamed = await parse(mprDefaultsFixture({ pins: false }));
  assert.deepEqual(unnamed.pins ?? [], []);
  assert.deepEqual(associated(unnamed, 'MPR')[0].effective.RTN_INDX, [10, 11, 12]);
});

test('interleaved head/site execution records attach to PRR order, not coordinates or site alone', async () => {
  const writer = createStdfBuilder();
  writer.pir({ head: 1, site: 1 }); writer.pir({ head: 2, site: 1 }); writer.pir({ head: 1, site: 2 });
  writer.ftr({ head: 2, site: 1, testFlag: 128 });
  writer.mpr({ head: 1, site: 2, testNumber: TEST_IDS.ftr });
  writer.ftr({ head: 1, site: 1, testFlag: 0 });
  writer.prr({ head: 1, site: 2, flag: 0x18, hardBin: 11, softBin: 21, x: 7, y: 7 });
  writer.prr({ head: 2, site: 1, flag: 0x08, hardBin: 12, softBin: 22, x: 7, y: 7 });
  writer.prr({ head: 1, site: 1, flag: 0, hardBin: 13, softBin: 23, x: 7, y: 7 });
  const run = await parseStdfFile(file(writer.bytes()));
  assert.equal(run.parts.length, 3);
  assert.deepEqual(run.parts.map(part => [part.head, part.site, part.rawFlags, part.recordedVerdict, part.pass]), [[1, 2, 24, 'unknown', false], [2, 1, 8, 'fail', false], [1, 1, 0, 'pass', true]]);
  assert.deepEqual(run.parts.map(part => [part.hardBin, part.softBin]), [[11, 21], [12, 22], [13, 23]]);
  assert.deepEqual(observations(run).map(row => [row.head, row.site, row.partIndex, row.kind]), [[2, 1, 1, 'FTR'], [1, 2, 0, 'MPR'], [1, 1, 2, 'FTR']]);
  assert.equal(run.typedTests.length, 2, 'same numeric TEST_NUM across record kinds keeps two typed identities');
  assert.equal(new Set(run.typedTests.map(item => item.key)).size, 2);
});

test('MPR recorded outcome remains separate from in-limit values and reserved/reliability flags', async () => {
  const run = await parse(mprFlagsFixture()), rows = associated(run, 'MPR');
  assert.equal(run.parts.length, 6);
  assert.deepEqual(rows.map(row => row.verdict), ['pass', 'fail', 'unknown', 'unknown', 'pass', 'pass']);
  assert.deepEqual(rows[1].raw.RTN_RSLT, [1, 2, 3]);
  assert.equal(rows[1].verdict, 'fail', 'recorded FAIL must not become PASS through limit comparisons');
  assert.match(rows[4].diagnostics.join(' '), /reserved.*1/);
  assert.equal(rows[4].diagnostics.includes('invalid-result'), false);
  assert.match(rows[5].diagnostics.join(' '), /unreliable/);
});

test('new typed observations do not alter legacy PTR values, statistics inputs or PRR booleans', async () => {
  const fixture = ftrOnlyFixture({ includePtr: true });
  const { records } = scanRecords(fixture.buffer);
  const legacyBytes = Buffer.concat(records.filter(record => !(record.type === 15 && record.sub === 20)).map(record => fixture.buffer.subarray(record.offset, record.offset + 4 + record.body.length)));
  const mixed = await parse(fixture), legacy = await parseStdfFile(file(legacyBytes));
  assert.deepEqual(mixed.tests, legacy.tests);
  assert.deepEqual(mixed.parts.map(legacyPart), legacy.parts.map(legacyPart));
  assert.equal(mixed.tests.length, 1);
  assert.equal(mixed.tests[0].id, TEST_IDS.ptr);
  assert.deepEqual(mixed.tests[0].values.map(row => row.value), [1, 1.1, 1.2, 1.3, 1.4, 1.5].map(Math.fround));
  assert.equal(associated(mixed, 'FTR').length, 7);
});

test('default-only metadata creates no parts or executed observations', async () => {
  let run;
  try { run = await parse(defaultOnlyFixture()); }
  catch (error) {
    assert.match(error.message, /no .*part|no .*PRR|no .*data|no .*measurement/i);
    return;
  }
  assert.equal(run.parts.length, 0);
  assert.ok(run.tests.every(item => item.values.length === 0));
  assert.equal(observations(run).filter(row => row.execution === 'executed').length, 0);
  assert.ok(observations(run).every(row => row.partIndex === null));
});

test('orphan functional/multiple-result executions never attach to a nearby real part', async () => {
  const run = await parse(orphanFixture());
  assert.equal(run.parts.length, 1);
  assert.equal(associated(run).length, 0);
  assert.equal(observations(run, 'FTR').length, 2);
  assert.equal(observations(run, 'MPR').length, 1);
  assert.equal(run.tests.length, 1);
  assert.equal(run.tests[0].id, TEST_IDS.ptr);
  assert.equal(run.tests[0].values.length, 1);
  assert.ok(run.recordDiagnostics.some(item => /orphan|outside|unassociated|unpaired/i.test(`${item.code} ${item.message}`)));
});

test('typed defaults do not leak across successive parse calls', async () => {
  await parse(mprDefaultsFixture());
  const writer = createStdfBuilder(); writer.pir();
  writer.mpr({ testNumber: TEST_IDS.mpr, returnStates: [], returnIndexes: [], results: [2], lastField: 'RTN_RSLT' }); writer.prr();
  const run = await parseStdfFile(file(writer.bytes())), row = associated(run, 'MPR')[0];
  assert.notEqual(row.effective.RES_SCAL, -3);
  assert.notEqual(row.effective.UNITS, 'V');
  assert.deepEqual(row.inherited, {});
});

for (const little of [true, false]) {
  for (const fixture of malformedArrayFixtures({ little })) test(`${fixture.name} ${little ? 'LE' : 'BE'} rejects incomplete arrays`, async () => {
    await assert.rejects(parse(fixture), /MPR|FTR|truncat|incomplete|need .*bytes/i);
  });
}

test('gzip typed populations and source bytes equal the original uncompressed stream', async () => {
  const fixture = mprDefaultsFixture({ little: false }), plain = await parse(fixture), compressed = await parse(fixture, true);
  assert.deepEqual(compressed.typedTests, plain.typedTests);
  assert.deepEqual(compressed.pins, plain.pins);
  assert.deepEqual(compressed.parts, plain.parts);
  for (const row of observations(compressed)) {
    const bytes = await readRecordBytes(compressed, row.record);
    const expected = fixture.buffer.subarray(row.record.offset, row.record.offset + 4 + row.record.bodyLength);
    assert.deepEqual(Buffer.from(bytes), expected);
    assert.equal(bytes[2], 15); assert.equal(bytes[3], 15);
    assert.equal(bytes.length, row.record.bodyLength + 4);
    assert.equal(Buffer.from(bytes).readUInt16BE(0), row.record.bodyLength);
  }
  for (const part of compressed.parts) {
    const bytes = await readRecordBytes(compressed, part.record);
    assert.equal(bytes[2], 5); assert.equal(bytes[3], 20);
  }
  for (const pin of compressed.pins) {
    const bytes = await readRecordBytes(compressed, pin.record);
    assert.equal(bytes[2], 1); assert.equal(bytes[3], 60);
  }
});

test('source-byte reads return independent copies and enforce cancellation/reference bounds', async () => {
  const fixture = ftrOnlyFixture(), run = await parse(fixture), row = observations(run)[0];
  const first = await readRecordBytes(run, row.record), original = first[0];
  first[0] ^= 255;
  assert.equal((await readRecordBytes(run, row.record))[0], original);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readRecordBytes(run, row.record, controller.signal), { name: 'AbortError' });
  await assert.rejects(readRecordBytes(run, { ...row.record, offset: -1 }), /outside/);
  await assert.rejects(readRecordBytes(run, { ...row.record, bodyLength: fixture.buffer.length }), /outside/);
  await assert.rejects(readRecordBytes(run, { ...row.record, type: 254 }), /does not match/);
});

test('functional-only gzip retains both observations for a repeated test and exact FTR bytes', async () => {
  const fixture = ftrOnlyFixture(), plain = await parse(fixture), compressed = await parse(fixture, true);
  assert.deepEqual(compressed.typedTests, plain.typedTests);
  assert.deepEqual(compressed.parts, plain.parts);
  assert.equal(associated(compressed, 'FTR').filter(row => row.partIndex === 5).length, 2);
  for (const row of observations(compressed, 'FTR')) {
    const bytes = Buffer.from(await readRecordBytes(compressed, row.record));
    assert.deepEqual(bytes, fixture.buffer.subarray(row.record.offset, row.record.offset + row.record.bodyLength + 4));
    assert.equal(bytes.readUInt16LE(0), row.record.bodyLength);
    assert.equal(bytes.readUInt32LE(4), TEST_IDS.ftr);
  }
});

test('identical FTR/MPR bodies share immutable templates while preserving each record and part identity', async () => {
  const writer = createStdfBuilder();
  for (let index = 0; index < 3; index++) {
    writer.pir(); writer.ftr(); writer.mpr(); writer.prr({ tests: 2, x: index });
  }
  const bytes = writer.bytes(), run = await parseStdfFile(file(bytes));
  for (const kind of ['FTR', 'MPR']) {
    const rows = associated(run, kind);
    assert.equal(rows.length, 3);
    assert.strictEqual(rows[0].raw, rows[1].raw);
    assert.strictEqual(rows[0].effective, rows[1].effective);
    assert.strictEqual(rows[0].present, rows[1].present);
    assert.notStrictEqual(rows[0].record, rows[1].record);
    assert.notEqual(rows[0].record.offset, rows[1].record.offset);
    assert.notEqual(rows[0].record.ordinal, rows[1].record.ordinal);
    assert.deepEqual(rows.map(row => row.partIndex), [0, 1, 2]);
    assert.notStrictEqual(rows[0].diagnostics, rows[1].diagnostics);
    for (const row of rows) assert.deepEqual(Buffer.from(await readRecordBytes(run, row.record)), bytes.subarray(row.record.offset, row.record.offset + row.record.bodyLength + 4));
  }
  const nextRun = await parseStdfFile(file(bytes));
  assert.notStrictEqual(observations(nextRun)[0].raw, observations(run)[0].raw);
  assert.notStrictEqual(observations(nextRun)[0].effective, observations(run)[0].effective);
});

test('body-template reuse never merges a distinct local override into the original MPR values', async () => {
  const writer = createStdfBuilder();
  for (let index = 0; index < 3; index++) {
    writer.pir();
    writer.mpr(index === 1 ? { resultScale: -6, units: 'A', results: [10, 20, 30, 40] } : {});
    writer.prr({ x: index });
  }
  const run = await parseStdfFile(file(writer.bytes())), rows = associated(run, 'MPR');
  assert.strictEqual(rows[0].raw, rows[2].raw);
  assert.strictEqual(rows[0].effective, rows[2].effective);
  assert.notStrictEqual(rows[0].raw, rows[1].raw);
  assert.notStrictEqual(rows[0].effective, rows[1].effective);
  assert.deepEqual(rows.map(row => row.effective.RES_SCAL), [-3, -6, -3]);
  assert.deepEqual(rows.map(row => row.effective.UNITS), ['V', 'A', 'V']);
  assert.deepEqual(rows.map(row => row.raw.RTN_RSLT), [[1000, 2000, 3000, 4000], [10, 20, 30, 40], [1000, 2000, 3000, 4000]]);
  assert.deepEqual(rows.map(row => row.partIndex), [0, 1, 2]);
});
