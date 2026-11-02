/** Envelope inventory only. Counts are records, never inferred test executions. */
export type RecordCoverage = {
  type: number;
  subtype: number;
  count: number;
  bodyBytes: number;
  firstRecord: number;
  lastRecord: number;
  firstOffset: number;
  lastOffset: number;
};

export type SourceCoverage = {
  byteOrder: "little" | "big";
  uncompressedBytes: number;
  recordCount: number;
  records: RecordCoverage[];
};

type RecordDefinition = { name: string; usage: string; support: "validated" | "partial" | "not-decoded" };
const definitions: Record<string, RecordDefinition> = {
  "0/10": { name: "FAR", support: "validated", usage: "Initial FAR check; parser byte order" },
  "0/20": { name: "ATR", support: "not-decoded", usage: "Audit trail" },
  "0/30": { name: "VUR", support: "not-decoded", usage: "Format version update" },
  "1/10": { name: "MIR", support: "partial", usage: "Selected run metadata" },
  "1/20": { name: "MRR", support: "partial", usage: "Finish time" },
  "1/30": { name: "PCR", support: "not-decoded", usage: "Recorded part-count summary" },
  "1/40": { name: "HBR", support: "not-decoded", usage: "Recorded hard-bin summary" },
  "1/50": { name: "SBR", support: "not-decoded", usage: "Recorded soft-bin summary" },
  "1/60": { name: "PMR", support: "partial", usage: "Raw pin mapping fields" },
  "1/62": { name: "PGR", support: "not-decoded", usage: "Pin groups" },
  "1/63": { name: "PLR", support: "not-decoded", usage: "Pin logic definitions" },
  "1/70": { name: "RDR", support: "not-decoded", usage: "Retest metadata" },
  "1/80": { name: "SDR", support: "not-decoded", usage: "Head/site equipment metadata" },
  "1/90": { name: "PSR", support: "not-decoded", usage: "Pattern sequence metadata" },
  "1/91": { name: "NMR", support: "not-decoded", usage: "Scan name mapping" },
  "1/92": { name: "CNR", support: "not-decoded", usage: "Scan cell names" },
  "1/93": { name: "SSR", support: "not-decoded", usage: "Scan structure metadata" },
  "1/94": { name: "SCR", support: "not-decoded", usage: "Scan chain metadata" },
  "2/10": { name: "WIR", support: "partial", usage: "Wafer ID and start time" },
  "2/20": { name: "WRR", support: "not-decoded", usage: "Wafer result summary" },
  "2/30": { name: "WCR", support: "partial", usage: "Die dimensions and wafer size" },
  "5/10": { name: "PIR", support: "partial", usage: "Head/site part buffering" },
  "5/20": { name: "PRR", support: "partial", usage: "Die records, bins, coordinates and legacy disposition" },
  "10/30": { name: "TSR", support: "not-decoded", usage: "Recorded test summary" },
  "15/10": { name: "PTR", support: "partial", usage: "Numeric measurements and common limits" },
  "15/15": { name: "MPR", support: "partial", usage: "Raw result arrays, flags and optional defaults; synthetic validation" },
  "15/20": { name: "FTR", support: "partial", usage: "Functional record outcomes, raw fields and optional defaults" },
  "15/30": { name: "STR", support: "not-decoded", usage: "Scan test records" },
  "20/10": { name: "BPS", support: "not-decoded", usage: "Program section start" },
  "20/20": { name: "EPS", support: "not-decoded", usage: "Program section end" },
  "50/10": { name: "GDR", support: "not-decoded", usage: "Typed generic data" },
  "50/30": { name: "DTR", support: "not-decoded", usage: "Text log records" },
};

export function recordDefinition(type: number, subtype: number): RecordDefinition {
  return definitions[`${type}/${subtype}`] ?? { name: "Unrecognized", support: "not-decoded", usage: "Record type not recognized by this version" };
}

/** Bounded by distinct type/subtype pairs; does not copy payloads or keep one object per record. */
export function collectRecordCoverage(
  inventory: Map<number, RecordCoverage>,
  type: number,
  subtype: number,
  bodyLength: number,
  recordNumber: number,
  byteOffset: number,
) {
  const key = type * 256 + subtype;
  const existing = inventory.get(key);
  if (existing) {
    existing.count++;
    existing.bodyBytes += bodyLength;
    existing.lastRecord = recordNumber;
    existing.lastOffset = byteOffset;
  } else {
    inventory.set(key, { type, subtype, count: 1, bodyBytes: bodyLength, firstRecord: recordNumber, lastRecord: recordNumber, firstOffset: byteOffset, lastOffset: byteOffset });
  }
}
