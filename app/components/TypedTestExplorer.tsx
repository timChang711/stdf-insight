"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TypedObservation, TypedTest } from "../lib/typed-records";
import type { RunData } from "../lib/model";
import { readRecordBytes } from "../lib/record-source";
import "./typed-test-explorer.css";
import TestCatalogTable from "./TestCatalogTable";

type Props = { tests: TypedTest[]; run?: RunData; initialKey?: string; onInspectPart?: (partIndex: number) => void };
type Verdict = TypedObservation["verdict"];
const PAGE_SIZE = 50;
const ARRAY_PAGE_SIZE = 50;
const EMPTY_OBSERVATIONS: TypedObservation[] = [];
const own = (object: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const count = (number: number) => number.toLocaleString("en-US");
const validPart = (part: number | null): part is number => part !== null && Number.isSafeInteger(part) && part >= 0;
const coveredParts = (observations: TypedObservation[]) => new Set(observations.filter(observation => validPart(observation.partIndex)).map(observation => observation.partIndex)).size;
const headSite = (observation: TypedObservation) => `${observation.head}:${observation.site}`;
const resultArray = (observation: TypedObservation): unknown[] => Array.isArray(observation.effective.RTN_RSLT) ? observation.effective.RTN_RSLT : [];
const recordKey = (observation: TypedObservation, index: number) => `${observation.record.ordinal}:${observation.record.offset}:${index}`;
const plainValue = (value: unknown): string => {
  if (value === undefined) return "Unavailable";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isNaN(value) ? "NaN (non-finite)" : value === Infinity ? "+Infinity (non-finite)" : value === -Infinity ? "-Infinity (non-finite)" : Object.is(value, -0) ? "-0" : String(value);
  if (typeof value === "string") return value.length ? value.replace(/\0/g, "\u2400") : '"" (empty string)';
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value, (_key, item) => typeof item === "number" && !Number.isFinite(item) ? plainValue(item) : typeof item === "bigint" ? `${item}n` : item, 2) ?? String(value);
  } catch { return "Value could not be formatted"; }
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`typed-verdict typed-verdict-${verdict}`}>{verdict.toUpperCase()}</span>;
}

