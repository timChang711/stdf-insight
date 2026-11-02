"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { PartData, RunData, TestData } from "../lib/model";
import { stats } from "../lib/statistics";
import { buildDieResultIndex } from "../lib/die-results";
import { observationsByPart } from "../lib/typed-records";
import type { TypedObservation } from "../lib/typed-records";
import DieInspection from "./DieInspection";
import WaferZoomControls from "./WaferZoomControls";
import "./wafer-map.css";

export type MapMode = "parametric" | "bin" | "passfail";
export type WaferCoordinate = { x: number; y: number };
type Cell = { x: number; y: number; records: PartData[] };
const palette = ["#2bb88f", "#357fc2", "#e3a027", "#8f6fc3", "#d95064", "#28a5a5", "#c46f31", "#7d8b95"];
const WINDOW_SIZE = 160;
const COMPACT_WINDOW_SIZE = 64;
const COMPACT_COORDINATE_LIMIT = 20_000;
const OUTSIDE_SELECTION_COLOR = "#e3e7eb";
const EMPTY_OBSERVATIONS: readonly TypedObservation[] = [];
const format = (value: number | undefined) => value === undefined ? "Not measured" : !Number.isFinite(value) ? "Invalid value" : value.toLocaleString("en-US", { maximumSignificantDigits: 8 });
const keyOf = (x: number, y: number) => `${x},${y}`;
const dispositionOf = (part: PartData) => part.recordedVerdict ?? (part.pass ? "pass" : "fail");

