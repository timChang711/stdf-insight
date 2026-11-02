/**
 * Raw STDF V4 FTR decoder, based on the original specification, pp. 55–59.
 * This module does not infer verdicts, resolve defaults, or group executions.
 * body/end are offsets within the supplied DataView, not its backing buffer.
 */
export type RawBitString = { bitCount: number; bytes: number[] };

export type RawFtrFields = {
  TEST_NUM: number;
  HEAD_NUM: number;
  SITE_NUM: number;
  TEST_FLG: number;
  OPT_FLAG?: number;
  CYCL_CNT?: number;
  REL_VADR?: number;
  REPT_CNT?: number;
  NUM_FAIL?: number;
  XFAIL_AD?: number;
  YFAIL_AD?: number;
  VECT_OFF?: number;
  RTN_ICNT?: number;
  PGM_ICNT?: number;
  RTN_INDX?: number[];
  RTN_STAT?: number[];
  PGM_INDX?: number[];
  PGM_STAT?: number[];
  FAIL_PIN?: RawBitString;
  VECT_NAM?: string;
  TIME_SET?: string;
  OP_CODE?: string;
  TEST_TXT?: string;
  ALARM_ID?: string;
  PROG_TXT?: string;
  RSLT_TXT?: string;
  PATG_NUM?: number;
  SPIN_MAP?: RawBitString;
};

export type RawFtrRecord = {
  fields: RawFtrFields;
  present: string[];
  trailingBytes: number;
};

export class FtrDecodeError extends Error {
  readonly field: string;
  readonly offset: number;

  constructor(field: string, offset: number, detail: string) {
    super(`FTR ${field} at byte ${offset}: ${detail}`);
    this.name = "FtrDecodeError";
    this.field = field;
    this.offset = offset;
  }
}

class FtrReader {
  readonly view: DataView;
  readonly end: number;
  readonly little: boolean;
  position: number;

  constructor(view: DataView, body: number, end: number, little: boolean) {
    if (!Number.isInteger(body) || !Number.isInteger(end) || body < 0 || end < body || end > view.byteLength) {
      throw new FtrDecodeError("record", body, "invalid body/end bounds for DataView");
    }
    this.view = view;
    this.position = body;
    this.end = end;
    this.little = little;
  }

  get remaining() { return this.end - this.position; }

  requireBytes(field: string, count: number) {
    if (count > this.remaining) {
      throw new FtrDecodeError(field, this.position, `need ${count} bytes, only ${this.remaining} remain`);
    }
  }

  u1(field: string) {
    this.requireBytes(field, 1);
    return this.view.getUint8(this.position++);
  }

  u2(field: string) {
    this.requireBytes(field, 2);
    const value = this.view.getUint16(this.position, this.little);
    this.position += 2;
    return value;
  }

  u4(field: string) {
    this.requireBytes(field, 4);
    const value = this.view.getUint32(this.position, this.little);
    this.position += 4;
    return value;
  }

  optionalU1(field: string) { return this.remaining === 0 ? undefined : this.u1(field); }
  optionalU2(field: string) { return this.remaining === 0 ? undefined : this.u2(field); }
  optionalU4(field: string) { return this.remaining === 0 ? undefined : this.u4(field); }

  optionalI2(field: string) {
    if (this.remaining === 0) return undefined;
    this.requireBytes(field, 2);
    const value = this.view.getInt16(this.position, this.little);
    this.position += 2;
    return value;
  }

  optionalI4(field: string) {
    if (this.remaining === 0) return undefined;
    this.requireBytes(field, 4);
    const value = this.view.getInt32(this.position, this.little);
    this.position += 4;
    return value;
  }

  u2Array(field: string, count: number | undefined) {
    if (count === undefined || (count === 0 && this.remaining === 0)) return undefined;
    this.requireBytes(field, count * 2);
    return Array.from({ length: count }, () => this.u2(field));
  }