/** Arrays remain independently indexed. No matching of results to pin arrays is implied. */
function ArrayValue({ values, label }: { values: unknown[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(values.length / ARRAY_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  return <details className="typed-array" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{count(values.length)} entries<span className="typed-sr-only"> in {label}</span></summary>
    {open && <div className="typed-array-body">
      {values.length ? <><ol start={page * ARRAY_PAGE_SIZE} className="typed-array-values" aria-label={`${label} entries, zero-based index`}>
        {values.slice(page * ARRAY_PAGE_SIZE, (page + 1) * ARRAY_PAGE_SIZE).map((value, index) => <li key={page * ARRAY_PAGE_SIZE + index}><code>{plainValue(value)}</code></li>)}
      </ol><div className="typed-array-pagination"><button type="button" disabled={!page} onClick={() => setPage(page - 1)} aria-label={`Previous ${label} entries`}>Previous</button><span>{page * ARRAY_PAGE_SIZE}–{Math.min(values.length - 1, (page + 1) * ARRAY_PAGE_SIZE - 1)} of {count(values.length)} entries</span><button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label={`Next ${label} entries`}>Next</button></div></> : <p>No entries recorded.</p>}
    </div>}
  </details>;
}

function FieldValue({ value, label }: { value: unknown; label: string }) {
  return Array.isArray(value) ? <ArrayValue values={value} label={label}/> : <code className="typed-field-value">{plainValue(value)}</code>;
}

function EffectiveFields({ observation, fields }: { observation: TypedObservation; fields: Array<[string, string]> }) {
  return <dl className="typed-field-summary">{fields.map(([field, title]) => <div key={field}><dt>{title}<small>{field}</small></dt><dd><FieldValue value={observation.effective[field]} label={field}/></dd></div>)}</dl>;
}

function SourceFields({ observation }: { observation: TypedObservation }) {
  const [open, setOpen] = useState(false);
  const fields = [...new Set([...Object.keys(observation.raw), ...Object.keys(observation.effective), ...observation.present, ...Object.keys(observation.inherited)])];
  const present = new Set(observation.present);
  const inherited = (field: string) => Object.prototype.hasOwnProperty.call(observation.inherited, field);
  return <details className="typed-source-fields" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Raw / effective fields and inheritance <span>({count(fields.length)} fields)</span></summary>
    {open && <><p>Raw values belong to this record. An effective value may come from an earlier record; its source ordinal is shown when supplied.</p>
      <div className="typed-table-scroll" role="region" aria-label="Raw and effective record fields" tabIndex={0}><table className="typed-source-table"><thead><tr><th scope="col">Field</th><th scope="col">Raw value</th><th scope="col">Effective value</th><th scope="col">Source</th></tr></thead><tbody>
        {fields.map(field => <tr key={field}><th scope="row"><code>{field}</code></th><td>{own(observation.raw, field) ? <FieldValue value={observation.raw[field]} label={`${field} raw`}/> : <span className="typed-muted">Omitted in this record</span>}</td><td>{own(observation.effective, field) ? <FieldValue value={observation.effective[field]} label={`${field} effective`}/> : <span className="typed-muted">Unavailable</span>}</td><td>{inherited(field) ? `Inherited from record #${observation.inherited[field]}` : present.has(field) ? "Present / decoded in record" : own(observation.raw, field) ? "Raw field; presence not marked" : "Effective only; origin not supplied"}</td></tr>)}
      </tbody></table></div></>}
  </details>;
}

function SourceBytes({ run, observation }: { run: RunData; observation: TypedObservation }) {
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; hex?: string; total?: number; message?: string }>({ status: "idle" });
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [run, observation.record]);
  const load = async () => {
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    setState({ status: "loading" });
    try {
      const bytes = await readRecordBytes(run, observation.record, pending.signal);
      if (pending.signal.aborted || controller.current !== pending) return;
      const preview = bytes.subarray(0, 256);
      const lines = [];
      for (let offset = 0; offset < preview.length; offset += 16) lines.push(`${(observation.record.offset + offset).toString(16).padStart(8, "0")}: ${Array.from(preview.subarray(offset, offset + 16), byte => byte.toString(16).padStart(2, "0")).join(" ")}`);
      setState({ status: "ready", hex: lines.join("\n"), total: bytes.length });
    } catch (error) {
      if (pending.signal.aborted || controller.current !== pending) return;
      setState({ status: "error", message: error instanceof Error ? error.message : "Could not read this local record." });
    } finally { if (controller.current === pending) controller.current = null; }
  };
  return <section className="typed-source-bytes" aria-label="Source record bytes">
    <div><button type="button" disabled={state.status === "loading"} onClick={() => void load()}>{state.status === "ready" ? "Reload source bytes" : "View source bytes"}</button>{state.status === "loading" && <button type="button" onClick={() => { controller.current?.abort(); controller.current = null; setState({ status: "idle", message: "Source read cancelled." }); }}>Cancel source read</button>}{state.status === "ready" && <button type="button" onClick={() => setState({ status: "idle" })}>Clear bytes</button>}</div>
    {state.status === "loading" && <p role="status">Reading the original local file. No bytes are uploaded.</p>}
    {state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    {state.status === "ready" && <><p>{count(state.total ?? 0)} bytes including the 4-byte record header. Showing the first {Math.min(state.total ?? 0, 256)} bytes; addresses refer to the uncompressed STDF stream.</p><pre tabIndex={0} aria-label="Source record hex preview">{state.hex}</pre></>}
  </section>;
}

export function ObservationDetails({ observation, run, onInspectPart }: { observation: TypedObservation; run?: RunData; onInspectPart?: Props["onInspectPart"] }) {
  const isFtr = observation.kind === "FTR";
  return <div className="typed-explorer typed-record-details">
    <div className="typed-record-detail-heading"><h4>{observation.kind} record #{observation.record.ordinal}</h4>{validPart(observation.partIndex) && onInspectPart && <button type="button" onClick={() => onInspectPart(observation.partIndex as number)}>Inspect PRR part #{observation.partIndex + 1}</button>}</div>
    <p className="typed-record-source">Byte offset {count(observation.record.offset)} · body length {count(observation.record.bodyLength)} bytes · head {observation.head} / site {observation.site}. {validPart(observation.partIndex) ? `Linked to PRR part #${observation.partIndex + 1} (partIndex ${observation.partIndex}).` : "No linked PRR part; this record is retained."}</p>
    <div className="typed-record-outcome"><span>Record verdict <VerdictBadge verdict={observation.verdict}/></span><span>Execution: <b>{observation.execution === "executed" ? "Executed" : "Not executed"}</b></span></div>
    <p className="typed-scope-note">The record verdict is separate from overall die disposition.{!isFtr && " It does not assign a pass/fail result to each return value."}</p>
    {observation.diagnostics.length > 0 && <section className="typed-diagnostics" aria-label="Record diagnostics"><h5>Record diagnostics</h5><ul>{observation.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic}</li>)}</ul></section>}
    {isFtr ? <>
      <h5>Functional record summary</h5>
      <EffectiveFields observation={observation} fields={[["NUM_FAIL", "Reported failing pins"], ["VECT_NAM", "Vector name"], ["CYCL_CNT", "Cycle count"], ["REL_VADR", "Relative vector address"], ["REPT_CNT", "Repeat count"], ["PATG_NUM", "Pattern generator number"]]}/>
      <details className="typed-return-fields"><summary>Pin and vector details</summary><p>Arrays and bitfields are shown as decoded. No pin-to-result mapping is inferred. X / Y failure addresses are logical device failure addresses, not wafer coordinates.</p><EffectiveFields observation={observation} fields={[["RTN_ICNT", "Return pin count"], ["PGM_ICNT", "Program pin count"], ["RTN_INDX", "Return pin indexes"], ["RTN_STAT", "Return pin states"], ["PGM_INDX", "Program pin indexes"], ["PGM_STAT", "Program pin states"], ["FAIL_PIN", "Fail-pin bitfield"], ["SPIN_MAP", "Enabled-comparison pin map"], ["XFAIL_AD", "Fail X address"], ["YFAIL_AD", "Fail Y address"], ["VECT_OFF", "Vector offset"], ["TIME_SET", "Time set"], ["OP_CODE", "Operation code"]]}/></details>
    </> : <>
      <h5>Multiple-return record</h5><p>Return results, pin indexes and pin states are separate arrays. Different lengths are preserved; equal-length pairing is not assumed.</p>
      <EffectiveFields observation={observation} fields={[["RTN_RSLT", "Return results · raw"], ["RTN_INDX", "Return pin indexes"], ["RTN_STAT", "Return pin states"]]}/>
      <details className="typed-return-fields"><summary>Scaling, limits and input fields</summary><p>These are recorded / inherited fields for inspection. No capability statistic or per-result limit verdict is calculated here.</p><EffectiveFields observation={observation} fields={[["RES_SCAL", "Result exponent"], ["UNITS", "Result units"], ["LO_LIMIT", "Lower limit · raw"], ["HI_LIMIT", "Upper limit · raw"], ["LLM_SCAL", "Lower-limit exponent"], ["HLM_SCAL", "Upper-limit exponent"], ["START_IN", "Starting input"], ["INCR_IN", "Input increment"], ["UNITS_IN", "Input units"]]}/></details>
    </>}
    <SourceFields observation={observation}/>
    {run && <SourceBytes run={run} observation={observation}/>}
  </div>;
}

