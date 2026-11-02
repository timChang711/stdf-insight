export type CatalogSortColumn = "number" | "name" | "failRate" | "cpk" | "kind" | "records";
export type CatalogSort = { column: CatalogSortColumn; direction: "ascending" | "descending" };

type SortableRow = {
  number: number;
  name: string;
  failRate?: number | null;
  cpk?: number | null;
  kind?: string;
  records?: number;
};

const missing = (value: string | number | null | undefined) => value == null || value === "" || (typeof value === "number" && !Number.isFinite(value));

/** Keep missing values last in either direction and preserve file order for ties. */
export function sortCatalogRows<Row extends SortableRow>(rows: Row[], sort: CatalogSort | null): Row[] {
  if (!sort) return rows;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = a.row[sort.column], right = b.row[sort.column];
    const leftMissing = missing(left), rightMissing = missing(right);
    if (leftMissing || rightMissing) return leftMissing === rightMissing ? a.index - b.index : leftMissing ? 1 : -1;
    const comparison = typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" });
    return comparison === 0 ? a.index - b.index : sort.direction === "ascending" ? comparison : -comparison;
  }).map(({ row }) => row);
}
