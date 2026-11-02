"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import "./wafer-zoom.css";

const MIN_SIZE = 4;
const MAX_SIZE = 80;
const DEFAULT_SIZE = 32;
const clampSize = (size: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));

type Props = {
  viewportRef: RefObject<HTMLDivElement | null>;
  columns: number;
  rows: number;
  baseW: number;
  baseH: number;
  runKey: object;
  size: number;
  onSizeChange: (size: number) => void;
};
type Draft = { run: object; value: string; badInput: boolean };

/** Controls display geometry only; the parent retains die coordinates and selection. */
export default function WaferZoomControls({ viewportRef, columns, rows, baseW, baseH, runKey, size, onSizeChange }: Props) {
  const [fitRun, setFitRun] = useState<object | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const fit = fitRun === runKey;
  const activeDraft = draft?.run === runKey ? draft : null;
  const draftNumber = activeDraft ? Number(activeDraft.value) : size;
  const invalid = !!activeDraft && (activeDraft.badInput || !activeDraft.value.trim() || !Number.isFinite(draftNumber) || draftNumber < MIN_SIZE || draftNumber > MAX_SIZE);
  const dirty = !!activeDraft && (invalid || draftNumber !== size);

  // Clear the native number-input editing buffer as well as React's value.
  // A partial exponent or minus sign can otherwise survive an explicit reset.
  const clearDraft = () => {
    if (inputRef.current?.validity.badInput) inputRef.current.value = "";
    setDraft(null);
  };
  const applySize = (next: number) => {
    clearDraft();
    setFitRun(null);
    if (Number.isFinite(next)) onSizeChange(clampSize(next));
  };

  useEffect(() => {
    if (!fit) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const measure = () => {
      const style = getComputedStyle(viewport);
      const maximumHeight = Number.parseFloat(style.maxHeight);
      const borderHeight = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
      // clientHeight follows SVG content and would create a shrinking feedback loop.
      // The CSS height cap is the map's available vertical space instead.
      const availableHeight = Number.isFinite(maximumHeight) ? maximumHeight - borderHeight : viewport.clientHeight;
      if (!viewport.clientWidth || !availableHeight || columns < 1 || rows < 1 || baseW <= 0 || baseH <= 0) return;
      const fitted = Math.min((viewport.clientWidth - 64) / (columns * baseW), (availableHeight - 50) / (rows * baseH));
      if (!Number.isFinite(fitted)) return;
      // Round down so fractional CSS pixels cannot introduce an extra scrollbar.
      const next = clampSize(Math.floor(fitted * 10) / 10);
      if (Math.abs(next - size) > 0.000001) onSizeChange(next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [fit, viewportRef, columns, rows, baseW, baseH, size, onSizeChange]);

  const edit = (input: HTMLInputElement) => setDraft({ run: runKey, value: input.value, badInput: input.validity.badInput });

  return <div className="wafer-zoom-controls" role="group" aria-label="Wafer map size">
    <label className="wafer-zoom-slider-label" htmlFor={`${id}-slider`}>
      <span>Cell size <output>{size.toLocaleString("en-US", { maximumFractionDigits: 3 })} px</output></span>
      <input id={`${id}-slider`} type="range" min={MIN_SIZE} max={MAX_SIZE} step="0.1" value={size} aria-label="Wafer cell size slider" aria-valuetext={`${size} pixels per cell`} onChange={event => applySize(event.currentTarget.valueAsNumber)}/>
    </label>
    <form className="wafer-zoom-editor" noValidate onSubmit={event => {
      event.preventDefault();
      if (!invalid && !inputRef.current?.validity.badInput) applySize(draftNumber);
    }}>
      <label htmlFor={`${id}-number`}>Size (px)<input id={`${id}-number`} ref={inputRef} type="number" inputMode="decimal" min={MIN_SIZE} max={MAX_SIZE} step="0.1" value={activeDraft?.value ?? String(size)} aria-label="Wafer cell size" aria-invalid={invalid || undefined} aria-describedby={`${id}-help`} onInput={event => edit(event.currentTarget)} onChange={event => edit(event.currentTarget)} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); clearDraft(); }
      }}/></label>
      <button type="submit" disabled={!dirty || invalid}>Apply size</button>
      {dirty && <button type="button" onClick={clearDraft}>Discard</button>}
    </form>
    <div className="wafer-zoom-presets">
      <button type="button" aria-pressed={fit} onClick={() => { clearDraft(); setFitRun(runKey); }}>Fit to view</button>
      <button type="button" onClick={() => applySize(DEFAULT_SIZE)}>Reset size</button>
    </div>
    <p id={`${id}-help`} className={invalid ? "wafer-zoom-help wafer-zoom-error" : "wafer-zoom-help"} role={invalid ? "alert" : undefined}>
      {invalid ? `Enter a number from ${MIN_SIZE} to ${MAX_SIZE} px. The map keeps its applied size.` : dirty ? "Size change pending. Press Enter or Apply size; Escape discards." : fit ? `Fit mode adjusts with the view. At the ${MIN_SIZE} px minimum, large maps may still need scrolling.` : `${MIN_SIZE}\u2013${MAX_SIZE} px per cell. Drag the slider or enter a size. Reset returns to ${DEFAULT_SIZE} px.`}
    </p>
  </div>;
}
