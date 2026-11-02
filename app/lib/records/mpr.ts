/**
 * Byte-level STDF V4 MPR (15/15) decoder, specification pp. 51–54.
 * Values are deliberately unscaled and flags are deliberately uninterpreted.
 * C*n strings preserve every byte, including the single NUL default override.
 */
export type RawMprFields = {
  TEST_NUM: number;
  HEAD_NUM: number;
  SITE_NUM: number;
  TEST_FLG: number;
  PARM_FLG: number;
  RTN_ICNT?: number;
  RSLT_CNT?: number;
  RTN_STAT?: number[];
  RTN_RSLT?: number[];
  TEST_TXT?: string;
  ALARM_ID?: string;
  OPT_FLAG?: number;
  RES_SCAL?: number;
  LLM_SCAL?: number;
  HLM_SCAL?: number;
  LO_LIMIT?: number;
  HI_LIMIT?: number;
  START_IN?: number;
  INCR_IN?: number;
  RTN_INDX?: number[];
  UNITS?: string;
  UNITS_IN?: string;
  C_RESFMT?: string;
  C_LLMFMT?: string;
  C_HLMFMT?: string;
  LO_SPEC?: number;
  HI_SPEC?: number;
};

export type RawMprRecord = {
  fields: RawMprFields;
  /**
   * Fields decoded in wire order. Mandatory zero-length arrays are known [] when
   * their explicit count exists. Optional tail fields at end-of-record are absent.
   */
  present: string[];
  trailingBytes: number;
};

class MprReader {
  private view: DataView;
  private end: number;
  private little: boolean;
  pos: number;

  constructor(view: DataView, body: number, end: number, little: boolean) {
    if (!Number.isInteger(body) || !Number.isInteger(end) || body < 0 || end < body || end > view.byteLength) {
      throw new RangeError("Invalid MPR record bounds.");
    }
    this.view = view;
    this.pos = body;
    this.end = end;
    this.little = little;
  }

  remaining(): number { return this.end - this.pos; }

  require(field: string, bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.remaining()) {
      throw new RangeError(`Truncated MPR ${field} at byte ${this.pos}: expected ${bytes} bytes, found ${this.remaining()}.`);
    }
  }

  u1(field: string): number {
    this.require(field, 1);
    return this.view.getUint8(this.pos++);
  }

  i1(field: string): number {
    this.require(field, 1);
    return this.view.getInt8(this.pos++);
  }

  u2(field: string): number {
    this.require(field, 2);
    const value = this.view.getUint16(this.pos, this.little);
    this.pos += 2;
    return value;
  }

  u4(field: string): number {
    this.require(field, 4);
    const value = this.view.getUint32(this.pos, this.little);
    this.pos += 4;
    return value;
  }

  r4(field: string): number {
    this.require(field, 4);
    const value = this.view.getFloat32(this.pos, this.little);
    this.pos += 4;
    return value;
  }

  cn(field: string): string {
    const length = this.u1(`${field} length`);
    this.require(field, length);
    let value = "";
    // Avoid TextDecoder("latin1"), which maps 0x80..0x9f via Windows-1252.
    for (let index = 0; index < length; index++) value += String.fromCharCode(this.view.getUint8(this.pos++));
    return value;
  }

  nibbles(field: string, count: number): number[] {
    const bytes = Math.ceil(count / 2);
    this.require(field, bytes);
    const values = Array.from({ length: count }, (_, index) => {
      const byte = this.view.getUint8(this.pos + Math.floor(index / 2));
      return index % 2 === 0 ? byte & 15 : byte >>> 4;
    });
    this.pos += bytes;
    return values;
  }

  r4s(field: string, count: number): number[] {
    this.require(field, count * 4);
    return Array.from({ length: count }, () => this.r4(field));
  }

  u2s(field: string, count: number): number[] {
    this.require(field, count * 2);
    return Array.from({ length: count }, () => this.u2(field));
  }
}

export function decodeMprRecord(view: DataView, body: number, end: number, little: boolean): RawMprRecord {
  const reader = new MprReader(view, body, end, little);
  reader.require("required prefix", 8);
  const fields: RawMprFields = {
    TEST_NUM: reader.u4("TEST_NUM"),
    HEAD_NUM: reader.u1("HEAD_NUM"),
    SITE_NUM: reader.u1("SITE_NUM"),
    TEST_FLG: reader.u1("TEST_FLG"),
    PARM_FLG: reader.u1("PARM_FLG"),
  };
  const present = ["TEST_NUM", "HEAD_NUM", "SITE_NUM", "TEST_FLG", "PARM_FLG"];
  const optional = <K extends keyof RawMprFields>(field: K, read: () => RawMprFields[K]): void => {
    if (reader.remaining() === 0) return;
    fields[field] = read();
    present.push(field);
  };
  const done = (): RawMprRecord => ({ fields, present, trailingBytes: reader.remaining() });

  // Each count can legally be omitted only at end-of-record (implicit zero).
  // Leave it undefined, so the normalizer can distinguish omission from a wire 0.
  optional("RTN_ICNT", () => reader.u2("RTN_ICNT"));
  if (fields.RTN_ICNT === undefined) return done();
  optional("RSLT_CNT", () => reader.u2("RSLT_CNT"));

  // Counts are independent. A nonzero count promises the entire corresponding
  // array, even if the record ends immediately after its count fields.
  fields.RTN_STAT = reader.nibbles("RTN_STAT", fields.RTN_ICNT);
  present.push("RTN_STAT");
  if (fields.RSLT_CNT === undefined) return done();
  fields.RTN_RSLT = reader.r4s("RTN_RSLT", fields.RSLT_CNT);
  present.push("RTN_RSLT");

  optional("TEST_TXT", () => reader.cn("TEST_TXT"));
  optional("ALARM_ID", () => reader.cn("ALARM_ID"));
  optional("OPT_FLAG", () => reader.u1("OPT_FLAG"));
  optional("RES_SCAL", () => reader.i1("RES_SCAL"));
  optional("LLM_SCAL", () => reader.i1("LLM_SCAL"));
  optional("HLM_SCAL", () => reader.i1("HLM_SCAL"));
  optional("LO_LIMIT", () => reader.r4("LO_LIMIT"));
  optional("HI_LIMIT", () => reader.r4("HI_LIMIT"));
  optional("START_IN", () => reader.r4("START_IN"));
  optional("INCR_IN", () => reader.r4("INCR_IN"));
  optional("RTN_INDX", () => reader.u2s("RTN_INDX", fields.RTN_ICNT!));
  optional("UNITS", () => reader.cn("UNITS"));
  optional("UNITS_IN", () => reader.cn("UNITS_IN"));
  optional("C_RESFMT", () => reader.cn("C_RESFMT"));
  optional("C_LLMFMT", () => reader.cn("C_LLMFMT"));
  optional("C_HLMFMT", () => reader.cn("C_HLMFMT"));
  optional("LO_SPEC", () => reader.r4("LO_SPEC"));
  optional("HI_SPEC", () => reader.r4("HI_SPEC"));
  return done();
}
