import type { Measurement, TestData } from "./model.ts";
import type { TypedObservation } from "./typed-records.ts";

/** Numeric pairs avoid retaining a second object for every measurement in a run. */
export type DieResultIndex = { tests: readonly TestData[]; byPart: Map<number, number[]> };
export type DieTestRow =
  | { kind: "PTR"; key: string; testNumber: number; test: TestData; measurement: Measurement; measurementIndex: number }
  | { kind: "FTR" | "MPR"; key: string; testNumber: number; observation: TypedObservation };

export function buildDieResultIndex(tests: readonly TestData[]): DieResultIndex {
  const byPart = new Map<number, number[]>();
  tests.forEach((test, testIndex) => test.values.forEach((measurement, measurementIndex) => {
    if (!Number.isSafeInteger(measurement.partIndex) || measurement.partIndex < 0) return;
    let pairs = byPart.get(measurement.partIndex);
    if (!pairs) { pairs = []; byPart.set(measurement.partIndex, pairs); }
    pairs.push(testIndex, measurementIndex);
  }));
  return { tests, byPart };
}

/**
 * Only materialize rows for the selected PRR part. Coordinates never establish
 * identity. Repeat observations remain individual rows, including nonfinite
 * values. PTR lacks source ordinals, so the table is ordered by test number,
 * then kind, with the original observation order retained inside each test.
 */
export function getDieTestRows(index: DieResultIndex, partIndex: number, observations: readonly TypedObservation[] = []): DieTestRow[] {
  const rows: DieTestRow[] = [];
  const pairs = index.byPart.get(partIndex) ?? [];
  for (let pair = 0; pair < pairs.length; pair += 2) {
    const testIndex = pairs[pair], measurementIndex = pairs[pair + 1];
    const test = index.tests[testIndex], measurement = test.values[measurementIndex];
    rows.push({ kind: "PTR", key: `ptr:${testIndex}:${measurementIndex}`, testNumber: test.id, test, measurement, measurementIndex });
  }
  observations.forEach((observation, sourceIndex) => {
    if (observation.partIndex !== partIndex) return;
    rows.push({ kind: observation.kind, key: `${observation.kind}:${observation.record.ordinal}:${observation.record.offset}:${sourceIndex}`, testNumber: observation.testNumber, observation });
  });
  const kindOrder = { PTR: 0, MPR: 1, FTR: 2 };
  return rows.sort((a, b) => a.testNumber - b.testNumber || kindOrder[a.kind] - kindOrder[b.kind] || (a.kind !== "PTR" && b.kind !== "PTR" ? a.observation.record.ordinal - b.observation.record.ordinal : 0));
}

export function dieTestVerdict(row: DieTestRow): "pass" | "fail" | "unknown" {
  // Preserve the existing PTR parser outcome; numeric validity is independent.
  return row.kind === "PTR" ? row.measurement.pass === true ? "pass" : row.measurement.pass === false ? "fail" : "unknown" : row.observation.verdict;
}

/** Effective typed fields already exclude unavailable limits during decoding. */
export function dieTestLimits(row: DieTestRow): { low: number | null; high: number | null } {
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return row.kind === "PTR" ? { low: finite(row.test.low), high: finite(row.test.high) }
    : row.kind === "MPR" ? { low: finite(row.observation.effective.LO_LIMIT), high: finite(row.observation.effective.HI_LIMIT) }
      : { low: null, high: null };
}
