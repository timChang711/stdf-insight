import test from "node:test";
import assert from "node:assert/strict";
import { getRunComparisonPairs } from "../app/lib/run-comparison.ts";

const measurement = (partIndex, x, y, value, site = 1) => ({ partIndex, x, y, value, site, pass: true });
const testData = (values, changes = {}) => ({ id: 100, name: "Voltage", unit: "V", low: 0, high: 5, values, ...changes });
function runFor(test, changes = {}) {
  return {
    fileName: "fixture.stdf", fileSize: 0, lotId: "LOT-1", waferId: "WAFER-1", device: "Fixture",
    program: "Fixture", tester: "Fixture", startTime: new Date(0), finishTime: new Date(0), source: "file",
    tests: [test], parts: test.values.map(value => ({ index: value.partIndex, x: value.x, y: value.y, site: value.site, hardBin: 1, softBin: 1, pass: true, testTimeMs: 0, values: {}, firstFailTestId: null })),
    ...changes,
  };
}
function paired(currentTest, previousTest, currentChanges = {}, previousChanges = {}) {
  return getRunComparisonPairs(runFor(currentTest, currentChanges), runFor(previousTest, previousChanges), currentTest, previousTest);
}

test("pairs the same physical XY despite different record order, part indexes and test sites", () => {
  const current = testData([measurement(30, 4, 6, 1.2, 2), measurement(31, 5, 6, 2.4, 3)]);
  const previous = testData([measurement(8, 5, 6, 2.1), measurement(9, 4, 6, 1.1)]);
  assert.deepEqual(paired(current, previous), {
    pairs: [{ x: 1.1, y: 1.2, site: 2, partIndex: 30 }, { x: 2.1, y: 2.4, site: 3, partIndex: 31 }],
    reason: null, excludedCurrentMeasurements: 0, excludedPreviousMeasurements: 0,
  });
});

test("does not pair different wafers or lots even when indexes and XY match", () => {
  const current = testData([measurement(0, 0, 0, 1)]), previous = testData([measurement(0, 0, 0, 2)]);
  for (const changes of [{ waferId: "WAFER-2" }, { lotId: "LOT-2" }]) {
    const result = paired(current, previous, {}, changes);
    assert.equal(result.pairs.length, 0);
    assert.match(result.reason, /same lot and wafer/);
  }
});

test("rejects empty and parser-placeholder identifiers", () => {
  const current = testData([measurement(0, 0, 0, 1)]);
  for (const changes of [{ lotId: "" }, { lotId: "UNKNOWN_LOT" }, { waferId: "—" }, { waferId: "  " }]) {
    const result = paired(current, current, changes, changes);
    assert.equal(result.pairs.length, 0);
    assert.match(result.reason, /recorded lot and wafer/);
  }
});

test("does not fall back to part order for absent or invalid coordinates", () => {
  for (const coordinate of [-32768, NaN, Infinity, 2.5, 32768]) {
    const current = testData([measurement(0, coordinate, 0, 1)]), previous = testData([measurement(0, coordinate, 0, 2)]);
    assert.equal(paired(current, previous).pairs.length, 0);
  }
  const current = testData([measurement(0, 0, 0, 1)]), previous = testData([measurement(0, 1, 0, 2)]);
  assert.equal(paired(current, previous).pairs.length, 0);
});

test("omits every ambiguous repeated coordinate while retaining independent unique dies", () => {
  const current = testData([measurement(0, 1, 1, 10), measurement(1, 1, 1, 11), measurement(2, 2, 2, 12)]);
  const previous = testData([measurement(20, 1, 1, 20), measurement(21, 2, 2, 21)]);
  const result = paired(current, previous);
  assert.deepEqual(result.pairs, [{ x: 21, y: 12, site: 1, partIndex: 2 }]);
  assert.equal(result.excludedCurrentMeasurements, 2);
  assert.equal(result.excludedPreviousMeasurements, 1);
  assert.equal(paired(previous, current).pairs.length, 1);
});

test("repeated coordinates are excluded even if only one part has this test", () => {
  const current = testData([measurement(0, 1, 1, 10)]), previous = testData([measurement(20, 1, 1, 20)]);
  const currentRun = runFor(current);
  currentRun.parts.push({ ...currentRun.parts[0], index: 1 });
  assert.equal(getRunComparisonPairs(currentRun, runFor(previous), current, previous).pairs.length, 0);
});

test("omits every repeated measurement for a part without choosing first or last", () => {
  const current = testData([measurement(0, 1, 1, 10), measurement(0, 1, 1, 11), measurement(1, 2, 2, 12)]);
  const previous = testData([measurement(20, 1, 1, 20), measurement(21, 2, 2, 21)]);
  const currentRun = runFor(current);
  currentRun.parts = [currentRun.parts[0], currentRun.parts[2]];
  assert.deepEqual(getRunComparisonPairs(currentRun, runFor(previous), current, previous).pairs,
    [{ x: 21, y: 12, site: 1, partIndex: 1 }]);
  assert.equal(getRunComparisonPairs(runFor(previous), currentRun, previous, current).pairs.length, 1);
});

test("rejects mismatched test IDs or units without implicit unit conversion", () => {
  const current = testData([measurement(0, 0, 0, 1)]);
  const previous = testData([measurement(0, 0, 0, 2)], { unit: "mV" });
  assert.match(paired(current, previous).reason, /units differ/);
  assert.match(paired(current, { ...previous, id: 101 }).reason, /same test number/);
  assert.equal(paired(current, { ...previous, unit: " V " }).pairs.length, 1);
});

test("requires measurement coordinates to agree with its actual part and excludes nonfinite values", () => {
  const current = testData([measurement(0, 0, 0, 1), measurement(1, 1, 1, Infinity)]);
  const previous = testData([measurement(0, 0, 0, 2), measurement(1, 1, 1, 3)]);
  const currentRun = runFor(current);
  currentRun.parts[0].x = 2;
  assert.equal(getRunComparisonPairs(currentRun, runFor(previous), current, previous).pairs.length, 0);
  assert.equal(paired(current, previous).pairs.length, 1);
});

test("rejects duplicate part indexes even when coordinates differ", () => {
  const current = testData([measurement(0, 0, 0, 1)]), previous = testData([measurement(0, 0, 0, 2)]);
  const currentRun = runFor(current);
  currentRun.parts.push({ ...currentRun.parts[0], x: 1 });
  assert.equal(getRunComparisonPairs(currentRun, runFor(previous), current, previous).pairs.length, 0);
});

test("reports absent comparison inputs without producing fabricated pairs", () => {
  const current = testData([measurement(0, 0, 0, 1)]), run = runFor(current);
  assert.match(getRunComparisonPairs(run, undefined, current, undefined).reason, /second run/);
  assert.match(getRunComparisonPairs(run, run, current, undefined).reason, /same test number/);
});
