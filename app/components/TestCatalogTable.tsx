"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { sortCatalogRows, type CatalogSort, type CatalogSortColumn } from "../lib/test-catalog-sort";
import "./test-catalog-table.css";

type CatalogKey = string | number;
export type TestCatalogRow<Key extends CatalogKey> = {
  key: Key;
  number: number;
  name: string;
  failRate?: number | null;
  cpk?: number | null;
  kind?: "FTR" | "MPR";
  records?: number;
};
type Props<Key extends CatalogKey> = {
  rows: TestCatalogRow<Key>[];
  selectedKey: Key | undefined;
  onSelect: (key: Key) => void;
  label: string;
  variant?: "parametric" | "typed";
  empty: ReactNode;
};

const numberText = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });

/** Native table semantics with one keyboard entry point for the test selector. */
export default function TestCatalogTable<Key extends CatalogKey>({ rows, selectedKey, onSelect, label, variant = "parametric", empty }: Props<Key>) {
  const hintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<Key, HTMLButtonElement>());
  const [sort, setSort] = useState<CatalogSort | null>(null);
  const displayedRows = useMemo(() => sortCatalogRows(rows, sort), [rows, sort]);
  const selectedIndex = displayedRows.findIndex(row => row.key === selectedKey);
  const tabKey = displayedRows[selectedIndex < 0 ? 0 : selectedIndex]?.key;

  const reveal = (button: HTMLButtonElement) => {
    const scroll = scrollRef.current;
    const row = button.closest("tr");
    if (!scroll || !row) return;
    const viewport = scroll.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const headerHeight = scroll.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = viewport.top + headerHeight;
    if (bounds.top < top) scroll.scrollTop += bounds.top - top;
    else if (bounds.bottom > viewport.bottom) scroll.scrollTop += bounds.bottom - viewport.bottom;
  };

  useEffect(() => {
    const button = selectedKey === undefined ? undefined : buttons.current.get(selectedKey);
    if (button) reveal(button);
  }, [selectedKey, displayedRows]);

  const choose = (key: Key) => {
    if (key !== selectedKey) onSelect(key);
    const button = buttons.current.get(key);
    if (button) { button.focus({ preventScroll: true }); reveal(button); }
  };

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = Math.min(displayedRows.length - 1, index + 1); break;
      case "ArrowUp": next = Math.max(0, index - 1); break;
      case "Home": next = 0; break;
      case "End": next = displayedRows.length - 1; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    choose(displayedRows[next].key);
  };

  const columnHeader = (column: CatalogSortColumn, title: string, numeric = false) => {
    const active = sort?.column === column;
    const direction = active && sort.direction === "ascending" ? "descending" : active ? "ascending" : column === "failRate" || column === "records" ? "descending" : "ascending";
    return <th scope="col" className={numeric ? "catalog-numeric" : undefined} aria-sort={active ? sort.direction : "none"}>
      <button type="button" className="catalog-sort" onClick={() => setSort({ column, direction })} aria-label={`Sort by ${title}, ${direction}`} title={`Sort ${direction}`}>
        <span>{title}</span><span className={`catalog-sort-arrow${active ? " catalog-sort-active" : ""}`} aria-hidden="true">{active ? sort.direction === "ascending" ? "↑" : "↓" : "↕"}</span>
      </button>
    </th>;
  };

  return <div className={`test-catalog test-catalog-${variant}`}>
    <div className="test-catalog-hint"><span id={hintId}>↑ ↓ switch tests · Click headers to sort</span>{sort && <button type="button" className="catalog-reset-sort" onClick={() => setSort(null)}>File order</button>}</div>
    <div className="test-catalog-scroll" ref={scrollRef}>
      <table className="test-catalog-table" aria-label={label} aria-describedby={hintId}>
        <colgroup>{variant === "typed" && <col className="catalog-kind-column"/>}<col className="catalog-number-column"/><col className="catalog-name-column"/>{variant === "typed" ? <col className="catalog-records-column"/> : <><col className="catalog-fail-column"/><col className="catalog-cpk-column"/></>}</colgroup>
        <thead><tr>{variant === "typed" && columnHeader("kind", "Kind")}{columnHeader("number", "Test #")}{columnHeader("name", "Test name")}{variant === "typed" ? columnHeader("records", "Records", true) : <>{columnHeader("failRate", "Fail %", true)}{columnHeader("cpk", "Cpk", true)}</>}</tr></thead>
        <tbody>{displayedRows.map((row, index) => <tr key={row.key} className={row.key === selectedKey ? "catalog-row catalog-row-selected" : "catalog-row"} aria-current={row.key === selectedKey ? "true" : undefined} onClick={() => choose(row.key)}>
          {variant === "typed" && <td><span className={`catalog-kind catalog-kind-${row.kind?.toLowerCase()}`}>{row.kind}</span></td>}
          <td><button type="button" className="catalog-test-select" ref={node => { if (node) buttons.current.set(row.key, node); else buttons.current.delete(row.key); }} tabIndex={row.key === tabKey ? 0 : -1} aria-label={`Select ${row.kind ? `${row.kind} ` : ""}test ${row.number}: ${row.name || "Unnamed test"}`} aria-pressed={row.key === selectedKey} onKeyDown={event => navigate(event, index)} onFocus={event => reveal(event.currentTarget)}>{row.number}</button></td>
          <td className="catalog-test-name" title={row.name || "Unnamed test"}>{row.name || "Unnamed test"}</td>
          {variant === "typed" ? <td className="catalog-numeric">{numberText(row.records, 0)}</td> : <><td className={`catalog-numeric${row.failRate != null && Number.isFinite(row.failRate) && row.failRate > 0 ? " catalog-has-fail" : ""}`}>{row.failRate == null || !Number.isFinite(row.failRate) ? "—" : `${(row.failRate * 100).toFixed(2)}%`}</td><td className={`catalog-numeric${row.cpk != null && Number.isFinite(row.cpk) ? row.cpk < 1.33 ? " catalog-low-cpk" : row.cpk >= 1.67 ? " catalog-capable" : "" : ""}`} title={row.cpk != null && Number.isFinite(row.cpk) && row.cpk < 1.33 ? "Cpk below 1.33" : undefined}>{numberText(row.cpk)}</td></>}
        </tr>)}{!displayedRows.length && <tr><td colSpan={4} className="catalog-empty">{empty}</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
