"use client";

import { Fragment, useId, useMemo, useState } from "react";
import type { PartData, RunData, TestData } from "../lib/model";
import type { FailingTest, PartTestMeasurements } from "../lib/die-inspection";
import { buildDieResultIndex, dieTestLimits, dieTestVerdict, getDieTestRows } from "../lib/die-results";
import type { DieResultIndex, DieTestRow } from "../lib/die-results";
import { typedObservationName } from "../lib/typed-records";
import type { TypedObservation } from "../lib/typed-records";
import { ObservationDetails } from "./TypedTestExplorer";
import "./die-inspection.css";

const EMPTY_OBSERVATIONS: readonly TypedObservation[] = [];
const EMPTY_TESTS: readonly TestData[] = [];
const PAGE_SIZE = 50;
type ResultFilter = "all" | "fail" | "unknown";
type ResultSort = "number" | "name" | "verdict";
const rowName = (row: DieTestRow) => row.kind === "PTR" ? row.test.name || "Unnamed test" : typedObservationName(row.observation);
const verdictOrder = { fail: 0, unknown: 1, pass: 2 };
const valueText = (value: unknown) => typeof value !== "number" ? "—" : Number.isFinite(value) ? value.toLocaleString("en-US", { maximumSignificantDigits: 8 }) : Number.isNaN(value) ? "NaN" : value > 0 ? "+Infinity" : "−Infinity";
const cleanText = (value: unknown) => typeof value === "string" ? value.replace(/\0/g, "").trim() : "";

function RowValue({ row }: { row: DieTestRow }) {
  if (row.kind === "PTR") return <>{valueText(row.measurement.value)}{!Number.isFinite(row.measurement.value) && <small className="die-value-note">Invalid numeric value</small>}</>;
  if (row.kind === "FTR") return <span className="die-unavailable">—</span>;
  const values: unknown[] = Array.isArray(row.observation.effective.RTN_RSLT) ? row.observation.effective.RTN_RSLT : [];
  return values.length ? <><span>{values.slice(0, 3).map(valueText).join(", ")}{values.length > 3 && " …"}</span><small className="die-value-note">{values.length} raw value{values.length === 1 ? "" : "s"}</small></> : <span className="die-unavailable">—</span>;
}

function PtrDetails({ row, part }: { row: Extract<DieTestRow, { kind: "PTR" }>; part: PartData }) {
  return <div className="die-ptr-details">
    <dl><div><dt>Part</dt><dd>{part.index + 1}</dd></div><div><dt>Site</dt><dd>{row.measurement.site}</dd></div><div><dt>X / Y</dt><dd>{row.measurement.x} / {row.measurement.y}</dd></div><div><dt>Parsed result</dt><dd>{dieTestVerdict(row).toUpperCase()}</dd></div><div><dt>Value</dt><dd>{valueText(row.measurement.value)} {row.test.unit}</dd></div></dl>
    <p>PTR limits use the parsed test catalog. Original PTR source fields are unavailable in this view.</p>
  </div>;
}

