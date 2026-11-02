"use client";

import { useId, useMemo, useRef } from "react";
import type { Measurement, TestData } from "../lib/model";
import { densityDistributionModel, formatAxisNumber, isDistributionEdge, type DensitySettings, type DistributionBinSelection } from "../lib/distribution";
import { stats } from "../lib/statistics";
export type { DistributionBinSelection } from "../lib/distribution";

type DraftKey = "low" | "high" | "binWidth";
type Draft = Record<DraftKey, string>;
export type DistributionState = { settings: DensitySettings; draft: Draft; invalidFields?: Partial<Record<DraftKey, boolean>> };
const blankDraft: Draft = { low: "", high: "", binWidth: "" };
const defaults: DensitySettings = { binCount: 50, rangeMode: "data" };
const initial: DistributionState = { settings: defaults, draft: blankDraft };
const count = (value: number) => value.toLocaleString("en-US");
const number = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : "—";
const settingsFrom = (draft: Draft): Pick<DensitySettings, DraftKey> => Object.fromEntries(
  (Object.keys(blankDraft) as DraftKey[]).filter(key => draft[key].trim() !== "").map(key => [key, Number(draft[key])]),
);
const draftFrom = (settings: DensitySettings): Draft => ({
  low: settings.low === undefined ? "" : String(settings.low),
  high: settings.high === undefined ? "" : String(settings.high),
  binWidth: settings.binWidth === undefined ? "" : String(settings.binWidth),
});
const sameSettings = (a: DensitySettings, b: DensitySettings) => (Object.keys(blankDraft) as DraftKey[]).every(key => a[key] === b[key]);

