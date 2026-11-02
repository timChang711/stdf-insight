import type { Measurement, TestData } from "./model.ts";

export type PartTestMeasurements = {
  measurementCount: number;
  failureCount: number;
  /** Last recorded result for this part/test, not a retest disposition policy. */
  latestMeasurement: Measurement | null;
};

export type FailingTest = {
  testId: number;
  name: string;
  unit: string;
  measurementCount: number;
  failureCount: number;
  firstFailedMeasurement: Measurement;
  lastFailedMeasurement: Measurement;
  latestMeasurement: Measurement;
};

type RecordedMeasurements = PartTestMeasurements & {
  firstFailedMeasurement: Measurement | null;
  lastFailedMeasurement: Measurement | null;
};

function emptyMeasurements(): RecordedMeasurements {
  return {
    measurementCount: 0,
    failureCount: 0,
    firstFailedMeasurement: null,
    lastFailedMeasurement: null,
    latestMeasurement: null,
  };
}

function recordPartTestMeasurement(summary: PartTestMeasurements, measurement: Measurement) {
  summary.measurementCount += 1;
  summary.latestMeasurement = measurement;
  // Preserve the parser's recorded result. Numeric validity and PRR disposition
  // are separate concerns and must not manufacture or erase a failed result.
  if (measurement.pass === false) summary.failureCount += 1;
}

function recordMeasurement(summary: RecordedMeasurements, measurement: Measurement) {
  recordPartTestMeasurement(summary, measurement);
  if (measurement.pass === false) {
    summary.firstFailedMeasurement ??= measurement;
    summary.lastFailedMeasurement = measurement;
  }
}

/**
 * Summarize recorded results for a single part/test. An empty selection has no
 * result; it must not be displayed as PASS. Original numeric values, including
 * NaN and infinities, are retained on the measurement reference.
 */
export function getPartTestMeasurements(
  test: TestData | undefined,
  partIndex: number,
): PartTestMeasurements {
  const summary = emptyMeasurements();
  for (const measurement of test?.values ?? []) {
    if (measurement.partIndex === partIndex) recordMeasurement(summary, measurement);
  }
  return {
    measurementCount: summary.measurementCount,
    failureCount: summary.failureCount,
    latestMeasurement: summary.latestMeasurement,
  };
}

/**
 * Index one selected test in a single scan. Memoize by the selected TestData
 * identity so die selection and map zoom use constant-time lookups. Missing
 * parts are absent from the map; absence must not be interpreted as PASS.
 */
export function buildPartTestMeasurements(
  test: TestData | undefined,
): Map<number, PartTestMeasurements> {
  const result = new Map<number, PartTestMeasurements>();
  for (const measurement of test?.values ?? []) {
    let summary = result.get(measurement.partIndex);
    if (!summary) {
      summary = { measurementCount: 0, failureCount: 0, latestMeasurement: null };
      result.set(measurement.partIndex, summary);
    }
    recordPartTestMeasurement(summary, measurement);
  }
  return result;
}

/**
 * Index known recorded failures by the parser's part index, never by X/Y.
 * Keep failed records even when a later result or the overall PRR is PASS.
 * Absence from this index means no failed decoded measurement was found, not
 * that a part passed or that unsupported FTR/MPR records contain no failures.
 *
 * Scan each measurement once. Transient state covers only one test's parts;
 * the returned index retains only failing part/test summaries, not copied
 * measurement arrays. Memoize this pure derivation by the immutable run.tests
 * identity in the caller so changing map scale/selection does not rebuild it.
 */
export function buildFailingTestsByPart(
  tests: readonly TestData[],
): Map<number, FailingTest[]> {
  const testsById = new Map<number, TestData[]>();
  for (const test of tests) {
    const group = testsById.get(test.id);
    if (group) group.push(test);
    else testsById.set(test.id, [test]);
  }

  const result = new Map<number, FailingTest[]>();
  for (const [testId, matchingTests] of testsById) {
    const measurementsByPart = new Map<number, RecordedMeasurements>();
    for (const test of matchingTests) {
      for (const measurement of test.values) {
        let summary = measurementsByPart.get(measurement.partIndex);
        if (!summary) {
          summary = emptyMeasurements();
          measurementsByPart.set(measurement.partIndex, summary);
        }
        recordMeasurement(summary, measurement);
      }
    }
    const { name, unit } = matchingTests[0];
    for (const [partIndex, summary] of measurementsByPart) {
      if (!summary.firstFailedMeasurement || !summary.lastFailedMeasurement || !summary.latestMeasurement) continue;
      const failure: FailingTest = {
        testId,
        name,
        unit,
        measurementCount: summary.measurementCount,
        failureCount: summary.failureCount,
        firstFailedMeasurement: summary.firstFailedMeasurement,
        lastFailedMeasurement: summary.lastFailedMeasurement,
        latestMeasurement: summary.latestMeasurement,
      };
      const failures = result.get(partIndex);
      if (failures) failures.push(failure);
      else result.set(partIndex, [failure]);
    }
  }
  return result;
}
