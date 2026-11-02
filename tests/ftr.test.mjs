import assert from "node:assert/strict";
import test from "node:test";
import { decodeFtrRecord, FtrDecodeError } from "../app/lib/records/ftr.ts";

// Synthetic bytes only. The expected field values are defined independently
// from the decoder and the integer encoders use Node Buffer's endian methods.
function fixture(little = true, { returnIndexes = [300, 17, 65535], returnStates = [5, 6, 10], programIndexes = [9, 260], programStates = [2, 7] } = {}) {
  const chunks = [];
  const spans = {};
  let offset = 0;
  function field(name, bytes) {
    spans[name] = { start: offset, end: offset + bytes.length };
    chunks.push(bytes);
    offset += bytes.length;
  }
  const u1 = value => Buffer.from([value]);
  const u2 = value => { const bytes = Buffer.alloc(2); bytes[little ? "writeUInt16LE" : "writeUInt16BE"](value); return bytes; };
  const u4 = value => { const bytes = Buffer.alloc(4); bytes[little ? "writeUInt32LE" : "writeUInt32BE"](value); return bytes; };
  const i2 = value => { const bytes = Buffer.alloc(2); bytes[little ? "writeInt16LE" : "writeInt16BE"](value); return bytes; };
  const i4 = value => { const bytes = Buffer.alloc(4); bytes[little ? "writeInt32LE" : "writeInt32BE"](value); return bytes; };
  const nibbles = values => { const bytes = Buffer.alloc(Math.ceil(values.length / 2)); values.forEach((value, index) => { bytes[index >> 1] |= value << ((index & 1) * 4); }); return bytes; };
  const dn = (count, bytes) => Buffer.concat([u2(count), Buffer.from(bytes)]);
  const cn = value => { const bytes = Buffer.from(value, "latin1"); return Buffer.concat([u1(bytes.length), bytes]); };

  field("TEST_NUM", u4(0x10203040));
  field("HEAD_NUM", u1(7));
  field("SITE_NUM", u1(5));
  field("TEST_FLG", u1(0xa5));
  field("OPT_FLAG", u1(0xd5));
  field("CYCL_CNT", u4(0xfeedbeef));
  field("REL_VADR", u4(0x12345678));
  field("REPT_CNT", u4(3));
  field("NUM_FAIL", u4(2));
  field("XFAIL_AD", i4(-123456));
  field("YFAIL_AD", i4(98765));
  field("VECT_OFF", i2(-7));
  field("RTN_ICNT", u2(returnIndexes.length));
  field("PGM_ICNT", u2(programIndexes.length));
  field("RTN_INDX", Buffer.concat(returnIndexes.map(u2)));
  field("RTN_STAT", nibbles(returnStates));
  field("PGM_INDX", Buffer.concat(programIndexes.map(u2)));
  field("PGM_STAT", nibbles(programStates));
  field("FAIL_PIN", dn(10, [0x82, 0x03]));
  field("VECT_NAM", cn(" vect "));
  field("TIME_SET", cn(""));
  field("OP_CODE", cn("\0"));
  field("TEST_TXT", cn("  label  "));
  field("ALARM_ID", cn("alarm\0id"));
  field("PROG_TXT", cn("\x80program"));
  field("RSLT_TXT", cn(" result "));
  field("PATG_NUM", u1(255));
  field("SPIN_MAP", dn(9, [1, 1]));
  return { bytes: Buffer.concat(chunks), spans };
}

const viewOf = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const decode = (bytes, little = true) => decodeFtrRecord(viewOf(bytes), 0, bytes.length, little);
const expectedFull = {
  TEST_NUM: 0x10203040,
  HEAD_NUM: 7,
  SITE_NUM: 5,
  TEST_FLG: 0xa5,
  OPT_FLAG: 0xd5,
  CYCL_CNT: 0xfeedbeef,
  REL_VADR: 0x12345678,
  REPT_CNT: 3,
  NUM_FAIL: 2,
  XFAIL_AD: -123456,
  YFAIL_AD: 98765,
  VECT_OFF: -7,
  RTN_ICNT: 3,
  PGM_ICNT: 2,
  RTN_INDX: [300, 17, 65535],
  RTN_STAT: [5, 6, 10],
  PGM_INDX: [9, 260],
  PGM_STAT: [2, 7],
  FAIL_PIN: { bitCount: 10, bytes: [0x82, 0x03] },
  VECT_NAM: " vect ",
  TIME_SET: "",
  OP_CODE: "\0",
  TEST_TXT: "  label  ",
  ALARM_ID: "alarm\0id",
  PROG_TXT: "\x80program",
  RSLT_TXT: " result ",
  PATG_NUM: 255,
  SPIN_MAP: { bitCount: 9, bytes: [1, 1] },
};

