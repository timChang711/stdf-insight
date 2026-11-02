/** Raw STDF V4 PMR (1/60), specification pp. 11 and 27. */
export type RawPmrFields = {
  PMR_INDX: number;
  CHAN_TYP?: number;
  CHAN_NAM?: string;
  PHY_NAM?: string;
  LOG_NAM?: string;
  HEAD_NUM?: number;
  SITE_NUM?: number;
};

export type RawPmrRecord = { fields: RawPmrFields; present: string[]; trailingBytes: number };

/**
 * Decode bytes only: preserve explicit values, string whitespace and NUL bytes.
 * The normalizer, not this decoder, supplies default head/site 1 or validates
 * the specification's PMR index range (1..32767) and cross-record uniqueness.
 */
export function decodePmrRecord(view: DataView, body: number, end: number, little: boolean): RawPmrRecord {
  if (!Number.isInteger(body) || !Number.isInteger(end) || body < 0 || end < body || end > view.byteLength) {
    throw new RangeError("Invalid PMR record bounds.");
  }
  let pos = body;
  const requireBytes = (field: string, size: number): void => {
    if (size > end - pos) throw new RangeError(`Truncated PMR ${field} at byte ${pos}: expected ${size} bytes, found ${end - pos}.`);
  };
  const u1 = (field: string): number => {
    requireBytes(field, 1);
    return view.getUint8(pos++);
  };
  const u2 = (field: string): number => {
    requireBytes(field, 2);
    const value = view.getUint16(pos, little);
    pos += 2;
    return value;
  };
  const cn = (field: string): string => {
    const length = u1(`${field} length`);
    requireBytes(field, length);
    let value = "";
    // STDF strings are byte strings. Latin1 TextDecoder would remap C1 bytes.
    for (let index = 0; index < length; index++) value += String.fromCharCode(view.getUint8(pos++));
    return value;
  };

  const fields: RawPmrFields = { PMR_INDX: u2("PMR_INDX") };
  const present = ["PMR_INDX"];
  const optional = <K extends keyof RawPmrFields>(field: K, read: () => RawPmrFields[K]): void => {
    if (pos === end) return;
    fields[field] = read();
    present.push(field);
  };
  optional("CHAN_TYP", () => u2("CHAN_TYP"));
  optional("CHAN_NAM", () => cn("CHAN_NAM"));
  optional("PHY_NAM", () => cn("PHY_NAM"));
  optional("LOG_NAM", () => cn("LOG_NAM"));
  optional("HEAD_NUM", () => u1("HEAD_NUM"));
  optional("SITE_NUM", () => u1("SITE_NUM"));
  return { fields, present, trailingBytes: end - pos };
}
