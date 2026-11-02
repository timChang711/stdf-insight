export type TestKind = "FTR" | "MPR";
export type RecordedVerdict = "pass" | "fail" | "unknown";
export type RecordReference = { ordinal: number; offset: number; bodyLength: number; type: number; subtype: number };

export type TypedObservation = {
  kind: TestKind;
  testNumber: number;
  head: number;
  site: number;
  partIndex: number | null;
  record: RecordReference;
  verdict: RecordedVerdict;
  execution: "executed" | "not-executed";
  diagnostics: string[];
  raw: Record<string, unknown>;
  effective: Record<string, unknown>;
  present: string[];
  /** Field name -> original default record ordinal; overrides never replace file defaults. */
  inherited: Record<string, number>;
};

export type TypedTest = { key: string; kind: TestKind; number: number; name: string; observations: TypedObservation[] };
export type RecordDiagnostic = { code: string; message: string; record: RecordReference };
export type PinMapping = { index: number; channelType?: number; channelName?: string; physicalName?: string; logicalName?: string; head?: number; site?: number; record: RecordReference };

export function typedObservationName(observation: TypedObservation) {
  const name = observation.raw.TEST_TXT;
  return typeof name === "string" && name.replace(/\0/g, "").trim() ? name.replace(/\0/g, "").trim() : `${observation.kind}_${observation.testNumber}`;
}

export function observationsByPart(tests: readonly TypedTest[]): Map<number, TypedObservation[]> {
  const index = new Map<number, TypedObservation[]>();
  for (const test of tests) for (const observation of test.observations) {
    if (observation.partIndex === null) continue;
    const rows = index.get(observation.partIndex);
    if (rows) rows.push(observation); else index.set(observation.partIndex, [observation]);
  }
  for (const rows of index.values()) rows.sort((a, b) => a.record.ordinal - b.record.ordinal);
  return index;
}