/** PRR disposition remains separate from every individual test result. */
export default function DieInspection({ part, run, chosen, ignoredRecords, typedObservations = EMPTY_OBSERVATIONS, typedDecoded = false, resultIndex, shown, onSelectTest }: {
  part: PartData;
  run?: RunData;
  chosen?: TestData;
  failures?: FailingTest[];
  selectedResult?: PartTestMeasurements;
  ignoredRecords: RunData["ignoredRecords"];
  typedObservations?: readonly TypedObservation[];
  typedDecoded?: boolean;
  resultIndex?: DieResultIndex;
  shown: boolean;
  onSelectTest?: (id: number) => void;
}) {
  const id = useId().replace(/:/g, "");
  const fallbackIndex = useMemo(() => resultIndex ?? buildDieResultIndex(run?.tests ?? (chosen ? [chosen] : EMPTY_TESTS)), [resultIndex, run?.tests, chosen]);
  const rows = useMemo(() => getDieTestRows(fallbackIndex, part.index, typedObservations), [fallbackIndex, part.index, typedObservations]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [sort, setSort] = useState<ResultSort>("number");
  const filteredRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const matches = rows.filter(row => (filter === "all" || dieTestVerdict(row) === filter) && (!search || `${row.testNumber} ${rowName(row)}`.toLocaleLowerCase().includes(search)));
    // Stable sorting preserves source order when the selected sort fields match.
    if (sort === "name") matches.sort((a, b) => rowName(a).localeCompare(rowName(b), "en", { numeric: true }) || a.testNumber - b.testNumber);
    if (sort === "verdict") matches.sort((a, b) => verdictOrder[dieTestVerdict(a)] - verdictOrder[dieTestVerdict(b)] || a.testNumber - b.testNumber);
    return matches;
  }, [rows, query, filter, sort]);
  const [pageState, setPage] = useState({ rows: filteredRows, page: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const page = pageState.rows === filteredRows ? Math.min(pageState.page, pages - 1) : 0;
  const visible = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const counts = useMemo(() => rows.reduce((total, row) => { total[dieTestVerdict(row)]++; return total; }, { pass: 0, fail: 0, unknown: 0 }), [rows]);
  const hasMpr = rows.some(row => row.kind === "MPR");
  const limitedCoverage = !typedDecoded && !!(ignoredRecords?.ftr || ignoredRecords?.mpr);
  const disposition = part.recordedVerdict ?? (part.pass ? "pass" : "fail");
  const changePage = (next: number) => { setPage({ rows: filteredRows, page: next }); setExpanded(null); };
  return <article className="wafer-part-inspection die-table-inspection" aria-label={`Part ${part.index + 1} inspection`}>
    <header>
      <h5>Part {part.index + 1}<span>{part.head !== undefined && `Head ${part.head} / `}Site {part.site}</span></h5>
      <div className="die-part-summary"><span>PRR <strong className={`wafer-result-badge is-${disposition}`}>{disposition.toUpperCase()}</strong></span><span>HB <b>{part.hardBin}</b></span><span>SB <b>{part.softBin}</b></span>{shown && <span className="wafer-shown-record">Shown on map</span>}</div>
    </header>
    <div className="die-table-heading"><h6>Test results <span>{rows.length.toLocaleString("en-US")}</span></h6><div className="die-test-counts" aria-label="Test result counts"><span>{counts.pass} PASS</span><span>{counts.fail} FAIL</span>{counts.unknown > 0 && <span>{counts.unknown} UNKNOWN</span>}{hasMpr && <span>MPR values / limits: raw</span>}</div></div>
    {rows.length > 0 && <div className="die-table-tools">
      <label className="die-test-search"><span className="die-sr-only">Search die test results</span><input type="search" placeholder="Test number or name" value={query} onChange={event => { setQuery(event.target.value); setExpanded(null); }}/></label>
      <label>Result<select value={filter} onChange={event => { setFilter(event.target.value as ResultFilter); setExpanded(null); }}><option value="all">All results</option><option value="fail">FAIL</option><option value="unknown">UNKNOWN</option></select></label>
      <label>Sort<select value={sort} onChange={event => { setSort(event.target.value as ResultSort); setExpanded(null); }}><option value="number">Test number</option><option value="name">Test name</option><option value="verdict">FAIL first</option></select></label>
      <span className="die-match-count" aria-live="polite">{filteredRows.length.toLocaleString("en-US")} / {rows.length.toLocaleString("en-US")}</span>
    </div>}
    {filteredRows.length ? <div className="die-results-scroll" role="region" aria-label={`Test results for part ${part.index + 1}`} tabIndex={0}>
      <table className="die-results-table"><caption>Test results for part {part.index + 1}; repeated results retained.</caption><thead><tr><th scope="col">Type</th><th scope="col">Test number</th><th scope="col">Test name</th><th scope="col">Value(s)</th><th scope="col">Unit</th><th scope="col">Lower</th><th scope="col">Upper</th><th scope="col">Result</th><th scope="col"><span className="die-sr-only">Details</span></th></tr></thead>
        <tbody>{visible.map((row, rowIndex) => {
          const verdict = dieTestVerdict(row), limits = dieTestLimits(row), open = expanded === row.key;
          const detailsId = `die-result-${id}-${page * PAGE_SIZE + rowIndex}`;
          const name = rowName(row);
          const unit = row.kind === "PTR" ? row.test.unit : row.kind === "MPR" ? cleanText(row.observation.effective.UNITS) : "";
          return <Fragment key={row.key}><tr className={row.kind === "PTR" && row.test.id === chosen?.id ? "die-test-current" : undefined} data-kind={row.kind} data-test-number={row.testNumber} data-verdict={verdict.toUpperCase()} data-record-ordinal={row.kind !== "PTR" ? row.observation.record.ordinal : undefined}>
            <td><span className={`typed-kind typed-kind-${row.kind.toLowerCase()}`}>{row.kind}</span></td><td className="die-test-number">{row.testNumber}</td><th scope="row" className="die-test-name">{row.kind === "PTR" && onSelectTest ? <button type="button" className="die-test-link" title="Open distribution" onClick={() => onSelectTest(row.test.id)}>{name}</button> : name}</th><td className="die-test-value"><RowValue row={row}/></td><td>{unit || "—"}</td><td className="die-test-limit">{valueText(limits.low)}</td><td className="die-test-limit">{valueText(limits.high)}</td><td><strong className={`wafer-result-badge is-${verdict}`}>{verdict.toUpperCase()}</strong></td><td><button type="button" className="die-details-button" aria-expanded={open} aria-controls={open ? detailsId : undefined} aria-label={`${open ? "Hide" : "Show"} details for ${row.kind} ${row.testNumber}, result ${page * PAGE_SIZE + rowIndex + 1}`} onClick={() => setExpanded(open ? null : row.key)}>{open ? "Hide" : "Details"}</button></td>
          </tr>{open && <tr className="die-result-expanded"><td colSpan={9} id={detailsId}>{row.kind === "PTR" ? <PtrDetails row={row} part={part}/> : <ObservationDetails observation={row.observation} run={run}/>}</td></tr>}</Fragment>;
        })}</tbody>
      </table>
    </div> : <p className="die-empty">{rows.length ? "No test results match these filters." : "No test results are linked to this part."}</p>}
    {pages > 1 && <div className="die-results-pagination" role="group" aria-label="Die test result pages"><button type="button" disabled={!page} onClick={() => changePage(page - 1)}>Previous</button><span>{page * PAGE_SIZE + 1}–{Math.min(filteredRows.length, (page + 1) * PAGE_SIZE)} of {filteredRows.length.toLocaleString("en-US")} results</span><button type="button" disabled={page >= pages - 1} onClick={() => changePage(page + 1)}>Next</button></div>}
    <details className="die-context-details"><summary>Record information{hasMpr ? " / MPR scaling" : ""}</summary><p>Test results are separate from the PRR die disposition. Repeated observations remain separate.</p>{part.record && <p>PRR record #{part.record.ordinal} · Byte offset {part.record.offset}</p>}{hasMpr && <p>MPR values and limits are raw, before scaling; the result applies to the record. Expand Details for exponents and independently indexed return arrays.</p>}</details>
    {limitedCoverage && <p className="wafer-coverage-note">FTR/MPR results are unavailable in this run ({ignoredRecords?.ftr ?? 0} FTR, {ignoredRecords?.mpr ?? 0} MPR).</p>}
  </article>;
}