for (const little of [true, false]) {
  const endian = little ? "little" : "big";

  test(`${endian}-endian complete FTR retains every raw field without flag interpretation`, () => {
    const { bytes } = fixture(little);
    const result = decode(bytes, little);
    assert.deepEqual(result.fields, expectedFull);
    assert.deepEqual(result.present, Object.keys(expectedFull));
    assert.equal(result.trailingBytes, 0);
  });

  test(`${endian}-endian seven-byte minimum preserves required fields and absent tails`, () => {
    const { bytes } = fixture(little);
    const result = decode(bytes.subarray(0, 7), little);
    assert.deepEqual(result, {
      fields: { TEST_NUM: 0x10203040, HEAD_NUM: 7, SITE_NUM: 5, TEST_FLG: 0xa5 },
      present: ["TEST_NUM", "HEAD_NUM", "SITE_NUM", "TEST_FLG"],
      trailingBytes: 0,
    });
    assert.equal(result.fields.OPT_FLAG, undefined);
    assert.equal(result.fields.PATG_NUM, undefined);
    assert.equal(result.fields.SPIN_MAP, undefined);
  });

  test(`${endian}-endian odd program nibble count does not consume FAIL_PIN`, () => {
    const { bytes } = fixture(little, { returnIndexes: [10, 20], returnStates: [0, 15], programIndexes: [11, 22, 33], programStates: [1, 4, 7] });
    const { fields } = decode(bytes, little);
    assert.deepEqual(fields.RTN_INDX, [10, 20]);
    assert.deepEqual(fields.RTN_STAT, [0, 15]);
    assert.deepEqual(fields.PGM_INDX, [11, 22, 33]);
    assert.deepEqual(fields.PGM_STAT, [1, 4, 7]);
    assert.deepEqual(fields.FAIL_PIN, expectedFull.FAIL_PIN);
    assert.equal(fields.VECT_NAM, " vect ");
  });

  test(`${endian}-endian oversized D*n count rejects the missing payload`, () => {
    const { bytes, spans } = fixture(little);
    const broken = Buffer.from(bytes.subarray(0, spans.FAIL_PIN.start + 2));
    broken[little ? "writeUInt16LE" : "writeUInt16BE"](65535, spans.FAIL_PIN.start);
    assert.throws(() => decode(broken, little), error => error instanceof FtrDecodeError && error.field === "FAIL_PIN" && /8192 bytes/.test(error.message));
  });
}

test("mandatory fields reject partial values and missing TEST_FLG", () => {
  const { bytes } = fixture();
  for (let size = 0; size < 7; size++) {
    assert.throws(() => decode(bytes.subarray(0, size)), FtrDecodeError);
  }
});

test("reserved TEST_FLG bits remain raw and never trigger another record family's validity policy", () => {
  const { bytes } = fixture();
  const minimum = Buffer.from(bytes.subarray(0, 7));
  minimum[6] = 0x02;
  const { fields } = decode(minimum);
  assert.equal(fields.TEST_FLG, 0x02);
  assert.equal(Object.hasOwn(fields, "pass"), false);
});

test("optional scalar field boundaries distinguish omitted and encoded zero", () => {
  const { bytes, spans } = fixture();
  const optionOnly = decode(bytes.subarray(0, 8));
  assert.equal(optionOnly.fields.OPT_FLAG, 0xd5);
  assert.equal(optionOnly.fields.CYCL_CNT, undefined);
  const cycle = Buffer.from(bytes.subarray(0, spans.CYCL_CNT.end));
  cycle.writeUInt32LE(0, spans.CYCL_CNT.start);
  const result = decode(cycle);
  assert.equal(result.fields.CYCL_CNT, 0);
  assert.ok(result.present.includes("CYCL_CNT"));
  assert.equal(result.fields.REL_VADR, undefined);
});

test("partial optional fixed scalars reject rather than becoming zero", () => {
  const { bytes, spans } = fixture();
  for (const field of ["CYCL_CNT", "REL_VADR", "REPT_CNT", "NUM_FAIL", "XFAIL_AD", "YFAIL_AD", "VECT_OFF", "RTN_ICNT", "PGM_ICNT"]) {
    const broken = bytes.subarray(0, spans[field].end - 1);
    assert.throws(() => decode(broken), error => error instanceof FtrDecodeError && error.field === field, field);
  }
});

test("positive return/program counts require complete index and nibble arrays", () => {
  const { bytes, spans } = fixture();
  for (const field of ["RTN_INDX", "RTN_STAT", "PGM_INDX", "PGM_STAT"]) {
    assert.throws(() => decode(bytes.subarray(0, spans[field].end - 1)), error => error instanceof FtrDecodeError && error.field === field, field);
  }
  assert.throws(() => decode(bytes.subarray(0, spans.RTN_INDX.start)), error => error instanceof FtrDecodeError && error.field === "RTN_INDX");
});

