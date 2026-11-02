import test from "node:test";
import assert from "node:assert/strict";
import { sortCatalogRows } from "../app/lib/test-catalog-sort.ts";

const row = (number, changes = {}) => ({ number, name: `Test ${number}`, ...changes });

test("keeps original file order before sorting and does not mutate it", () => {
  const rows = [row(8), row(2), row(3)];
  assert.equal(sortCatalogRows(rows, null), rows);
  assert.deepEqual(sortCatalogRows(rows, { column: "number", direction: "ascending" }).map(r => r.number), [2, 3, 8]);
  assert.deepEqual(rows.map(r => r.number), [8, 2, 3]);
});

test("Cpk sort keeps unavailable values last in both directions and keeps equal values stable", () => {
  const rows = [row(1, { cpk: null }), row(2, { cpk: .8 }), row(3, { cpk: NaN }), row(4, { cpk: 2.1 }), row(5, { cpk: .8 }), row(6), row(7, { cpk: Infinity })];
  assert.deepEqual(sortCatalogRows(rows, { column: "cpk", direction: "ascending" }).map(r => r.number), [2, 5, 4, 1, 3, 6, 7]);
  assert.deepEqual(sortCatalogRows(rows, { column: "cpk", direction: "descending" }).map(r => r.number), [4, 2, 5, 1, 3, 6, 7]);
});

test("fail and record sorting compare numeric values, including zero", () => {
  const rows = [row(1, { failRate: 0, records: 20 }), row(2, { failRate: .02, records: 100 }), row(3, { failRate: .1, records: 2 }), row(4)];
  assert.deepEqual(sortCatalogRows(rows, { column: "failRate", direction: "descending" }).map(r => r.number), [3, 2, 1, 4]);
  assert.deepEqual(sortCatalogRows(rows, { column: "records", direction: "ascending" }).map(r => r.number), [3, 1, 2, 4]);
});

test("names use natural sort and typed rows can sort by kind", () => {
  const rows = [row(1, { name: "Test 10", kind: "MPR" }), row(2, { name: "test 2", kind: "FTR" }), row(3, { name: "Test 2", kind: "MPR" }), row(4, { name: "" })];
  assert.deepEqual(sortCatalogRows(rows, { column: "name", direction: "ascending" }).map(r => r.number), [2, 3, 1, 4]);
  assert.deepEqual(sortCatalogRows(rows, { column: "kind", direction: "descending" }).map(r => r.number), [1, 3, 2, 4]);
});