export default function Distribution({ test, values: providedValues, totalValues, site = "all", state = initial, onChange, selectedBin, onSelectBin }: {
  test: TestData; values?: Measurement[]; totalValues?: number; site?: number | "all";
  state?: DistributionState; onChange: (state: DistributionState) => void;
  selectedBin?: DistributionBinSelection | null; onSelectBin?: (selection: DistributionBinSelection | null) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const chartId = useId().replace(/:/g, "");
  const clipId = `${chartId}-plot`;
  const sliderId = `${chartId}-bars`;
  const helpId = `${chartId}-help`;
  // Native number inputs can retain an invalid editing buffer even when their
  // DOM value and React value are both empty. Explicit cancel/reset must clear it.
  const clearIncompleteInputs = () => {
    for (const input of Array.from(formRef.current?.elements ?? [])) {
      if (input instanceof HTMLInputElement && input.validity.badInput) input.value = "";
    }
  };
  const values = providedValues ?? (site === "all" ? test.values : test.values.filter(value => value.site === site));
  const numericValues = useMemo(() => values.map(value => value.value), [values]);
  const model = useMemo(() => densityDistributionModel(numericValues, state.settings, test), [numericValues, state.settings, test]);
  const draftSettings: DensitySettings = { binCount: state.settings.binCount, rangeMode: state.settings.rangeMode, ...settingsFrom(state.draft) };
  // Draft validation never changes the committed chart or its population.
  const draftModel = useMemo(() => sameSettings(draftSettings, state.settings) ? model : densityDistributionModel(numericValues, draftSettings, test), [numericValues, model, state.settings, draftSettings.low, draftSettings.high, draftSettings.binWidth, draftSettings.binCount, draftSettings.rangeMode, test]);
  const unfinished = Object.values(state.invalidFields ?? {}).some(Boolean);
  const errors = unfinished ? ["Finish entering a valid number, or clear the field for automatic."] : draftModel.errors;
  const dirty = unfinished || !sameSettings(draftSettings, state.settings);
  const editField = (key: DraftKey, input: HTMLInputElement) => onChange({ ...state, draft: { ...state.draft, [key]: input.value }, invalidFields: { ...state.invalidFields, [key]: input.validity.badInput } });
  const summary = useMemo(() => stats({ ...test, values }), [test, values]);
  const median = useMemo(() => {
    const sorted = numericValues.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const middle = (sorted.length - 1) / 2;
    return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
  }, [numericValues]);
  const commit = (settings: DensitySettings) => {
    clearIncompleteInputs();
    onChange({ settings, draft: draftFrom(settings) });
  };
  const reset = () => commit({ ...defaults });
  const setRange = (rangeMode: "data" | "all") => {
    const { low: _low, high: _high, ...settings } = state.settings;
    commit({ ...settings, rangeMode });
  };
  const setBars = (binCount: number) => {
    const { binWidth: _binWidth, ...settings } = state.settings;
    commit({ ...settings, binCount });
  };
  const customRange = state.settings.low !== undefined || state.settings.high !== undefined;
  const manualWidth = state.settings.binWidth !== undefined && model.binValid;
  const sliderCount = Math.max(20, Math.min(100, state.settings.binCount ?? 50));
  const fields: Array<{ key: DraftKey; title: string; aria: string; automatic: number; hint: string }> = [
    { key: "low", title: "X minimum", aria: "Distribution x-axis minimum", automatic: model.autoScale.low, hint: "Left edge" },
    { key: "high", title: "X maximum", aria: "Distribution x-axis maximum", automatic: model.autoScale.high, hint: "Right edge" },
    { key: "binWidth", title: `Bin width${test.unit ? ` (${test.unit})` : ""}`, aria: "Histogram bin width", automatic: draftModel.autoBinWidth, hint: "Optional override" },
  ];
  const { min, max, spread, bins, binCount, effectiveBinWidth, ticks } = model;
  const specPosition = (value: number | null) => value === null ? null : isDistributionEdge(value, min, effectiveBinWidth) ? min : isDistributionEdge(value, max, effectiveBinWidth) ? max : value;
  const lowSpec = specPosition(test.low), highSpec = specPosition(test.high);
  const showNormal = summary.n > 1 && summary.sigma > 0 && !model.hasPartialBin;
  const normalAt = (x: number) => Math.exp(-.5 * ((x - summary.mean) / summary.sigma) ** 2) * summary.n * effectiveBinWidth / (summary.sigma * Math.sqrt(2 * Math.PI));
  const normalPeak = showNormal ? normalAt(Math.max(min, Math.min(max, summary.mean))) : 0;
  const visibleBins = bins.filter(bin => bin.to > min && bin.from < max);
  const rawPeak = Math.max(1, normalPeak, ...visibleBins.map(bin => bin.count));
  const yStep = Math.max(1, Math.ceil(rawPeak / 4)), peak = yStep * 4;
  // Offscreen bins retain their counts, but must not overflow SVG coordinates
  // when a manually cropped viewport is extremely narrow.
  const xFor = (value: number) => 58 + ((Math.max(min, Math.min(max, value)) - min) / spread) * 572;
  const yFor = (value: number) => 250 - value / peak * 202;
  // Add samples around the mean so a narrow fit remains smooth in a wide spec view.
  const normalPoints = showNormal ? [...new Set([
    ...Array.from({ length: 121 }, (_, index) => min + spread * index / 120),
    ...Array.from({ length: 161 }, (_, index) => summary.mean + summary.sigma * (index / 20 - 4)),
  ])].filter(x => Number.isFinite(x) && x >= min && x <= max).sort((a, b) => a - b)
    .map(x => `${xFor(x)},${yFor(normalAt(x))}`).join(" ") : "";

  return <section className="distribution-workspace jmp-report" aria-label="Distribution analysis">
    <div className="jmp-report-title"><span aria-hidden="true">▾</span><b>Distribution</b><small>{test.id} · {test.name}</small></div>
    <div className="distribution-controls">
      <div className="distribution-toolbar">
        <div className="distribution-population" aria-live="polite">
          <b>{count(model.finiteCount)} <span>numeric records</span></b>
          <small>{count(values.length)} filtered · {count(totalValues ?? values.length)} total</small>
          <em>{binCount} {binCount === 1 ? "bar" : "bars"} · ≈{Number(effectiveBinWidth.toPrecision(4))} {test.unit || "units"} per bar{manualWidth ? " · manual width" : ""}</em>
        </div>
        <div className="distribution-density">
          <div className="distribution-density-heading"><label htmlFor={sliderId}>Bars</label><output htmlFor={sliderId}>{sliderCount}</output></div>
          <input id={sliderId} type="range" min="20" max="100" step="1" value={sliderCount} aria-label="Histogram bar count" onChange={event => setBars(Number(event.currentTarget.value))}/>
          <div className="distribution-density-ends"><span>Coarse</span><span>Fine</span></div>
          {manualWidth && <small>Move the slider to replace the manual width.</small>}
          {!manualWidth && model.finiteCount > 0 && binCount !== sliderCount && <small>{summary.min === summary.max ? "One bar: all values are identical." : `Data precision allows ${binCount} bars.`}</small>}
        </div>
        <div className="distribution-presets" role="group" aria-label="Quick distribution ranges">
          <button type="button" onClick={() => setRange("data")} aria-pressed={!customRange && (state.settings.rangeMode ?? "data") === "data"}>Fit data</button>
          <button type="button" onClick={() => setRange("all")} aria-pressed={!customRange && state.settings.rangeMode === "all"}>Show specs</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </div>
      <details className="distribution-advanced">
      <summary>Advanced settings</summary>
      <form ref={formRef} className="distribution-editor" noValidate onSubmit={event => { event.preventDefault(); const badInput = Array.from(event.currentTarget.elements).some(input => input instanceof HTMLInputElement && input.validity.badInput); if (!errors.length && !badInput) onChange({ ...state, settings: draftSettings }); }}>
        <div className="distribution-fields">{fields.map(field => <label key={field.key}>
          <span>{field.title}</span>
          <input type="number" step="any" value={state.draft[field.key]} placeholder={`Auto: ${formatAxisNumber(field.automatic, model.effectiveBinWidth)}`} aria-label={field.aria} aria-invalid={state.invalidFields?.[field.key] || undefined} aria-describedby={helpId} onInput={event => editField(field.key, event.currentTarget)} onChange={event => editField(field.key, event.currentTarget)}/>
          <small>{field.hint}</small>
        </label>)}</div>
        <div className="distribution-actions">
          <span id={helpId}>Leave blank for automatic. Axis limits crop the view; all numeric records remain binned.</span>
          {dirty && <button type="button" onClick={() => commit({ ...state.settings })}>Discard edits</button>}
          <button className="distribution-apply" type="submit" disabled={!dirty || errors.length > 0}>Apply</button>
        </div>
      </form>
      {errors.length > 0 ? <div className="distribution-scale-error" role="alert">{errors.join(" ")} The chart keeps the last applied settings.</div> : dirty && <p className="distribution-pending" role="status">Changes pending — press Apply or Enter.</p>}
      </details>
      {model.errors.length > 0 && <p className="distribution-exclusions" role="status">Saved settings no longer fit these data. Automatic values are shown; adjust Advanced settings or Reset.</p>}
      {(model.belowCount > 0 || model.aboveCount > 0 || model.nonFiniteCount > 0) && <p className="distribution-exclusions" role="status">{count(model.visibleCount)} records in view · {count(model.belowCount)} below · {count(model.aboveCount)} above. All {count(model.finiteCount)} numeric records remain binned.{model.nonFiniteCount > 0 ? ` ${count(model.nonFiniteCount)} non-numeric records excluded.` : ""}</p>}
    </div>
    {!model.finiteCount ? <div className="distribution-empty jmp-empty"><b>No numeric data to plot</b><span>Change or clear the Raw data filters. Non-numeric records remain in the raw table.</span></div> : <div className="jmp-distribution-body">
      <svg className="plot-svg jmp-plot-svg" viewBox="0 0 700 310" role={onSelectBin ? "group" : "img"} aria-label={`Distribution of ${test.name}; ${binCount} ${binCount === 1 ? "bar" : "bars"}; ${model.visibleCount} records shown`}>
        <defs><clipPath id={clipId}><rect x="58" y="48" width="572" height="202"/></clipPath></defs>
        <rect x="58" y="48" width="572" height="202" className="jmp-plot-frame"/>
        {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1="58" x2="630" y1={yFor(index * yStep)} y2={yFor(index * yStep)} className="grid-line"/><text x="49" y={yFor(index * yStep) + 4} textAnchor="end" className="axis-label">{count(index * yStep)}</text></g>)}
        <g clipPath={`url(#${clipId})`}>
        {bins.map((bin, index) => {
          const width = xFor(bin.to) - xFor(bin.from), gap = Math.min(.7, width * .08);
          const selection: DistributionBinSelection = { from: bin.from, to: bin.to, includeUpper: index === bins.length - 1, binWidth: effectiveBinWidth, index };
          const selectable = !!onSelectBin && bin.count > 0 && bin.to > min && bin.from < max;
          const selected = selectable && selectedBin?.index === index && selectedBin.from === bin.from && selectedBin.to === bin.to && selectedBin.binWidth === effectiveBinWidth && selectedBin.includeUpper === selection.includeUpper;
          const label = `[${formatAxisNumber(bin.from, effectiveBinWidth)}, ${formatAxisNumber(bin.to, effectiveBinWidth)}${selection.includeUpper ? "]" : ")"} ${test.unit} · ${count(bin.count)} records in full bin`;
          const toggleSelection = () => { if (selectable) onSelectBin?.(selected ? null : selection); };
          return <rect key={index} x={xFor(bin.from) + gap / 2} y={yFor(bin.count)} width={Math.max(width - gap, 0)} height={250 - yFor(bin.count)} className={`jmp-hist-bar${selectable ? " is-selectable" : ""}${selected ? " is-selected" : ""}`} data-count={bin.count} data-from={bin.from} data-to={bin.to}
            role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} aria-label={selectable ? `Select bin ${label}` : undefined} aria-pressed={selectable ? selected : undefined}
            onClick={selectable ? toggleSelection : undefined} onKeyDown={selectable ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleSelection(); } } : undefined}><title>{label}</title></rect>;
        })}
        {normalPoints && <polyline points={normalPoints} className="jmp-normal-curve"/>}
        </g>
        {Number.isFinite(summary.mean) && summary.mean >= min && summary.mean <= max && <g><line x1={xFor(summary.mean)} x2={xFor(summary.mean)} y1="48" y2="250" className="mean-line"/><text x={xFor(summary.mean) + 4} y="61" className="mean-label">Mean</text></g>}
        {lowSpec !== null && lowSpec >= min && lowSpec <= max && <g><line x1={xFor(lowSpec)} x2={xFor(lowSpec)} y1="38" y2="250" className="limit-line"/><text x={xFor(lowSpec) + 4} y="31" className="limit-label">LSL {formatAxisNumber(lowSpec, effectiveBinWidth)}</text></g>}
        {highSpec !== null && highSpec >= min && highSpec <= max && <g><line x1={xFor(highSpec)} x2={xFor(highSpec)} y1="38" y2="250" className="limit-line"/><text x={xFor(highSpec) - 4} y="31" textAnchor="end" className="limit-label">USL {formatAxisNumber(highSpec, effectiveBinWidth)}</text></g>}
        <line x1="58" x2="630" y1="250" y2="250" className="axis-line"/><line x1="58" x2="58" y1="48" y2="250" className="axis-line"/>
        {ticks.map((tick, index) => <g key={index}><line x1={xFor(tick)} x2={xFor(tick)} y1="250" y2="256" className="axis-line"/><text x={xFor(tick)} y="273" textAnchor="middle" className="axis-label">{formatAxisNumber(tick, model.effectiveTick)}</text></g>)}
        <text x="344" y="301" textAnchor="middle" className="axis-title">Result ({test.unit || "unitless"})</text><text x="13" y="150" transform="rotate(-90 13 150)" textAnchor="middle" className="axis-title">Count</text>
        {!model.visibleCount && <text x="344" y="148" textAnchor="middle" className="axis-title">No records in this range — use Fit data</text>}
      </svg>
      <aside className="jmp-summary" aria-label="Summary statistics"><h3>Filtered statistics</h3><dl>
        {[["Numeric N", count(summary.n)], ["Mean", number(summary.mean)], ["Std Dev (sample)", number(summary.sigma)], ["Median", number(median)], ["Minimum", number(summary.min)], ["Maximum", number(summary.max)], ["Cpk", summary.cpk === null ? "—" : number(summary.cpk)], ["Fail %", number(summary.failRate * 100)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl><p>Fail % uses all {count(values.length)} filtered records and the existing pass/fail result.</p></aside>
    </div>}
    {!!model.finiteCount && <p className="distribution-footnote">Statistics use all filtered numeric records. {showNormal ? "The normal curve is a reference, not a normality test." : "Normal fit requires at least two values with nonzero spread."}</p>}
  </section>;
}