test("zero-count arrays remain undefined at EOF but decode as empty when followed by fields", () => {
  const { bytes, spans } = fixture(true, { returnIndexes: [], returnStates: [], programIndexes: [], programStates: [] });
  const emptyTail = decode(bytes.subarray(0, spans.PGM_ICNT.end));
  assert.equal(emptyTail.fields.RTN_ICNT, 0);
  assert.equal(emptyTail.fields.PGM_ICNT, 0);
  assert.equal(emptyTail.fields.RTN_INDX, undefined);
  assert.equal(emptyTail.fields.RTN_STAT, undefined);
  assert.equal(emptyTail.fields.PGM_INDX, undefined);
  assert.equal(emptyTail.fields.PGM_STAT, undefined);
  assert.equal(emptyTail.fields.FAIL_PIN, undefined);
  const withEmptyBits = decode(Buffer.concat([bytes.subarray(0, spans.PGM_ICNT.end), Buffer.from([0, 0])]));
  assert.deepEqual(withEmptyBits.fields.RTN_INDX, []);
  assert.deepEqual(withEmptyBits.fields.RTN_STAT, []);
  assert.deepEqual(withEmptyBits.fields.PGM_INDX, []);
  assert.deepEqual(withEmptyBits.fields.PGM_STAT, []);
  assert.deepEqual(withEmptyBits.fields.FAIL_PIN, { bitCount: 0, bytes: [] });
  assert.equal(withEmptyBits.fields.VECT_NAM, undefined);
});

test("D*n length prefixes and payloads are bounded by the record end", () => {
  const { bytes, spans } = fixture();
  for (const field of ["FAIL_PIN", "SPIN_MAP"]) {
    for (const end of [spans[field].start + 1, spans[field].end - 1]) {
      // Bytes beyond end exist in the backing buffer but cannot satisfy the field.
      assert.throws(() => decodeFtrRecord(viewOf(bytes), 0, end, true), error => error instanceof FtrDecodeError && error.field === field, `${field}:${end}`);
    }
  }
});

test("C*n strings preserve explicit empty, NUL and whitespace without consuming absent tails", () => {
  const { bytes, spans } = fixture();
  const empty = decode(bytes.subarray(0, spans.TIME_SET.end));
  assert.equal(empty.fields.VECT_NAM, " vect ");
  assert.equal(empty.fields.TIME_SET, "");
  assert.ok(empty.present.includes("TIME_SET"));
  assert.equal(empty.fields.OP_CODE, undefined);
  const nul = decode(bytes.subarray(0, spans.OP_CODE.end));
  assert.equal(nul.fields.OP_CODE, "\0");
  assert.equal(nul.fields.TEST_TXT, undefined);
  assert.throws(() => decode(bytes.subarray(0, spans.VECT_NAM.end - 1)), error => error instanceof FtrDecodeError && error.field === "VECT_NAM");
});

test("a DataView window and nonzero body offset address the supplied view correctly", () => {
  const { bytes } = fixture(false);
  const wrapper = Buffer.concat([Buffer.alloc(19, 0xee), bytes, Buffer.alloc(11, 0xdd)]);
  const view = new DataView(wrapper.buffer, wrapper.byteOffset + 7, wrapper.length - 7);
  assert.deepEqual(decodeFtrRecord(view, 12, 12 + bytes.length, false).fields, expectedFull);
});

test("invalid record ranges reject before reading unrelated buffer contents", () => {
  const { bytes } = fixture();
  const view = viewOf(bytes);
  for (const [body, end] of [[-1, 7], [0.5, 7], [0, 7.5], [8, 7], [0, bytes.length + 1]]) {
    assert.throws(() => decodeFtrRecord(view, body, end, true), error => error instanceof FtrDecodeError && error.field === "record");
  }
});

test("bytes after the final standard field are reported without interpretation", () => {
  const { bytes } = fixture();
  const result = decode(Buffer.concat([bytes, Buffer.from([0xaa, 0xbb, 0xcc])]));
  assert.deepEqual(result.fields, expectedFull);
  assert.equal(result.trailingBytes, 3);
});

test("raw D*n bytes retain unused high bits for subsequent conformance diagnostics", () => {
  const { bytes, spans } = fixture();
  const changed = Buffer.from(bytes);
  changed[spans.SPIN_MAP.end - 1] = 0xff;
  const { fields } = decode(changed);
  assert.deepEqual(fields.SPIN_MAP, { bitCount: 9, bytes: [1, 0xff] });
});
