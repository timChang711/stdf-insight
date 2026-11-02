import type { RunData, TestData } from "./model.ts";

export type RunComparisonPair = { x: number; y: number; site: number; partIndex: number };
export type RunComparisonPairs = {
  /** Previous result is x; current result is y. Site and part index belong to the current run. */
  pairs: RunComparisonPair[];
  reason: string | null;
  /** Input measurements not included in a pair, including unmatched or ambiguous records. */
  excludedCurrentMeasurements: number;
  excludedPreviousMeasurements: number;
};

const coordinateIndexes = new WeakMap<RunData, Map<number, string>>();
const missingIdentifiers = new Set(["", "—", "-", "UNKNOWN", "UNKNOWN_LOT", "UNKNOWN_WAFER", "N/A"]);
const identifier = (value: string) => value.trim();
const knownIdentifier = (value: string) => !missingIdentifiers.has(value.toUpperCase());
const validCoordinate = (value: number) => Number.isInteger(value) && value > -32768 && value <= 32767;
const coordinateKey = (x: number, y: number) => `${x}:${y}`;

/** Run objects are immutable after parsing. Cache indexes so comparison cost does not multiply by test count. */
function uniqueCoordinates(run: RunData): Map<number, string> {
  const cached = coordinateIndexes.get(run);
  if (cached) return cached;
  const byCoordinate = new Map<string, number | null>();
  const seenParts = new Set<number>();
  const duplicateParts = new Set<number>();
  for (const part of run.parts) {
    if (seenParts.has(part.index)) duplicateParts.add(part.index);
    seenParts.add(part.index);
    if (!validCoordinate(part.x) || !validCoordinate(part.y)) continue;
    const key = coordinateKey(part.x, part.y);
    byCoordinate.set(key, byCoordinate.has(key) ? null : part.index);
  }
  const result = new Map<number, string>();
  for (const [key, partIndex] of byCoordinate) {
    if (partIndex !== null && !duplicateParts.has(partIndex)) result.set(partIndex, key);
  }
  coordinateIndexes.set(run, result);
  return result;
}

function uniqueMeasurements(run: RunData, test: TestData) {
  const coordinates = uniqueCoordinates(run);
  const byPart = new Map<number, TestData["values"][number] | null>();
  for (const measurement of test.values) {
    byPart.set(measurement.partIndex, byPart.has(measurement.partIndex) ? null : measurement);
  }
  const result = new Map<string, TestData["values"][number]>();
  for (const [partIndex, measurement] of byPart) {
    if (!measurement || !Number.isFinite(measurement.value)) continue;
    const coordinate = coordinates.get(partIndex);
    if (coordinate && coordinate === coordinateKey(measurement.x, measurement.y)) result.set(coordinate, measurement);
  }
  return result;
}

/** Pair only the same identified wafer's unique physical coordinates, never file order or part index across runs. */
export function getRunComparisonPairs(
  currentRun: RunData,
  previousRun: RunData | undefined,
  currentTest: TestData,
  previousTest: TestData | undefined,
): RunComparisonPairs {
  const result = (pairs: RunComparisonPair[], reason: string | null): RunComparisonPairs => ({
    pairs,
    reason,
    excludedCurrentMeasurements: currentTest.values.length - pairs.length,
    excludedPreviousMeasurements: (previousTest?.values.length ?? 0) - pairs.length,
  });
  if (!previousRun) return result([], "Choose a second run to compare the same wafer's die results.");
  if (!previousTest || currentTest.id !== previousTest.id) return result([], "The same test number must be present in both runs.");
  const currentLot = identifier(currentRun.lotId), previousLot = identifier(previousRun.lotId);
  const currentWafer = identifier(currentRun.waferId), previousWafer = identifier(previousRun.waferId);
  if (![currentLot, previousLot, currentWafer, previousWafer].every(knownIdentifier)) {
    return result([], "Both runs need recorded lot and wafer IDs before die results can be paired.");
  }
  if (currentLot !== previousLot || currentWafer !== previousWafer) {
    return result([], "Die correlation requires the same lot and wafer IDs. Different wafers can be compared by summary statistics.");
  }
  if (currentTest.unit.trim() !== previousTest.unit.trim()) return result([], "Test units differ between runs; die results are not paired.");
  const current = uniqueMeasurements(currentRun, currentTest);
  const previous = uniqueMeasurements(previousRun, previousTest);
  const pairs: RunComparisonPair[] = [];
  for (const [coordinate, measurement] of current) {
    const prior = previous.get(coordinate);
    if (prior) pairs.push({ x: prior.value, y: measurement.value, site: measurement.site, partIndex: measurement.partIndex });
  }
  return result(pairs, pairs.length ? null : "No shared, unique die coordinates with one valid test result in each run. Repeated coordinates and repeated results are excluded.");
}