  nibbleArray(field: string, count: number | undefined) {
    if (count === undefined || (count === 0 && this.remaining === 0)) return undefined;
    const byteCount = Math.ceil(count / 2);
    this.requireBytes(field, byteCount);
    const result: number[] = [];
    for (let index = 0; index < byteCount; index++) {
      const byte = this.u1(field);
      result.push(byte & 0x0f);
      if (result.length < count) result.push(byte >>> 4);
    }
    return result;
  }

  bitString(field: string): RawBitString | undefined {
    if (this.remaining === 0) return undefined;
    const bitCount = this.u2(field);
    const byteCount = Math.ceil(bitCount / 8);
    this.requireBytes(field, byteCount);
    return { bitCount, bytes: Array.from({ length: byteCount }, () => this.u1(field)) };
  }

  text(field: string) {
    if (this.remaining === 0) return undefined;
    const length = this.u1(field);
    this.requireBytes(field, length);
    // A byte-to-code-unit mapping preserves NUL, spaces and every encoded byte.
    // TextDecoder("latin1") would instead remap some bytes as Windows-1252.
    let value = "";
    for (let index = 0; index < length; index++) value += String.fromCharCode(this.u1(field));
    return value;
  }
}

export function decodeFtrRecord(view: DataView, body: number, end: number, little: boolean): RawFtrRecord {
  const reader = new FtrReader(view, body, end, little);
  const fields: RawFtrFields = {
    TEST_NUM: reader.u4("TEST_NUM"),
    HEAD_NUM: reader.u1("HEAD_NUM"),
    SITE_NUM: reader.u1("SITE_NUM"),
    TEST_FLG: reader.u1("TEST_FLG"),
  };
  const present: string[] = ["TEST_NUM", "HEAD_NUM", "SITE_NUM", "TEST_FLG"];
  function keep<K extends keyof RawFtrFields>(field: K, value: RawFtrFields[K]) {
    if (value !== undefined) {
      fields[field] = value;
      present.push(field);
    }
  }

  keep("OPT_FLAG", reader.optionalU1("OPT_FLAG"));
  keep("CYCL_CNT", reader.optionalU4("CYCL_CNT"));
  keep("REL_VADR", reader.optionalU4("REL_VADR"));
  keep("REPT_CNT", reader.optionalU4("REPT_CNT"));
  keep("NUM_FAIL", reader.optionalU4("NUM_FAIL"));
  keep("XFAIL_AD", reader.optionalI4("XFAIL_AD"));
  keep("YFAIL_AD", reader.optionalI4("YFAIL_AD"));
  keep("VECT_OFF", reader.optionalI2("VECT_OFF"));
  keep("RTN_ICNT", reader.optionalU2("RTN_ICNT"));
  keep("PGM_ICNT", reader.optionalU2("PGM_ICNT"));
  keep("RTN_INDX", reader.u2Array("RTN_INDX", fields.RTN_ICNT));
  keep("RTN_STAT", reader.nibbleArray("RTN_STAT", fields.RTN_ICNT));
  keep("PGM_INDX", reader.u2Array("PGM_INDX", fields.PGM_ICNT));
  keep("PGM_STAT", reader.nibbleArray("PGM_STAT", fields.PGM_ICNT));
  keep("FAIL_PIN", reader.bitString("FAIL_PIN"));
  keep("VECT_NAM", reader.text("VECT_NAM"));
  keep("TIME_SET", reader.text("TIME_SET"));
  keep("OP_CODE", reader.text("OP_CODE"));
  keep("TEST_TXT", reader.text("TEST_TXT"));
  keep("ALARM_ID", reader.text("ALARM_ID"));
  keep("PROG_TXT", reader.text("PROG_TXT"));
  keep("RSLT_TXT", reader.text("RSLT_TXT"));
  keep("PATG_NUM", reader.optionalU1("PATG_NUM"));
  keep("SPIN_MAP", reader.bitString("SPIN_MAP"));

  return { fields, present, trailingBytes: reader.remaining };
}