export default function TypedTestExplorer({ tests, run, initialKey, onInspectPart }: Props) {
  const id = useId();
  const [selection, setSelection] = useState<{ tests: TypedTest[]; key: string | undefined }>({ tests, key: initialKey });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | TypedTest["kind"]>("all");
  const [outcome, setOutcome] = useState<"all" | Verdict>("all");
  const [site, setSite] = useState("all");
  const [pageState, setPage] = useState({ scope: "", page: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resultState, setResultIndex] = useState<{ testKey: string; value: string }>({ testKey: "", value: "0" });
  const selectedKey = selection.tests === tests ? selection.key : initialKey;
  const selected = tests.find(test => test.key === selectedKey) ?? tests[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const catalog = useMemo(() => tests.filter(test => (kind === "all" || test.kind === kind) && (!normalizedQuery || `${test.kind} ${test.number} ${test.name}`.toLocaleLowerCase().includes(normalizedQuery))), [tests, kind, normalizedQuery]);
  const observations = selected?.observations ?? EMPTY_OBSERVATIONS;
  const sites = useMemo(() => [...new Map(observations.map(observation => [headSite(observation), { head: observation.head, site: observation.site }])).entries()].sort((a, b) => a[1].head - b[1].head || a[1].site - b[1].site), [observations]);
  const filtered = useMemo(() => observations.filter(observation => (outcome === "all" || observation.verdict === outcome) && (site === "all" || headSite(observation) === site)), [observations, outcome, site]);
  const totalParts = useMemo(() => coveredParts(observations), [observations]);
  const filteredParts = useMemo(() => coveredParts(filtered), [filtered]);
  const unlinked = useMemo(() => observations.filter(observation => !validPart(observation.partIndex)).length, [observations]);
  const maxResults = useMemo(() => observations.reduce((largest, observation) => Math.max(largest, resultArray(observation).length), 0), [observations]);
  const resultText = resultState.testKey === selected?.key ? resultState.value : "0";
  const parsedResultIndex = Number(resultText);
  const validResultIndex = !!resultText.trim() && Number.isSafeInteger(parsedResultIndex) && parsedResultIndex >= 0 && parsedResultIndex < maxResults;
  const resultIndex = validResultIndex ? parsedResultIndex : null;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const scope = `${selected?.key ?? ""}\u0000${outcome}\u0000${site}`;
  const page = pageState.scope === scope ? Math.min(pageState.page, pages - 1) : 0;
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const clearFilters = () => { setOutcome("all"); setSite("all"); setPage({ scope: "", page: 0 }); };
  const choose = (test: TypedTest) => { setSelection({ tests, key: test.key }); clearFilters(); setExpanded(null); };
  const updateResult = (value: string) => setResultIndex({ testKey: selected?.key ?? "", value });
  const selectedVisible = !!selected && catalog.some(test => test.key === selected.key);

  return <section className="typed-explorer" aria-label="Functional and multiple-return test explorer">
    <header className="typed-explorer-heading"><div><p className="typed-eyebrow">Record explorer</p><h2>Functional &amp; multiple-return tests</h2></div><p>Inspect every decoded FTR / MPR record, including unknown and unlinked records. Counts describe source coverage, not an execution rate.</p></header>
    {!tests.length ? <div className="typed-empty"><h3>No FTR or MPR tests available</h3><p>Load a file containing decoded functional or multiple-return records. Parametric PTR analysis remains in Test Explorer.</p></div> : <div className="typed-explorer-layout">
      <aside className="typed-catalog" aria-label="FTR and MPR test catalog">
        <label htmlFor={`${id}-search`}>Find a test<input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or test number" aria-label="Search functional and multiple-return tests"/></label>
        <label htmlFor={`${id}-kind`}>Record kind<select id={`${id}-kind`} value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="all">All FTR / MPR</option><option value="FTR">FTR · Functional</option><option value="MPR">MPR · Multiple-return</option></select></label>
        <div className="typed-catalog-count"><span>{count(catalog.length)} of {count(tests.length)} tests</span>{(query || kind !== "all") && <button type="button" onClick={() => { setQuery(""); setKind("all"); }}>Clear search</button>}</div>
        <TestCatalogTable rows={catalog.map(test => ({ key: test.key, number: test.number, name: test.name, kind: test.kind, records: test.observations.length }))} selectedKey={selected?.key} onSelect={key => { const test = catalog.find(item => item.key === key); if (test) choose(test); }} label="Available functional and multiple-return tests" variant="typed" empty="No tests match. Clear the search or choose another record kind."/>
      </aside>
      {selected && <section className="typed-test-panel" aria-label="Selected typed test">
        <header className="typed-test-heading"><div><span className={`typed-kind typed-kind-${selected.kind.toLowerCase()}`}>{selected.kind}</span><code>Test {selected.number}</code></div><h3>{selected.name || "Unnamed test"}</h3>{!selectedVisible && <p className="typed-filter-note">This selected test is outside the current catalog search. Its records remain visible.</p>}</header>
        {selected.kind === "MPR" && <p className="typed-qualification-note" role="note">MPR parsing has synthetic validation only; no real MPR sample has been verified.</p>}
        <div className="typed-counts"><div><span>RECORDS</span><b>{count(observations.length)}</b></div><div><span>COVERED PRR PARTS</span><b>{count(totalParts)}</b></div></div>
        <p className="typed-coverage-note">Covered PRR parts are distinct linked part indexes. {count(unlinked)} record{unlinked === 1 ? " has" : "s have"} no PRR link and remain available below. Repeated records are retained.</p>
        <div className="typed-record-filters" role="group" aria-label="Record filters">
          <label htmlFor={`${id}-outcome`}>Record verdict<select id={`${id}-outcome`} value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}><option value="all">All verdicts</option><option value="pass">PASS</option><option value="fail">FAIL</option><option value="unknown">UNKNOWN</option></select></label>
          <label htmlFor={`${id}-site`}>Head / site<select id={`${id}-site`} value={site} onChange={event => setSite(event.target.value)}><option value="all">All heads / sites</option>{sites.map(([value, pair]) => <option key={value} value={value}>Head {pair.head} / site {pair.site}</option>)}{site !== "all" && !sites.some(([value]) => value === site) && <option value={site}>Unavailable head / site ({site})</option>}</select></label>
          <button type="button" onClick={clearFilters} disabled={outcome === "all" && site === "all"}>Clear filters</button>
        </div>
        {selected.kind === "MPR" && <div className="typed-result-picker"><div className="typed-result-input"><label htmlFor={`${id}-result`}>Return result index (zero-based)<input id={`${id}-result`} type="number" min={0} max={Math.max(0, maxResults - 1)} step={1} disabled={!maxResults} value={resultText} onChange={event => updateResult(event.target.value)} aria-invalid={maxResults > 0 && !validResultIndex || undefined} aria-describedby={`${id}-result-help`}/></label><button type="button" disabled={resultIndex === null || resultIndex === 0} onClick={() => updateResult(String((resultIndex ?? 0) - 1))} aria-label="Previous return result index">Previous index</button><button type="button" disabled={resultIndex === null || resultIndex >= maxResults - 1} onClick={() => updateResult(String((resultIndex ?? 0) + 1))} aria-label="Next return result index">Next index</button></div><p id={`${id}-result-help`}>{!maxResults ? "No return-result entries are available in these records." : !validResultIndex ? `Enter an integer from 0 to ${maxResults - 1}. Records remain visible while the index is invalid.` : `Index ${resultIndex} of 0–${maxResults - 1}. Shorter records show Missing; non-finite values remain visible.`} Stored result values are shown before decimal scaling; RES_SCAL and UNITS are listed separately. A record verdict is not an individual result verdict.</p></div>}
        <div className="typed-filtered-count" role="status">{count(filtered.length)} filtered records · {count(filteredParts)} covered PRR parts{filtered.length > 0 && ` · showing ${page * PAGE_SIZE + 1}–${Math.min(filtered.length, (page + 1) * PAGE_SIZE)}`}</div>
        {!filtered.length ? <div className="typed-empty"><h4>No records match</h4><p>{observations.length ? "Clear the record filters to see every record for this test." : "This test has no decoded observations."}</p>{observations.length > 0 && <button type="button" onClick={clearFilters}>Show all records</button>}</div> : <div className="typed-record-list">
          <div className="typed-table-scroll" role="region" aria-label="Typed test records" tabIndex={0}><table className="typed-record-table"><thead><tr><th scope="col">Record / details</th><th scope="col">Record verdict</th><th scope="col">Execution</th><th scope="col">PRR part</th><th scope="col">Head / site</th>{selected.kind === "MPR" ? <><th scope="col">Result [{resultIndex ?? "—"}] · raw</th><th scope="col">Scale / unit</th></> : <><th scope="col">Reported failing pins</th><th scope="col">Vector name</th></>}</tr></thead><tbody>{visible.map((observation, index) => {
            const key = `${selected.key}:${recordKey(observation, page * PAGE_SIZE + index)}`;
            const isOpen = expanded === key;
            const values = resultArray(observation);
            const result = resultIndex === null ? "Choose a valid index" : resultIndex >= values.length ? "Missing" : plainValue(values[resultIndex]);
            const detailsId = `${id}-record-${page * PAGE_SIZE + index}`;
            return <TypedRecordRows key={key} observation={observation} run={run} kind={selected.kind} result={result} expanded={isOpen} detailsId={detailsId} onToggle={() => setExpanded(isOpen ? null : key)} onInspectPart={onInspectPart}/>;
          })}</tbody></table></div>
          <nav className="typed-pagination" aria-label="Typed records pagination"><button type="button" disabled={!page} onClick={() => { setPage({ scope, page: page - 1 }); setExpanded(null); }}>Previous records</button><span>Page {count(page + 1)} of {count(pages)} · {PAGE_SIZE} records per page</span><button type="button" disabled={page >= pages - 1} onClick={() => { setPage({ scope, page: page + 1 }); setExpanded(null); }}>Next records</button></nav>
        </div>}
        <p className="typed-analysis-boundary">{selected.kind === "FTR" ? "Functional records are inspected as discrete outcomes and pin / vector details. Histograms and capability statistics are not applied." : "Multiple-return arrays are inspected without combining channels or inferring child pass/fail outcomes. Numeric statistics are not calculated in this view."}</p>
      </section>}
    </div>}
  </section>;
}

function TypedRecordRows({ observation, run, kind, result, expanded, detailsId, onToggle, onInspectPart }: {
  observation: TypedObservation; run?: RunData; kind: TypedTest["kind"]; result: string; expanded: boolean; detailsId: string; onToggle: () => void; onInspectPart?: Props["onInspectPart"];
}) {
  return <><tr className={expanded ? "typed-record-row typed-record-row-open" : "typed-record-row"}>
    <td><button type="button" className="typed-record-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}><span aria-hidden="true">{expanded ? "−" : "+"}</span> #{observation.record.ordinal}<span className="typed-sr-only"> {expanded ? "Hide" : "Inspect"} record details</span></button>{observation.diagnostics.length > 0 && <small className="typed-diagnostic-count">{observation.diagnostics.length} diagnostic{observation.diagnostics.length === 1 ? "" : "s"}</small>}</td>
    <td><VerdictBadge verdict={observation.verdict}/></td><td>{observation.execution === "executed" ? "Executed" : "Not executed"}</td><td>{validPart(observation.partIndex) ? `#${observation.partIndex + 1}` : <span className="typed-muted">Unlinked</span>}</td><td>{observation.head} / {observation.site}</td>
    {kind === "MPR" ? <><td className="typed-indexed-result"><code>{result}</code></td><td><span>RES_SCAL: {plainValue(observation.effective.RES_SCAL)}</span><span className="typed-units">{own(observation.effective, "UNITS") ? plainValue(observation.effective.UNITS) : "Unit unavailable"}</span></td></> : <><td><FieldValue value={observation.effective.NUM_FAIL} label="Reported failing pins"/></td><td className="typed-vector-name"><FieldValue value={observation.effective.VECT_NAM} label="Vector name"/></td></>}
  </tr>{expanded && <tr className="typed-record-expanded"><td colSpan={7} id={detailsId}><ObservationDetails observation={observation} run={run} onInspectPart={onInspectPart}/></td></tr>}</>;
}
