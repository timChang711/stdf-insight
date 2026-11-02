"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Measurement, PartData, RunData, TestData } from "../lib/model";
import { stats } from "../lib/statistics";
import { isValueInDistributionBin, type DistributionBinSelection } from "../lib/distribution";
import { buildDieResultIndex } from "../lib/die-results";
import { observationsByPart, type TypedObservation } from "../lib/typed-records";
import Distribution, { type DistributionState } from "./Distribution";
import TestCatalogTable from "./TestCatalogTable";
import WaferMap, { type MapMode } from "./WaferMap";
import DieInspection from "./DieInspection";
import "./analysis-workspace.css";

export type AnalysisTestFilter = "all" | "failing" | "review" | "capable" | "unavailable";
export type AnalysisWorkspaceProps = {
  run: RunData;
  tests: TestData[];
  selectedTest: TestData;
  filteredTest: TestData;
  site: number | "all";
  sites: number[];
  onSiteChange: (site: number | "all") => void;
  onSelectTest: (id: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  testFilter: AnalysisTestFilter;
  onTestFilterChange: (filter: AnalysisTestFilter) => void;
  summaries?: Map<number, ReturnType<typeof stats>>;
  distributionState?: DistributionState;
  onDistributionChange?: (state: DistributionState) => void;
  onExport?: (values: Measurement[]) => void;
  toolbarChildren?: ReactNode;
  chartViews?: Array<{ id: string; label: string; content: ReactNode; note?: string }>;
  activeChart?: string;
  onChartChange?: (id: string) => void;
};

type ResultFilter = "all" | "fail" | "outside";
type Coordinate = { x: number; y: number };
type Selection = { run: RunData; coordinate: Coordinate | null; partIndex: number | null };
type BinPick = { values: Measurement[]; settings: DistributionState["settings"]; bin: DistributionBinSelection };
type ResultSort = { key: "sequence" | "part" | "value" | "result"; descending: boolean };
const PAGE_SIZE = 25;
const EMPTY_OBSERVATIONS: readonly TypedObservation[] = [];
const initialDistribution = (): DistributionState => ({ settings: { binCount: 50, rangeMode: "data" }, draft: { low: "", high: "", binWidth: "" } });
const numberText = (value: number) => Number.isFinite(value) ? value.toLocaleString("en-US", { maximumSignificantDigits: 8 }) : Number.isNaN(value) ? "NaN" : value > 0 ? "+Infinity" : "−Infinity";
const coordinateIsValid = (value: { x: number; y: number }) => Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y) && value.x !== -32768 && value.y !== -32768;
const finiteLimit = (value: number | null) => value !== null && Number.isFinite(value);
const outsideLimits = (measurement: Measurement, test: TestData) => Number.isFinite(measurement.value) && ((finiteLimit(test.low) && measurement.value < test.low!) || (finiteLimit(test.high) && measurement.value > test.high!));
const limitResult = (measurement: Measurement, test: TestData) => !Number.isFinite(measurement.value) ? "Non-numeric" : finiteLimit(test.low) && measurement.value < test.low! ? "Below LSL" : finiteLimit(test.high) && measurement.value > test.high! ? "Above USL" : finiteLimit(test.low) || finiteLimit(test.high) ? "Within limits" : "No limits";