export default function WaferMap({ run, test, compact = false, mode = "passfail", selectedCoordinate, onSelectCoordinate, hideInspector = compact, interactive = !compact, onSelectTest, highlightedPartIndices }: {
  run: RunData;
  test?: TestData;
  compact?: boolean;
  mode?: MapMode;
  selectedCoordinate?: WaferCoordinate | null;
  onSelectCoordinate?: (coordinate: WaferCoordinate | null) => void;
  hideInspector?: boolean;
  interactive?: boolean;
  onSelectTest?: (id: number) => void;
  highlightedPartIndices?: ReadonlySet<number>;
}) {
  const [upward, setUpward] = useState(false);
  const [zoomState, setZoomState] = useState<{ run: RunData; size: number } | null>(null);
  const cellSize = zoomState?.run === run ? zoomState.size : 32;
  const setCellSize = useCallback((size: number) => setZoomState({ run, size }), [run]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ run: RunData; key: string } | null>(null);
  const [windowStart, setWindowStart] = useState<{ run: RunData; x: number; y: number; selectedKey: string | null } | null>(null);
  const cellRefs = useRef(new Map<string, SVGGElement>());
  const gridId = `wafer-grid-${useId().replace(/:/g, "")}`;
  const chosen = test ?? run.tests[0];
  const data = useMemo(() => {
    const cells = new Map<string, Cell>();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, missing = 0;
    for (const part of run.parts) {
      // -32768 is STDF's missing-coordinate sentinel. Large valid coordinates are retained.
      if (!Number.isSafeInteger(part.x) || !Number.isSafeInteger(part.y) || part.x === -32768 || part.y === -32768) { missing++; continue; }
      minX = Math.min(minX, part.x); maxX = Math.max(maxX, part.x); minY = Math.min(minY, part.y); maxY = Math.max(maxY, part.y);
      const key = keyOf(part.x, part.y), existing = cells.get(key);
      if (existing) existing.records.push(part); else cells.set(key, { x: part.x, y: part.y, records: [part] });
    }
    const all = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    return { all, cells, minX, maxX, minY, maxY, missing, duplicates: all.filter(cell => cell.records.length > 1).length };
  }, [run]);
  const selectedKey = selectedCoordinate !== undefined ? selectedCoordinate ? keyOf(selectedCoordinate.x, selectedCoordinate.y) : null : selection?.run === run ? selection.key : null;
  const selected = selectedKey ? data.cells.get(selectedKey) : undefined;
  const displayedParts = useMemo(() => {
    const parts = new Map<string, PartData>();
    for (const cell of data.all) {
      let shown = cell.records.at(-1)!;
      if (highlightedPartIndices !== undefined) {
        for (let index = cell.records.length - 1; index >= 0; index--) {
          if (highlightedPartIndices.has(cell.records[index].index)) { shown = cell.records[index]; break; }
        }
      }
      parts.set(keyOf(cell.x, cell.y), shown);
    }
    return parts;
  }, [data, highlightedPartIndices]);
  const inspectSelection = !hideInspector && !!selected;
  const measurementByPart = useMemo(() => {
    const values = new Map<number, TestData["values"][number]>();
    for (const value of chosen?.values ?? []) values.set(value.partIndex, value);
    return values;
  }, [chosen]);
  const summary = useMemo(() => chosen && mode === "parametric" ? stats(chosen) : null, [chosen, mode]);
  const resultIndex = useMemo(() => inspectSelection ? buildDieResultIndex(run.tests) : undefined, [run.tests, inspectSelection]);
  const typedByPart = useMemo(() => inspectSelection ? observationsByPart(run.typedTests ?? []) : new Map(), [run.typedTests, inspectSelection]);
  if (!data.all.length) return <div className="no-data">No valid wafer coordinates were found. {data.missing.toLocaleString("en-US")} records have missing coordinates.</div>;

  const columns = data.maxX - data.minX + 1, rows = data.maxY - data.minY + 1;
  const windowSize = compact ? COMPACT_WINDOW_SIZE : WINDOW_SIZE;
  // Compact overviews render measured coordinates only, so a broad sparse
  // extent is inexpensive. Keep the whole wafer until actual SVG cells exceed
  // the limit; never crop an ordinary wafer merely because it is over 64 wide.
  const windowed = compact ? data.all.length > COMPACT_COORDINATE_LIMIT : columns > windowSize || rows > windowSize;
  const currentWindow = windowStart?.run === run ? windowStart : null;
  const previousStart = currentWindow ?? { x: data.minX, y: data.minY };
  const outsideWindow = selected && (selected.x < previousStart.x || selected.x >= previousStart.x + windowSize || selected.y < previousStart.y || selected.y >= previousStart.y + windowSize);
  const start = selected && outsideWindow && currentWindow?.selectedKey !== selectedKey
    ? { x: selected.x - Math.floor(windowSize / 2), y: selected.y - Math.floor(windowSize / 2) } : previousStart;
  const firstX = windowed ? Math.max(data.minX, Math.min(start.x, data.maxX - Math.min(columns, windowSize) + 1)) : data.minX;
  const firstY = windowed ? Math.max(data.minY, Math.min(start.y, data.maxY - Math.min(rows, windowSize) + 1)) : data.minY;
  const visibleColumns = windowed ? Math.min(columns, windowSize) : columns;
  const visibleRows = windowed ? Math.min(rows, windowSize) : rows;
  const lastX = firstX + visibleColumns - 1, lastY = firstY + visibleRows - 1;
  const visible = windowed ? data.all.filter(cell => cell.x >= firstX && cell.x <= lastX && cell.y >= firstY && cell.y <= lastY) : data.all;
  const focusedKey = visible.some(cell => keyOf(cell.x, cell.y) === selectedKey) ? selectedKey : visible[0] ? keyOf(visible[0].x, visible[0].y) : null;
  const dieWidth = run.waferGeometry?.dieWidth, dieHeight = run.waferGeometry?.dieHeight;
  const hasGeometry = !!dieWidth && !!dieHeight && Number.isFinite(dieWidth) && Number.isFinite(dieHeight) && dieWidth > 0 && dieHeight > 0;
  const ratio = hasGeometry ? dieWidth / dieHeight : 1;
  const safeRatio = ratio >= 1 / 12 && ratio <= 12;
  const aspect = safeRatio ? ratio : 1;
  const baseW = Math.max(1, aspect), baseH = Math.max(1, 1 / aspect);
  const scale = compact ? Math.min(250 / (visibleColumns * baseW), 210 / (visibleRows * baseH)) : cellSize;
  const cellW = baseW * scale, cellH = baseH * scale;
  const focusInset = Math.min(2, Math.min(cellW, cellH) / 4);
  const left = compact ? 34 : 54, top = compact ? 30 : 40;
  const width = visibleColumns * cellW, height = visibleRows * cellH;
  const svgWidth = left + width + 10, svgHeight = top + height + 10;
  const showCellLabels = Math.min(cellW, cellH) >= 11;
  const low = chosen?.low ?? ((summary?.mean ?? 0) - 3 * (summary?.sigma ?? 0));
  const high = chosen?.high ?? ((summary?.mean ?? 0) + 3 * (summary?.sigma ?? 0));
  const range = high - low || 1;
  const color = (part: PartData) => {
    if (mode === "passfail") {
      const disposition = dispositionOf(part);
      return disposition === "pass" ? "#00ee00" : disposition === "fail" ? "#ff0000" : "#b5bdc6";
    }
    if (mode === "bin") return palette[Math.abs(part.hardBin) % palette.length];
    const value = measurementByPart.get(part.index)?.value;
    if (value === undefined || !Number.isFinite(value)) return "#d8dde1";
    if (value < low || value > high) return "#d95064";
    const t = Math.max(0, Math.min(1, (value - low) / range));
    return `hsl(${178 - t * 100} 70% ${42 + t * 12}%)`;
  };
  const bins = [...new Set([...displayedParts.values()].filter(part => highlightedPartIndices === undefined || highlightedPartIndices.has(part.index)).map(part => part.hardBin))].sort((a, b) => a - b);
  const xStride = compact ? Math.max(1, Math.ceil(visibleColumns / 8)) : Math.max(1, Math.ceil((Math.max(String(firstX).length, String(lastX).length) * 8 + 5) / cellW));
  const yStride = compact ? Math.max(1, Math.ceil(visibleRows / 8)) : Math.max(1, Math.ceil(19 / cellH));
  const xLabels = Array.from({ length: Math.ceil(visibleColumns / xStride) }, (_, i) => firstX + i * xStride);
  const yLabels = Array.from({ length: Math.ceil(visibleRows / yStride) }, (_, i) => firstY + i * yStride);
  const rowPosition = (y: number) => upward ? lastY - y : y - firstY;
  const selectCell = (cell: Cell) => {
    setSelection({ run, key: keyOf(cell.x, cell.y) });
    onSelectCoordinate?.({ x: cell.x, y: cell.y });
  };
  const clearSelection = () => { setSelection(null); onSelectCoordinate?.(null); };
  const onCellKey = (event: KeyboardEvent<SVGGElement>, cell: Cell, index: number) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCell(cell); return; }
    let next: Cell | undefined;
    if (event.key === "Home") next = visible[0];
    if (event.key === "End") next = visible.at(-1);
    if (event.key === "ArrowLeft") next = visible[index - 1];
    if (event.key === "ArrowRight") next = visible[index + 1];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const direction = (event.key === "ArrowDown" ? 1 : -1) * (upward ? -1 : 1);
      next = visible.filter(candidate => (candidate.y - cell.y) * direction > 0).sort((a, b) => Math.abs(a.y - cell.y) - Math.abs(b.y - cell.y) || Math.abs(a.x - cell.x) - Math.abs(b.x - cell.x))[0];
    }
    if (next) { event.preventDefault(); selectCell(next); cellRefs.current.get(keyOf(next.x, next.y))?.focus(); }
  };
  const goWindow = (axis: "x" | "y", value: number) => { if (Number.isFinite(value)) setWindowStart({ run, x: firstX, y: firstY, selectedKey, [axis]: Math.round(value) }); };

  return <section className={`wafer-grid-map${compact ? " wafer-grid-compact" : ""}`} aria-label={`${mode === "passfail" ? "Pass / fail" : mode === "bin" ? "Hard bin" : "Parametric"} wafer map`}>
    <h3 className="wafer-grid-title">wafer_Id: {run.waferId || "Unknown"}</h3>
    {!compact && <>
      <div className="wafer-grid-controls">
        <label>Y direction<select aria-label="Wafer Y direction" value={upward ? "up" : "down"} onChange={event => setUpward(event.target.value === "up")}><option value="down">Increases downward ↓</option><option value="up">Increases upward ↑</option></select></label>
        <span>Click a die to inspect. Arrow keys move; Enter selects.</span>
      </div>
      <WaferZoomControls viewportRef={viewportRef} columns={visibleColumns} rows={visibleRows} baseW={baseW} baseH={baseH} runKey={run} size={cellSize} onSizeChange={setCellSize}/>
      <p className="wafer-grid-counts">{(run.parts.length - data.missing).toLocaleString("en-US")} records · {data.all.length.toLocaleString("en-US")} measured coordinates{data.missing > 0 && ` · ${data.missing.toLocaleString("en-US")} records without coordinates`}. Scroll inside the map to see all cells.</p>
      {data.duplicates > 0 && <p className="wafer-grid-warning">{data.duplicates.toLocaleString("en-US")} coordinates contain multiple records. {highlightedPartIndices === undefined ? "The last record supplies the displayed color" : "The last record in the selected bar supplies the displayed color when available; otherwise the last record is shown in gray"}; the corner marker identifies repeats. Select the coordinate to inspect every record. No retest consolidation is applied.</p>}
      {!safeRatio && <p className="wafer-grid-warning">The recorded die aspect ratio exceeds the display limit. Equal coordinate cells are shown; recorded dimensions remain available below.</p>}
    </>}
    {windowed && <div className="wafer-grid-window"><p>{compact ? `Large wafer: ${data.all.length.toLocaleString("en-US")} coordinates. Showing window X ${firstX}…${lastX}, Y ${firstY}…${lastY}; full extent X ${data.minX}…${data.maxX}, Y ${data.minY}…${data.maxY}.` : `Large coordinate extent: X ${data.minX}…${data.maxX}, Y ${data.minY}…${data.maxY}. Showing a movable window of at most ${windowSize} × ${windowSize} cells; all records remain available.`}</p><label>First X<input aria-label="First visible wafer X" type="number" step="1" min={data.minX} max={data.maxX - visibleColumns + 1} value={firstX} onChange={event => goWindow("x", event.currentTarget.valueAsNumber)}/></label><label>First Y<input aria-label="First visible wafer Y" type="number" step="1" min={data.minY} max={data.maxY - visibleRows + 1} value={firstY} onChange={event => goWindow("y", event.currentTarget.valueAsNumber)}/></label><span>{visible.length.toLocaleString("en-US")} measured coordinates in this window</span></div>}
    <div ref={viewportRef} className="wafer-grid-scroll" tabIndex={interactive ? 0 : undefined} role="region" aria-label="Scrollable wafer coordinate grid">
      <svg className="wafer-coordinate-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} height={svgHeight} role="group" aria-label="X coordinates across the top, Y coordinates on the left">
        <defs><pattern id={gridId} x={left} y={top} width={cellW} height={cellH} patternUnits="userSpaceOnUse"><path d={`M 0 ${cellH} V 0 H ${cellW}`} fill="none" stroke="#222" strokeWidth={compact ? .5 : 1}/></pattern></defs>
        <rect x={left} y={top} width={width} height={height} fill="#fff"/>
        {visible.map((cell, index) => {
          const key = keyOf(cell.x, cell.y), part = displayedParts.get(key)!, x = left + (cell.x - firstX) * cellW, y = top + rowPosition(cell.y) * cellH;
          const outsideSelection = highlightedPartIndices !== undefined && !highlightedPartIndices.has(part.index);
          const value = measurementByPart.get(part.index)?.value;
          const disposition = dispositionOf(part);
          const label = mode === "passfail" ? disposition === "pass" ? "P" : disposition === "fail" ? "F" : "?" : mode === "bin" ? String(part.hardBin) : value === undefined || !Number.isFinite(value) ? "—" : "";
          const description = `X ${cell.x}, Y ${cell.y}, site ${part.site}, PRR ${disposition.toUpperCase()}, hard bin ${part.hardBin}${cell.records.length > 1 ? `, ${cell.records.length} records; ${highlightedPartIndices !== undefined && !outsideSelection ? "last in selected bar shown" : "last shown"}` : ""}${outsideSelection ? ", Outside selected bar" : ""}`;
          return <g key={key} className={`wafer-die${selectedKey === key ? " wafer-die-selected" : ""}${outsideSelection ? " wafer-die-outside-selection" : ""}`} data-x={cell.x} data-y={cell.y} data-record-count={cell.records.length} data-disposition={disposition.toUpperCase()} data-highlighted={highlightedPartIndices === undefined ? undefined : !outsideSelection} ref={element => { if (element) cellRefs.current.set(key, element); else cellRefs.current.delete(key); }} role={interactive ? "button" : undefined} tabIndex={interactive ? focusedKey === key ? 0 : -1 : undefined} aria-label={description} aria-pressed={interactive ? selectedKey === key : undefined} onClick={interactive ? () => selectCell(cell) : undefined} onKeyDown={interactive ? event => onCellKey(event, cell, index) : undefined}>
            <title>{description}{chosen ? ` · ${chosen.name}: ${format(value)} ${chosen.unit}` : ""}</title>
            <rect className="wafer-die-fill" x={x} y={y} width={cellW} height={cellH} fill={outsideSelection ? OUTSIDE_SELECTION_COLOR : color(part)}/>
            {showCellLabels && label && <text x={x + cellW / 2} y={y + cellH / 2} dy=".35em" textAnchor="middle" fontSize={Math.min(compact ? 100 : 18, cellH * .7, cellW / Math.max(label.length, 1) * .7)} fontWeight="700" fill={mode === "passfail" && disposition === "fail" ? "#fff" : "#111"}>{label}</text>}
            {cell.records.length > 1 && <path className="wafer-repeat-marker" d={`M ${x + cellW} ${y} h ${-Math.min(cellW * .3, 9)} l ${Math.min(cellW * .3, 9)} ${Math.min(cellH * .3, 9)} Z`} fill="#293d79"/>}
            <rect className="wafer-die-focus" x={x + focusInset} y={y + focusInset} width={cellW - 2 * focusInset} height={cellH - 2 * focusInset} fill="none" style={{ strokeWidth: Math.min(3, Math.min(cellW, cellH) / 3) }}/>
          </g>;
        })}
        <rect className="wafer-grid-lines" x={left} y={top} width={width} height={height} fill={`url(#${gridId})`} stroke="#222" strokeWidth="1" pointerEvents="none"/>
        {xLabels.map(x => <text className="wafer-coordinate-label" key={x} x={left + (x - firstX + .5) * cellW} y={top - 10} textAnchor="middle" fontSize={compact ? 9 : 14}>{x}</text>)}
        {yLabels.map(y => <text className="wafer-coordinate-label" key={y} x={left - 12} y={top + (rowPosition(y) + .5) * cellH} dy=".35em" textAnchor="end" fontSize={compact ? 9 : 14}>{y}</text>)}
        <text x={left - 12} y={top - 10} textAnchor="end" className="wafer-axis-corner" fontSize={compact ? 8 : 11}>Y / X</text>
      </svg>
    </div>
    <div className="wafer-grid-legend" aria-label="Wafer map legend">
      {mode === "passfail" ? <><span><i style={{ background: "#00ee00" }}/>P · PASS</span><span><i style={{ background: "#ff0000" }}/>F · FAIL</span><span><i style={{ background: "#b5bdc6" }}/>? · UNKNOWN</span></> : mode === "bin" ? bins.map(bin => <span key={bin}><i style={{ background: palette[Math.abs(bin) % palette.length] }}/>HB {bin}</span>) : <><span className="wafer-parametric-scale"><i/>{format(low)} → {format(high)} {chosen?.unit}</span><span><i style={{ background: "#d95064" }}/>Outside color range</span><span><i style={{ background: "#d8dde1" }}/>No valid test value</span></>}
      <span><i style={{ background: "#fff" }}/>Not measured</span>
      {highlightedPartIndices !== undefined && <span><i style={{ background: OUTSIDE_SELECTION_COLOR }}/>Outside selected bar</span>}
      {data.duplicates > 0 && <span><i className="wafer-repeat-key"/>Multiple records ({highlightedPartIndices === undefined ? "last shown" : "last in selection shown, if present"})</span>}
    </div>
    {!hideInspector && <section className="wafer-record-inspector" aria-label="Selected die records" aria-live="polite">
      <div className="wafer-inspector-heading"><h4>{selected ? `Die X ${selected.x} · Y ${selected.y}` : "Die inspector"}</h4>{selected && <button onClick={clearSelection}>Clear selection</button>}</div>
      {selected ? <><p>{selected.records.length} part record{selected.records.length === 1 ? "" : "s"}{selected.records.length > 1 ? ` · separate results below; ${highlightedPartIndices === undefined ? "last record supplies the map color" : "last record in the selected bar supplies the map color when available"}` : ""}.</p><div className="wafer-part-list">{selected.records.map(part => <DieInspection key={`${selectedKey}-${part.index}`} part={part} run={run} chosen={chosen} resultIndex={resultIndex} ignoredRecords={run.ignoredRecords} typedObservations={typedByPart.get(part.index) ?? EMPTY_OBSERVATIONS} typedDecoded={run.typedTests !== undefined} shown={part === displayedParts.get(selectedKey!)} onSelectTest={onSelectTest}/>)}</div></> : <p>Click a colored cell, or Tab to the grid and use the arrow keys to choose a measured die. White cells have no recorded die.</p>}
      <p className="wafer-geometry-note">{hasGeometry ? `Recorded die dimensions: ${format(dieWidth)} × ${format(dieHeight)} (WCR units code ${run.waferGeometry?.units ?? "unspecified"}).` : "Die geometry is unavailable; coordinate cells are square."} Coordinates and recorded disposition are unchanged.</p>
    </section>}
  </section>;
}
