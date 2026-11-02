/**
 * Synthetic STDF V4 integration fixtures. No external/company data or dependencies.
 * Layout authority: artifacts/Stdf-V4-spec.txt pp 8-9, 27, 45-49, 51-59.
 * This builder encodes raw records; outcome policy belongs to the parser/model.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const TEST_IDS = Object.freeze({ ftr: 420000, mpr: 620000, scan: 620010, ptr: 120000 });

export function createStdfBuilder({ little = true } = {}) {
  const chunks = [];
  const scalar = (size, littleMethod, bigMethod, value) => {
    const bytes = Buffer.alloc(size);
    bytes[little ? littleMethod : bigMethod](value);
    return bytes;
  };
  const u1 = value => scalar(1, 'writeUInt8', 'writeUInt8', value);
  const i1 = value => scalar(1, 'writeInt8', 'writeInt8', value);
  const u2 = value => scalar(2, 'writeUInt16LE', 'writeUInt16BE', value);
  const i2 = value => scalar(2, 'writeInt16LE', 'writeInt16BE', value);
  const u4 = value => scalar(4, 'writeUInt32LE', 'writeUInt32BE', value);
  const i4 = value => scalar(4, 'writeInt32LE', 'writeInt32BE', value);
  const r4 = value => scalar(4, 'writeFloatLE', 'writeFloatBE', value);
  const cn = (value = '') => {
    const bytes = Buffer.from(value, 'ascii');
    assert.ok(bytes.length <= 255, 'C*n supports up to 255 bytes');
    return Buffer.concat([u1(bytes.length), bytes]);
  };
  const nibbles = values => {
    const packed = Buffer.alloc(Math.ceil(values.length / 2));
    values.forEach((value, index) => {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 15);
      packed[index >> 1] |= value << ((index % 2) * 4);
    });
    return packed;
  };
  const bits = (setIndexes = [], bitCount = Math.max(-1, ...setIndexes) + 1) => {
    assert.ok(Number.isInteger(bitCount) && bitCount >= 0 && bitCount <= 65535);
    const packed = Buffer.alloc(Math.ceil(bitCount / 8));
    for (const index of setIndexes) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < bitCount);
      packed[index >> 3] |= 1 << (index % 8);
    }
    return Buffer.concat([u2(bitCount), packed]);
  };
  const concatenate = fields => Buffer.concat(fields);
  const through = (fields, last) => {
    if (last === undefined) return concatenate(fields.map(([, value]) => value));
    const index = fields.findIndex(([name]) => name === last);
    assert.ok(index >= 0, `Unknown field ${last}`);
    return concatenate(fields.slice(0, index + 1).map(([, value]) => value));
  };
  const record = (type, sub, body) => {
    assert.ok(body.length <= 65535);
    const bytes = concatenate([u2(body.length), u1(type), u1(sub), body]);
    chunks.push(bytes);
    return bytes;
  };

  const ftrBody = (options = {}) => {
    const {
      testNumber = TEST_IDS.ftr, head = 1, site = 1, testFlag = 0,
      optFlag = 0xc0, cycles = 12345, relativeAddress = 0x12345678,
      repeatCount = 2, failCount = 0, xFail = -7, yFail = 11, vectorOffset = -2,
      returnIndexes = [10, 11, 12], returnStates = [0, 1, 2],
      programIndexes = [13, 14], programStates = [1, 7],
      failPins = [], failPinCount = 13,
      vectorName = 'SYNTHETIC_VECTOR_001', timeSet = 'SYNTHETIC_TS', opCode = 'COMPARE',
      name = 'SYNTHETIC_FUNCTIONAL_TEST', alarmId = '', programText = 'SYNTHETIC_PROGRAM', resultText = '',
      patternGenerator = 7, enabledComparators = [10, 11, 12, 13, 14], comparatorBitCount = 15,
      lastField,
    } = options;
    assert.equal(returnIndexes.length, returnStates.length);
    assert.equal(programIndexes.length, programStates.length);
    return through([
      ['TEST_NUM', u4(testNumber)], ['HEAD_NUM', u1(head)], ['SITE_NUM', u1(site)], ['TEST_FLG', u1(testFlag)],
      ['OPT_FLAG', u1(optFlag)], ['CYCL_CNT', u4(cycles)], ['REL_VADR', u4(relativeAddress)],
      ['REPT_CNT', u4(repeatCount)], ['NUM_FAIL', u4(failCount)], ['XFAIL_AD', i4(xFail)], ['YFAIL_AD', i4(yFail)],
      ['VECT_OFF', i2(vectorOffset)], ['RTN_ICNT', u2(returnIndexes.length)], ['PGM_ICNT', u2(programIndexes.length)],
      ['RTN_INDX', concatenate(returnIndexes.map(u2))], ['RTN_STAT', nibbles(returnStates)],
      ['PGM_INDX', concatenate(programIndexes.map(u2))], ['PGM_STAT', nibbles(programStates)],
      ['FAIL_PIN', bits(failPins, failPinCount)], ['VECT_NAM', cn(vectorName)], ['TIME_SET', cn(timeSet)],
      ['OP_CODE', cn(opCode)], ['TEST_TXT', cn(name)], ['ALARM_ID', cn(alarmId)],
      ['PROG_TXT', cn(programText)], ['RSLT_TXT', cn(resultText)], ['PATG_NUM', u1(patternGenerator)],
      ['SPIN_MAP', bits(enabledComparators, comparatorBitCount)],
    ], lastField);
  };

  const mprBody = (options = {}) => {
    const {
      testNumber = TEST_IDS.mpr, head = 1, site = 1, testFlag = 0, paramFlag = 0xc0,
      returnStates = [0, 5, 10], results = [1000, 2000, 3000, 4000],
      name = 'SYNTHETIC_MULTIPLE_RESULT_TEST', alarmId = '', optFlag = 0,
      resultScale = -3, lowScale = -3, highScale = -3, low = 1000, high = 4000,
      startIn = .5, incrementIn = .25, returnIndexes = [10, 11, 12],
      units = 'V', inputUnits = 'V', resultFormat = '%7.3f', lowFormat = '%7.3f', highFormat = '%7.3f',
      lowSpec = 900, highSpec = 4100, lastField,
    } = options;
    assert.equal(returnIndexes.length, returnStates.length, 'RTN_INDX and RTN_STAT use RTN_ICNT, not RSLT_CNT');
    return through([
      ['TEST_NUM', u4(testNumber)], ['HEAD_NUM', u1(head)], ['SITE_NUM', u1(site)],
      ['TEST_FLG', u1(testFlag)], ['PARM_FLG', u1(paramFlag)],
      ['RTN_ICNT', u2(returnStates.length)], ['RSLT_CNT', u2(results.length)],
      ['RTN_STAT', nibbles(returnStates)], ['RTN_RSLT', concatenate(results.map(r4))],
      ['TEST_TXT', cn(name)], ['ALARM_ID', cn(alarmId)], ['OPT_FLAG', u1(optFlag)],
      ['RES_SCAL', i1(resultScale)], ['LLM_SCAL', i1(lowScale)], ['HLM_SCAL', i1(highScale)],
      ['LO_LIMIT', r4(low)], ['HI_LIMIT', r4(high)], ['START_IN', r4(startIn)], ['INCR_IN', r4(incrementIn)],
      ['RTN_INDX', concatenate(returnIndexes.map(u2))], ['UNITS', cn(units)], ['UNITS_IN', cn(inputUnits)],
      ['C_RESFMT', cn(resultFormat)], ['C_LLMFMT', cn(lowFormat)], ['C_HLMFMT', cn(highFormat)],
      ['LO_SPEC', r4(lowSpec)], ['HI_SPEC', r4(highSpec)],
    ], lastField);
  };

  const ptrBody = (options = {}) => {
    const { testNumber = TEST_IDS.ptr, head = 1, site = 1, testFlag = 0, paramFlag = 0xc0,
      value = 2, name = 'SYNTHETIC_SINGLE_PARAMETRIC', alarmId = '', optFlag = 0,
      resultScale = 0, lowScale = 0, highScale = 0, low = 0, high = 4, units = 'V', lastField } = options;
    return through([
      ['TEST_NUM', u4(testNumber)], ['HEAD_NUM', u1(head)], ['SITE_NUM', u1(site)],
      ['TEST_FLG', u1(testFlag)], ['PARM_FLG', u1(paramFlag)], ['RESULT', r4(value)],
      ['TEST_TXT', cn(name)], ['ALARM_ID', cn(alarmId)], ['OPT_FLAG', u1(optFlag)],
      ['RES_SCAL', i1(resultScale)], ['LLM_SCAL', i1(lowScale)], ['HLM_SCAL', i1(highScale)],
      ['LO_LIMIT', r4(low)], ['HI_LIMIT', r4(high)], ['UNITS', cn(units)],
      ['C_RESFMT', cn('%7.3f')], ['C_LLMFMT', cn('%7.3f')], ['C_HLMFMT', cn('%7.3f')],
      ['LO_SPEC', r4(low)], ['HI_SPEC', r4(high)],
    ], lastField);
  };

  const api = {
    little, record, ftrBody, mprBody, ptrBody,
    ftr: options => record(15, 20, ftrBody(options)),
    mpr: options => record(15, 15, mprBody(options)),
    ptr: options => record(15, 10, ptrBody(options)),
    pir: ({ head = 1, site = 1 } = {}) => record(5, 10, concatenate([u1(head), u1(site)])),
    prr: ({ head = 1, site = 1, flag = 0, tests = 1, hardBin = 1, softBin = 1, x = 0, y = 0, time = 100, partId = '' } = {}) => record(5, 20, concatenate([
      u1(head), u1(site), u1(flag), u2(tests), u2(hardBin), u2(softBin), i2(x), i2(y), u4(time), cn(partId), cn(''), u1(0),
    ])),
    pmr: ({ index = 10, channelType = 0, channelName = '', physicalName = '', logicalName = '', head = 1, site = 1, lastField } = {}) => record(1, 60, through([
      ['PMR_INDX', u2(index)], ['CHAN_TYP', u2(channelType)], ['CHAN_NAM', cn(channelName)],
      ['PHY_NAM', cn(physicalName)], ['LOG_NAM', cn(logicalName)], ['HEAD_NUM', u1(head)], ['SITE_NUM', u1(site)],
    ], lastField)),
    bytes: () => concatenate(chunks),
  };
  // CPU_TYPE 2 is little endian IEEE; CPU_TYPE 1 is big endian IEEE.
  record(0, 10, concatenate([u1(little ? 2 : 1), u1(4)]));
  return api;
}

function addPins(writer) {
  writer.pmr({ index: 10, channelName: 'SYNTHETIC_CHANNEL_A', physicalName: 'P1', logicalName: 'SYNTHETIC_SUPPLY_A' });
  writer.pmr({ index: 11, physicalName: 'P2' });
  writer.pmr({ index: 12, channelName: 'SYNTHETIC_CHANNEL_C' });
  writer.pmr({ index: 13, lastField: 'PMR_INDX' }); // all names/head/site omitted
  writer.pmr({ index: 14, logicalName: 'SYNTHETIC_ALT_B' });
  // Index 15 deliberately has no PMR: callers must retain its numeric identity.
}

export function ftrOnlyFixture({ little = true, includePtr = false, pins = true } = {}) {
  const writer = createStdfBuilder({ little });
  if (pins) addPins(writer);
  const flags = [0x00, 0x80, 0x10, 0xc0, 0x02, 0x80];
  flags.forEach((testFlag, index) => {
    const site = index % 2 + 1;
    writer.pir({ site });
    const failedPins = testFlag & 0x80 ? [11, 12] : [];
    const data = testFlag & 0x10
      ? { optFlag: 0xff, returnIndexes: [], returnStates: [], programIndexes: [], programStates: [], failPins: [], failPinCount: 0 }
      : { returnStates: testFlag & 0x80 ? [0, 5, 10] : [0, 1, 2], failPins: failedPins };
    writer.ftr({ ...data, site, testFlag, failCount: failedPins.length, resultText: `SYNTHETIC_PART_${index + 1}` });
    if (index === 5) writer.ftr({ site, testFlag: 0, failCount: 0, resultText: 'SYNTHETIC_LATER_PASS', lastField: 'RSLT_TXT' });
    if (includePtr) writer.ptr({ site, value: 1 + index / 10 });
    const flag = [1, 3].includes(index) ? 8 : 0;
    writer.prr({ site, flag, tests: index === 5 ? 2 + Number(includePtr) : 1 + Number(includePtr), hardBin: flag ? 5 : 1, softBin: flag ? 7 : 1, x: index, partId: `SYNTHETIC_FTR_PART_${index + 1}` });
  });
  return {
    name: includePtr ? 'mixed-ptr-ftr' : 'ftr-only', buffer: writer.bytes(),
    expected: { partCount: 6, testNumbers: includePtr ? [TEST_IDS.ftr, TEST_IDS.ptr] : [TEST_IDS.ftr], ftrRecordCount: 7, ptrRecordCount: includePtr ? 6 : 0,
      flagsByPart: [[0], [128], [16], [192], [2], [128, 0]],
      notes: ['0xc0 means bit7 FAIL indication is invalid; do not count it as a known failure.', '0x02 exercises reserved bit1 and must not be treated as the PTR invalid-result flag.', 'Part6 has two FTR records for one TEST_NUM, not two tests or parts.'] },
  };
}

export function mprDefaultsFixture({ little = true, pins = true } = {}) {
  const writer = createStdfBuilder({ little });
  if (pins) addPins(writer);
  writer.mpr({ testFlag: 0x10, paramFlag: 0, results: [], returnStates: [0, 1, 2], name: 'SYNTHETIC_MPR_DEFAULTS' });
  const values = [[1000, 2000, 3000, 4000], [1000, 2000, 3000, 4000], [1500, 2500, 3500], [500, 4500]];
  values.forEach((results, index) => {
    writer.pir();
    const base = { results, returnStates: [0, 5, 10], name: '', alarmId: '', testFlag: index === 3 ? 0x80 : 0, paramFlag: index === 3 ? 0xd8 : 0xc0 };
    if (index === 1) writer.mpr({ ...base, resultScale: -6, lowScale: -6, highScale: -6, units: 'A', inputUnits: 'mV', startIn: 2, incrementIn: -.5, returnIndexes: [13, 14, 15], resultFormat: '%9.6f', lowFormat: '%9.6f', highFormat: '%9.6f' });
    else writer.mpr({ ...base, lastField: 'RTN_RSLT' });
    writer.prr({ tests: 1, flag: index === 3 ? 8 : 0, x: index, hardBin: index === 3 ? 5 : 1, partId: `SYNTHETIC_MPR_PART_${index + 1}` });
  });
  return {
    name: pins ? 'mpr-defaults-local-override' : 'mpr-defaults-without-pmr', buffer: writer.bytes(),
    expected: { partCount: 4, testNumbers: [TEST_IDS.mpr], mprRecordCount: 5, defaultOnlyCount: 1,
      returnCounts: [3, 3, 3, 3], resultCounts: [4, 4, 3, 2], resultArrays: values,
      effectiveResultScales: [-3, -6, -3, -3], effectiveUnits: ['V', 'A', 'V', 'V'],
      effectiveReturnIndexes: [[10, 11, 12], [13, 14, 15], [10, 11, 12], [10, 11, 12]],
      effectiveScan: [{ start: .5, increment: .25 }, { start: 2, increment: -.5 }, { start: .5, increment: .25 }, { start: .5, increment: .25 }],
      notes: ['First nonexecuted MPR defines defaults and does not create a part or measurement.', 'Local override must not replace defaults for the following omitted tail.', 'RTN_ICNT=3 and RSLT_CNT=4 are intentionally different. No synthetic test-number increment or guessed pin mapping.'] },
  };
}

export function mprScanFixture({ little = true } = {}) {
  const writer = createStdfBuilder({ little });
  writer.pir();
  writer.mpr({ testNumber: TEST_IDS.scan, returnStates: [], returnIndexes: [], results: [.1, .2, .3, .4, .5], resultScale: 0, lowScale: 0, highScale: 0, low: 0, high: 1, lowSpec: 0, highSpec: 1, startIn: 2, incrementIn: -.5, inputUnits: 'V', name: 'SYNTHETIC_MPR_SCAN_WITHOUT_PINS' });
  writer.prr({ partId: 'SYNTHETIC_SCAN_PART' });
  writer.pir();
  writer.mpr({ testNumber: TEST_IDS.scan + 1, testFlag: 0x10, paramFlag: 0, returnStates: [], returnIndexes: [], results: [], lastField: 'PARM_FLG' });
  writer.prr({ x: 1, partId: 'SYNTHETIC_EMPTY_RESULT_PART' });
  return { name: 'mpr-scan-zero-return-states', buffer: writer.bytes(), expected: { partCount: 2, testNumbers: [TEST_IDS.scan, TEST_IDS.scan + 1], mprRecordCount: 2, returnCounts: [0, 0], resultCounts: [5, 0], scanInputs: [2, 1.5, 1, .5, 0], notes: ['Eight-byte MPR prefix legally omits zero RTN_ICNT/RSLT_CNT.', 'An unexecuted zero-result record must not become numeric zero or PASS.'] } };
}

export function mprFlagsFixture({ little = true } = {}) {
  const writer = createStdfBuilder({ little }), flags = [0, 128, 16, 192, 2, 4];
  flags.forEach((testFlag, index) => {
    const site = index % 2 + 1;
    writer.pir({ site });
    writer.mpr({ testNumber: TEST_IDS.mpr + 20, site, testFlag, returnStates: [], returnIndexes: [], results: [1, 2, 3],
      resultScale: 0, lowScale: 0, highScale: 0, low: 0, high: 4, lowSpec: 0, highSpec: 4,
      name: 'SYNTHETIC_MPR_RECORDED_OUTCOME_FLAGS' });
    writer.prr({ site, flag: index === 1 ? 8 : 0, x: index, partId: `SYNTHETIC_MPR_FLAG_PART_${index + 1}` });
  });
  return { name: 'mpr-recorded-outcome-flags', buffer: writer.bytes(), expected: { partCount: 6, mprRecordCount: 6, testNumbers: [TEST_IDS.mpr + 20], testFlags: flags, resultCountPerRecord: 3,
    notes: ['The record FAIL flag is not erased merely because all three raw values fall inside limits.', 'TEST_FLG bit1 is reserved for MPR; bit2, not bit1, identifies unreliable results.', 'Unexecuted/unknown/unreliable records retain raw values while eligibility/outcome is decided by typed semantics.'] } };
}

export function ftrDefaultsFixture({ little = true } = {}) {
  const writer = createStdfBuilder({ little });
  for (let index = 0; index < 3; index++) {
    writer.pir();
    const override = index === 1 ? { patternGenerator: 12, enabledComparators: [11], comparatorBitCount: 12 } : {};
    writer.ftr({ ...override, lastField: index === 2 ? 'RSLT_TXT' : undefined });
    writer.prr({ x: index });
  }
  writer.pir(); writer.ftr({ testNumber: TEST_IDS.ftr + 1, lastField: 'TEST_FLG' }); writer.prr({ x: 3 });
  return { name: 'ftr-defaults-and-short-tail', buffer: writer.bytes(), expected: { partCount: 4, ftrRecordCount: 4, effectivePatternGenerators: [7, 12, 7, null], effectiveComparators: [[10, 11, 12, 13, 14], [11], [10, 11, 12, 13, 14], []], notes: ['Only PATG_NUM/SPIN_MAP form the FTR default tail.', 'Seven-byte FTR legally omits OPT_FLAG and following fields.'] } };
}

export function defaultOnlyFixture({ little = true } = {}) {
  const writer = createStdfBuilder({ little });
  writer.ptr({ testFlag: 0x10, paramFlag: 0 });
  writer.mpr({ testFlag: 0x10, paramFlag: 0, results: [] });
  writer.ftr({ testFlag: 0x10 });
  return { name: 'default-only-no-parts', buffer: writer.bytes(), expected: { partCount: 0, executedMeasurementCount: 0, notes: ['Metadata-only input must not manufacture a PRR/device or numeric observation. An explicit no-data result/rejection is acceptable.'] } };
}

export function orphanFixture({ little = true } = {}) {
  const writer = createStdfBuilder({ little });
  writer.ftr({ testNumber: TEST_IDS.ftr + 50, testFlag: 0x80 });
  writer.mpr({ testNumber: TEST_IDS.mpr + 50, testFlag: 0x80 });
  writer.pir(); writer.ptr({ value: 2 }); writer.prr({ tests: 1, partId: 'SYNTHETIC_VALID_PART_AFTER_ORPHAN' });
  writer.ftr({ testNumber: TEST_IDS.ftr + 51, testFlag: 0 });
  return { name: 'orphan-executions-around-real-part', buffer: writer.bytes(), expected: { partCount: 1, associatedTestNumbers: [TEST_IDS.ptr], orphanFtrCount: 2, orphanMprCount: 1, notes: ['Executed records outside a PIR/PRR pair require diagnostics/rejection; never attach them to the nearby valid part.'] } };
}

export function malformedArrayFixtures({ little = true } = {}) {
  const make = (name, type, sub, body, reason) => {
    const writer = createStdfBuilder({ little }); writer.pir(); writer.record(type, sub, body); writer.prr();
    return { name, buffer: writer.bytes(), expected: { reject: true, reason } };
  };
  const raw = createStdfBuilder({ little });
  const mpr = raw.mprBody({ results: [], returnStates: [0, 5, 10], lastField: 'RTN_STAT' });
  const ftr = raw.ftrBody({ lastField: 'RTN_INDX' });
  return [
    make('malformed-mpr-half-packed-states', 15, 15, mpr.subarray(0, 13), 'RTN_ICNT=3 requires two state bytes; only one is present.'),
    make('malformed-ftr-partial-return-index', 15, 20, ftr.subarray(0, 41), 'RTN_ICNT=3 requires six index bytes; only three are present.'),
  ];
}

export function typedFixtureCases({ little = true } = {}) {
  return [ftrOnlyFixture({ little }), ftrOnlyFixture({ little, includePtr: true }),
    ftrDefaultsFixture({ little }), mprDefaultsFixture({ little }), mprDefaultsFixture({ little, pins: false }),
    mprScanFixture({ little }), mprFlagsFixture({ little }), defaultOnlyFixture({ little }), orphanFixture({ little }), ...malformedArrayFixtures({ little })];
}

export function scanRecords(buffer) {
  assert.ok(buffer.length >= 6);
  const little = buffer[4] === 2;
  const records = [];
  for (let offset = 0; offset < buffer.length;) {
    assert.ok(offset + 4 <= buffer.length, 'complete record header');
    const length = little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
    assert.ok(offset + 4 + length <= buffer.length, 'complete declared record body');
    records.push({ offset, type: buffer[offset + 2], sub: buffer[offset + 3], body: buffer.subarray(offset + 4, offset + 4 + length) });
    offset += 4 + length;
  }
  return { little, records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let checked = 0;
  for (const little of [true, false]) {
    for (const fixture of typedFixtureCases({ little })) {
      const { records } = scanRecords(fixture.buffer);
      if (fixture.expected.partCount !== undefined) assert.equal(records.filter(record => record.type === 5 && record.sub === 20).length, fixture.expected.partCount);
      if (fixture.expected.ftrRecordCount !== undefined) assert.equal(records.filter(record => record.type === 15 && record.sub === 20).length, fixture.expected.ftrRecordCount);
      if (fixture.expected.mprRecordCount !== undefined) assert.equal(records.filter(record => record.type === 15 && record.sub === 15).length, fixture.expected.mprRecordCount);
      checked++;
    }
    const writer = createStdfBuilder({ little });
    const ftr = writer.ftrBody({ returnStates: [0, 5, 10] });
    const mpr = writer.mprBody();
    const readU2 = (buffer, at) => little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
    assert.equal(readU2(ftr, 34), 3); assert.equal(readU2(ftr, 36), 2);
    assert.deepEqual([...ftr.subarray(44, 46)], [0x50, 0x0a]);
    assert.equal(readU2(mpr, 8), 3); assert.equal(readU2(mpr, 10), 4);
    assert.deepEqual([...mpr.subarray(12, 14)], [0x50, 0x0a]);
    assert.equal(writer.ftrBody({ lastField: 'TEST_FLG' }).length, 7);
    assert.equal(writer.mprBody({ returnStates: [], returnIndexes: [], results: [], lastField: 'PARM_FLG' }).length, 8);
  }
  console.log(`PASS ${checked} generated fixture variants: both-endian framing/counts, raw layouts, odd nibble packing and minimal optional tails`);
}