/** The selected test, distribution and wafer share one filtered measurement population. */
export default function AnalysisWorkspace({ run, tests, selectedTest, filteredTest, site, sites, onSiteChange, onSelectTest, search, onSearchChange, testFilter, onTestFilterChange, summaries, distributionState, onDistributionChange, onExport, toolbarChildren, chartViews = [], activeChart = "distribution", onChartChange }: AnalysisWorkspaceProps) {
  const distributionRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const pendingInspectorScroll = useRef(false);
  const [localDistributions, setLocalDistributions] = useState<Record<number, DistributionState>>({});
  const fallbackDistribution = useMemo(initialDistribution, []);
  const chartState = distributionState ?? localDistributions[selectedTest.id] ?? fallbackDistribution;
  const setChartState = (next: DistributionState) => onDistributionChange ? onDistributionChange(next) : setLocalDistributions(previous => ({ ...previous, [selectedTest.id]: next }));
  const [mapMode, setMapMode] = useState<MapMode>("parametric");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [binPick, setBinPick] = useState<BinPick | null>(null);
  const selectedBin = activeChart === "distribution" && binPick?.values === filteredTest.values && binPick.settings === chartState.settings ? binPick.bin : null;
  const pickBin = (bin: DistributionBinSelection | null) => { setBinPick(bin ? { values: filteredTest.values, settings: chartState.settings, bin } : null); setResultFilter("all"); setSelection(null); };
  const [resultSort, setResultSort] = useState<ResultSort>({ key: "sequence", descending: false });
  const sortResults = (key: ResultSort["key"]) => setResultSort(previous => ({ key, descending: previous.key === key ? !previous.descending : key === "result" }));
  const resultSortLabel = (key: ResultSort["key"]) => resultSort.key === key ? resultSort.descending ? "descending" as const : "ascending" as const : "none" as const;
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionIsCurrent = selection?.run === run;
  const selectedCoordinate = selectionIsCurrent ? selection.coordinate : null;
  const partByIndex = useMemo(() => new Map(run.parts.map(part => [part.index, part])), [run.parts]);
  const catalogRows = useMemo(() => tests.map(test => {
    const summary = summaries?.get(test.id) ?? stats(test);
    return { key: test.id, number: test.id, name: test.name, cpk: summary.cpk, failRate: summary.failRate };
  }), [tests, summaries]);
  const pickedValues = useMemo(() => selectedBin ? filteredTest.values.filter(measurement => isValueInDistributionBin(measurement.value, selectedBin)) : filteredTest.values, [filteredTest.values, selectedBin]);
  const mappedTest = useMemo(() => selectedBin ? { ...filteredTest, values: pickedValues } : filteredTest, [filteredTest, pickedValues, selectedBin]);
  const highlightedPartIndices = useMemo(() => selectedBin ? new Set(pickedValues.map(measurement => measurement.partIndex)) : undefined, [pickedValues, selectedBin]);
  const scopedPartIndices = useMemo(() => new Set(filteredTest.values.map(measurement => measurement.partIndex)), [filteredTest.values]);
  const mapRun = useMemo(() => ({ ...run, parts: run.parts.filter(part => scopedPartIndices.has(part.index) && (site === "all" || part.site === site)) }), [run, scopedPartIndices, site]);
  const resultRows = useMemo(() => {
    const rows = filteredTest.values.map((measurement, sequence) => ({ measurement, sequence })).filter(({ measurement }) => (!selectedBin || isValueInDistributionBin(measurement.value, selectedBin)) && (resultFilter === "all" || (resultFilter === "fail" ? measurement.pass === false : outsideLimits(measurement, selectedTest))));
    return rows.sort((a, b) => {
      const av = resultSort.key === "value" ? a.measurement.value : resultSort.key === "result" ? Number(!a.measurement.pass) : resultSort.key === "part" ? a.measurement.partIndex : a.sequence;
      const bv = resultSort.key === "value" ? b.measurement.value : resultSort.key === "result" ? Number(!b.measurement.pass) : resultSort.key === "part" ? b.measurement.partIndex : b.sequence;
      if (!Number.isFinite(av) || !Number.isFinite(bv)) return Number(!Number.isFinite(av)) - Number(!Number.isFinite(bv)) || a.sequence - b.sequence;
      return (av - bv) * (resultSort.descending ? -1 : 1) || a.sequence - b.sequence;
    });
  }, [filteredTest.values, resultFilter, selectedTest, selectedBin, resultSort]);
  const chartSummary = useMemo(() => stats(filteredTest), [filteredTest]);
  const alternateChart = chartViews.find(view => view.id === activeChart);
  const [pageState, setPageState] = useState({ rows: resultRows, page: 0 });
  const pages = Math.max(1, Math.ceil(resultRows.length / PAGE_SIZE));
  const page = pageState.rows === resultRows ? Math.min(pageState.page, pages - 1) : 0;
  const visibleRows = resultRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedParts = useMemo(() => {
    if (!selection || selection.run !== run) return [];
    if (selection.coordinate) return run.parts.filter(part => part.x === selection.coordinate!.x && part.y === selection.coordinate!.y);
    const part = selection.partIndex === null ? undefined : partByIndex.get(selection.partIndex);
    return part ? [part] : [];
  }, [selection, run, partByIndex]);
  const inspectedPart = selectedParts.find(part => part.index === selection?.partIndex) ?? selectedParts.at(-1);
  const inspectedMapParts = inspectedPart ? mapRun.parts.filter(part => part.x === inspectedPart.x && part.y === inspectedPart.y) : [];
  const mapDisplayedPart = inspectedMapParts.findLast(part => highlightedPartIndices?.has(part.index)) ?? inspectedMapParts.at(-1);
  useEffect(() => {
    if (!pendingInspectorScroll.current || !inspectedPart) return;
    pendingInspectorScroll.current = false;
    inspectorRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [selection, inspectedPart]);
  // Building the all-test lookup is deferred until the user asks to inspect a die.
  // Changing the selected coordinate or test reuses this index.
  const resultIndex = useMemo(() => selectionIsCurrent ? buildDieResultIndex(run.tests) : undefined, [run.tests, selectionIsCurrent]);
  const typedByPart = useMemo(() => selectionIsCurrent ? observationsByPart(run.typedTests ?? []) : undefined, [run.typedTests, selectionIsCurrent]);
  const selectCoordinate = useCallback((coordinate: Coordinate | null) => {
    pendingInspectorScroll.current = false;
    const coordinateParts = coordinate ? mapRun.parts.filter(part => part.x === coordinate.x && part.y === coordinate.y) : [];
    const shownPart = coordinateParts.findLast(part => highlightedPartIndices?.has(part.index)) ?? coordinateParts.at(-1);
    setSelection(coordinate ? { run, coordinate, partIndex: shownPart?.index ?? null } : null);
  }, [run, mapRun.parts, highlightedPartIndices]);
  const selectPart = (part: PartData) => {
    pendingInspectorScroll.current = true;
    setSelection({ run, coordinate: coordinateIsValid(part) ? { x: part.x, y: part.y } : null, partIndex: part.index });
  };
  const inspectMeasurement = (measurement: Measurement) => {
    const part = partByIndex.get(measurement.partIndex);
    if (part) selectPart(part);
  };
  const returnToDistribution = (id: number) => {
    setBinPick(null);
    onChartChange?.("distribution");
    onSelectTest(id);
    distributionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  return <section className="analysis-workspace" aria-label="Distribution and wafer analysis">
    <header className="aw-toolbar">
      <div className="aw-run-context"><strong title={run.fileName}>{run.fileName}</strong><span>Wafer <b>{run.waferId || "—"}</b></span></div>
      <div className="aw-toolbar-actions"><label>Site<select value={site} aria-label="Analysis site" onChange={event => onSiteChange(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">All {sites.length} sites</option>{sites.map(value => <option key={value} value={value}>Site {value}</option>)}</select></label>{onExport && <button type="button" title="Export the current die results, including range and result filters" onClick={() => onExport(resultRows.map(row => row.measurement))}>Export results</button>}</div>
    </header>
    {toolbarChildren && <div className="aw-filter-context">{toolbarChildren}</div>}
    <div className="aw-main-grid">
      <aside className="aw-catalog" aria-label="Test selection">
        <div className="aw-catalog-search"><input type="search" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Test number or name" aria-label="Search tests"/><select value={testFilter} onChange={event => onTestFilterChange(event.target.value as AnalysisTestFilter)} aria-label="Filter tests"><option value="all">All tests</option><option value="failing">Failing tests</option><option value="review">Cpk &lt; 1.33</option><option value="capable">Cpk ≥ 1.33</option><option value="unavailable">Cpk unavailable</option></select></div>
        <div className="aw-catalog-count">{tests.length.toLocaleString("en-US")} tests <span>All-site catalog statistics</span></div>
        <TestCatalogTable rows={catalogRows} selectedKey={selectedTest.id} onSelect={onSelectTest} label="Parametric test catalog" empty={<>No matching tests.<button type="button" onClick={() => { onSearchChange(""); onTestFilterChange("all"); }}>Clear test filters</button></>}/>
      </aside>
      <section className="aw-distribution" ref={distributionRef} aria-label="Selected test distribution">
        <div className="aw-test-heading"><b>{selectedTest.id}</b><span title={selectedTest.name}>{selectedTest.name}</span><small>{selectedTest.unit || "unitless"}</small></div>
        <div className="aw-chart-tabs" role="group" aria-label="Chart view">{[{ id: "distribution", label: "Distribution" }, ...chartViews].map(view => <button key={view.id} type="button" aria-pressed={activeChart === view.id} onClick={() => { setBinPick(null); onChartChange?.(view.id); }}>{view.label}</button>)}</div>
        {activeChart === "distribution" || !alternateChart ? <Distribution test={selectedTest} values={filteredTest.values} totalValues={selectedTest.values.length} site={site} state={chartState} onChange={setChartState} selectedBin={selectedBin} onSelectBin={pickBin}/> : <div className="aw-alternate-chart">{alternateChart.note && <p className="aw-chart-note">{alternateChart.note}</p>}{alternateChart.content}<dl className="aw-chart-stats">{[["Numeric N",chartSummary.n.toLocaleString("en-US")],["Mean",numberText(chartSummary.mean)],["Std Dev",numberText(chartSummary.sigma)],["Cpk",chartSummary.cpk===null?"—":numberText(chartSummary.cpk)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>}
        {selectedBin ? <div className="aw-bin-selection" role="status"><span><b>{pickedValues.length.toLocaleString("en-US")} records selected</b> · {numberText(selectedBin.from)} ≤ value {selectedBin.includeUpper ? "≤" : "<"} {numberText(selectedBin.to)} {selectedTest.unit}</span><button type="button" onClick={() => resultsRef.current?.scrollIntoView({ behavior: "auto", block: "start" })}>View results</button><button type="button" onClick={() => pickBin(null)}>Clear range</button></div> : activeChart === "distribution" && <p className="aw-pick-hint">Click a bar to locate its die results and wafer positions.</p>}
      </section>
      <details className="aw-wafer" open>
        <summary>Wafer <span>{run.waferId || "map"}</span></summary>
        <div className="aw-map-content"><label className="aw-map-mode">Color<select value={mapMode} onChange={event => setMapMode(event.target.value as MapMode)} aria-label="Wafer color mode"><option value="parametric">Selected test value</option><option value="passfail">PRR disposition</option><option value="bin">Hard bin</option></select></label>
          <WaferMap run={mapRun} test={mappedTest} compact interactive hideInspector mode={mapMode} selectedCoordinate={selectedCoordinate} onSelectCoordinate={selectCoordinate} highlightedPartIndices={highlightedPartIndices}/>
          {inspectedPart && <div className="aw-map-selection"><span role="status">{selectedCoordinate ? `Selected die ${selectedCoordinate.x} / ${selectedCoordinate.y}` : `Selected part ${inspectedPart.index + 1}`}</span><button type="button" onClick={() => inspectorRef.current?.scrollIntoView({ behavior: "auto", block: "start" })}>View test results</button></div>}
          <p className="aw-map-scope">{selectedBin ? `${highlightedPartIndices?.size.toLocaleString("en-US")} matching part records · selected bar` : `${mapRun.parts.length.toLocaleString("en-US")} part records · current test filters`}</p>
        </div>
      </details>
    </div>
    {inspectedPart && <section className="aw-inspector" ref={inspectorRef} aria-label="Selected die full test results">
      <div className="aw-section-heading"><h2>{selectedCoordinate ? `Die X ${selectedCoordinate.x} · Y ${selectedCoordinate.y}` : `Part ${inspectedPart.index + 1}`} <span>All test results</span></h2><button type="button" onClick={() => setSelection(null)}>Clear selection</button></div>
      {selectedParts.length > 1 && <div className="aw-part-picker"><label>Part record<select aria-label="Selected die part record" value={inspectedPart.index} onChange={event => setSelection(previous => previous ? { ...previous, partIndex: Number(event.target.value) } : previous)}>{selectedParts.map(part => <option key={part.index} value={part.index}>Part {part.index + 1} · Site {part.site} · {(part.recordedVerdict ?? (part.pass ? "pass" : "fail")).toUpperCase()}</option>)}</select></label><span>{selectedParts.length} separate records at this coordinate; all sites included.</span></div>}
      <DieInspection key={`${run.fileName}-${inspectedPart.index}`} part={inspectedPart} run={run} chosen={selectedTest} resultIndex={resultIndex} ignoredRecords={run.ignoredRecords} typedObservations={typedByPart?.get(inspectedPart.index) ?? EMPTY_OBSERVATIONS} typedDecoded={run.typedTests !== undefined} shown={coordinateIsValid(inspectedPart) && mapDisplayedPart?.index === inspectedPart.index} onSelectTest={returnToDistribution}/>
    </section>}
    <section className="aw-results" ref={resultsRef} aria-label="Selected test die results">
      <div className="aw-section-heading"><h2>Die results <span>{resultRows.length.toLocaleString("en-US")} records{selectedBin ? " · selected bar" : ""}</span></h2><label>Show<select value={resultFilter} onChange={event => setResultFilter(event.target.value as ResultFilter)} aria-label="Filter die results"><option value="all">All results</option><option value="fail">Test FAIL</option><option value="outside">Outside limits</option></select></label></div>
      <div className="aw-result-scroll"><table className="aw-result-table"><caption>{selectedTest.id} · {selectedTest.name}. Repeated measurements remain separate.</caption><thead><tr><th scope="col" aria-sort={resultSortLabel("part")}><button type="button" onClick={() => sortResults("part")}>Part {resultSort.key === "part" ? resultSort.descending ? "↓" : "↑" : "↕"}</button></th><th scope="col">X / Y</th><th scope="col">Site</th><th scope="col" className="aw-numeric" aria-sort={resultSortLabel("value")}><button type="button" onClick={() => sortResults("value")}>Value {selectedTest.unit && `(${selectedTest.unit})`} {resultSort.key === "value" ? resultSort.descending ? "↓" : "↑" : "↕"}</button></th><th scope="col" aria-sort={resultSortLabel("result")}><button type="button" onClick={() => sortResults("result")}>Test result {resultSort.key === "result" ? resultSort.descending ? "↓" : "↑" : "↕"}</button></th><th scope="col">Limits check</th></tr></thead><tbody>
        {visibleRows.map(({ measurement, sequence }) => {
          const part = partByIndex.get(measurement.partIndex), selected = inspectedPart?.index === measurement.partIndex;
          return <tr key={`${measurement.partIndex}-${sequence}`} className={selected ? "aw-result-selected" : undefined} data-part-index={measurement.partIndex} data-measurement-sequence={sequence}>
            <td>{part ? <button type="button" className="aw-text-button" onClick={() => inspectMeasurement(measurement)} aria-label={`Inspect part ${part.index + 1}, result ${sequence + 1}`}>{part.index + 1}</button> : "Unlinked"}</td>
            <td>{coordinateIsValid(measurement) ? part ? <button type="button" className="aw-text-button" onClick={() => inspectMeasurement(measurement)} aria-label={`Inspect die X ${measurement.x} Y ${measurement.y}, part ${part.index + 1}`}>{measurement.x} / {measurement.y}</button> : `${measurement.x} / ${measurement.y}` : "—"}</td>
            <td>{measurement.site}</td><td className="aw-numeric">{numberText(measurement.value)}</td><td><span className={measurement.pass ? "aw-pass" : "aw-fail"}>{measurement.pass ? "PASS" : "FAIL"}</span></td><td className={outsideLimits(measurement, selectedTest) ? "aw-fail" : undefined}>{limitResult(measurement, selectedTest)}</td>
          </tr>;
        })}
        {!visibleRows.length && <tr><td colSpan={6} className="aw-empty">No records match this view.</td></tr>}
      </tbody></table></div>
      <footer className="aw-results-footer"><span>Test result follows the parsed STDF outcome; limits check compares numeric values with catalog limits.</span>{pages > 1 && <div className="aw-pagination" role="group" aria-label="Die result pages"><button type="button" disabled={!page} onClick={() => setPageState({ rows: resultRows, page: page - 1 })}>Previous</button><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, resultRows.length)} / {resultRows.length.toLocaleString("en-US")}</span><button type="button" disabled={page === pages - 1} onClick={() => setPageState({ rows: resultRows, page: page + 1 })}>Next</button></div>}</footer>
    </section>
  </section>;
}
