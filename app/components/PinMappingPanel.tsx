"use client";

import { useId, useMemo, useState } from "react";
import type { RunData } from "../lib/model";
import type { PinMapping } from "../lib/typed-records";
import "./pin-mapping.css";

const PAGE_SIZE = 50;
const count = (value: number) => value.toLocaleString("en-US");
const rawString = (value: string) => value.replace(/\0/g, "␀");
const headOrSite = (value: number | undefined) => value === undefined ? "omitted (default 1)" : String(value);

function PinName({ value }: { value: string | undefined }) {
  if (value === undefined) return <span className="pin-mapping-missing">omitted</span>;
  if (value === "") return <span className="pin-mapping-missing">empty</span>;
  return <span className="pin-mapping-raw" title="Raw string; NUL bytes are shown as ␀ and whitespace is retained.">{rawString(value)}</span>;
}

export default function PinMappingPanel({ run }: { run: RunData }) {
  const pins = run.pins;
  const inputId = useId(), helpId = useId();
  const [state, setState] = useState<{ source: PinMapping[] | undefined; query: string; page: number }>({ source: pins, query: "", page: 0 });
  // Derive reset state when another source is loaded; no render-time/effect setter.
  const query = state.source === pins ? state.query : "";
  const requestedPage = state.source === pins ? state.page : 0;
  const needle = query.trim().toLowerCase();
  const inventory = useMemo(() => {
    const indexCounts = new Map<number, number>();
    const rows = (pins ?? []).map((pin, sourceIndex) => {
      indexCounts.set(pin.index, (indexCounts.get(pin.index) ?? 0) + 1);
      const searchable = [
        pin.index, pin.channelType, rawString(pin.channelName ?? ""), rawString(pin.physicalName ?? ""),
        rawString(pin.logicalName ?? ""), headOrSite(pin.head), headOrSite(pin.site), pin.record.ordinal, pin.record.offset,
      ].join(" ").toLowerCase();
      return { pin, sourceIndex, searchable };
    }).sort((a, b) => a.pin.record.ordinal - b.pin.record.ordinal || a.sourceIndex - b.sourceIndex);
    let duplicateIndices = 0, duplicateRecords = 0;
    for (const occurrences of indexCounts.values()) {
      if (occurrences > 1) { duplicateIndices++; duplicateRecords += occurrences; }
    }
    return { rows, indexCounts, duplicateIndices, duplicateRecords };
  }, [pins]);
  const matches = useMemo(() => needle ? inventory.rows.filter(row => row.searchable.includes(needle)) : inventory.rows, [inventory, needle]);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const start = page * PAGE_SIZE;
  const visibleRows = matches.slice(start, start + PAGE_SIZE);
  const changePage = (nextPage: number) => setState({ source: pins, query, page: Math.max(0, Math.min(nextPage, pageCount - 1)) });
  const clearSearch = () => setState({ source: pins, query: "", page: 0 });

  if (!pins?.length) return null;
  return <details className="pin-mapping-panel">
    <summary>Pin mappings (PMR) <span>{count(pins.length)} records</span></summary>
    <div className="pin-mapping-content">
      <p>Each row is one PMR source record. Channel, physical and logical names are displayed as recorded.</p>
      {inventory.duplicateIndices > 0 && <p className="pin-mapping-warning" role="note">
        <strong>Duplicate PMR indices:</strong> {count(inventory.duplicateIndices)} index {inventory.duplicateIndices === 1 ? "value occurs" : "values occur"} in {count(inventory.duplicateRecords)} records. These rows remain separate in source order. Check the source before using an index to identify a pin.
      </p>}
      <div className="pin-mapping-toolbar">
        <label htmlFor={inputId}>Search pin mappings
          <input id={inputId} type="search" value={query} aria-describedby={helpId} placeholder="Index, pin name, head/site or source location"
            onChange={event => setState({ source: pins, query: event.target.value, page: 0 })}/>
        </label>
        <button type="button" disabled={!query} onClick={clearSearch}>Clear search</button>
      </div>
      <p id={helpId} className="pin-mapping-help">Search includes channel type, all three names, head/site, source record and byte offset. NUL bytes appear as ␀; empty strings and omitted fields are labeled separately.</p>
      <p className="pin-mapping-count" aria-live="polite" aria-atomic="true">
        {matches.length ? `${count(start + 1)}–${count(start + visibleRows.length)} of ${count(matches.length)} records` : "No pin mappings match this search."}
        {!!needle && <span> · {count(pins.length)} in this file</span>}
      </p>
      {matches.length > 0 ? <div className="pin-mapping-table-scroll" role="region" aria-label="Raw PMR pin mappings" tabIndex={0}>
        <table>
          <caption>PMR source records · 50 rows per page</caption>
          <thead><tr>
            <th scope="col">PMR index</th><th scope="col">Channel type</th><th scope="col">Channel name</th>
            <th scope="col">Physical name</th><th scope="col">Logical name</th><th scope="col">Head</th>
            <th scope="col">Site</th><th scope="col">Source record</th><th scope="col">Byte offset</th>
          </tr></thead>
          <tbody>{visibleRows.map(({ pin, sourceIndex }) => {
            const occurrences = inventory.indexCounts.get(pin.index) ?? 1;
            return <tr key={`${pin.record.ordinal}-${sourceIndex}`} className={occurrences > 1 ? "pin-mapping-duplicate" : undefined}>
              <th scope="row">{pin.index}{occurrences > 1 && <span className="pin-mapping-duplicate-label" title={`${occurrences} PMR records use this index.`}>Duplicate</span>}</th>
              <td>{pin.channelType === undefined ? <span className="pin-mapping-missing">omitted</span> : pin.channelType}</td>
              <td><PinName value={pin.channelName}/></td><td><PinName value={pin.physicalName}/></td><td><PinName value={pin.logicalName}/></td>
              <td className={pin.head === undefined ? "pin-mapping-missing" : undefined}>{headOrSite(pin.head)}</td>
              <td className={pin.site === undefined ? "pin-mapping-missing" : undefined}>{headOrSite(pin.site)}</td>
              <td>{count(pin.record.ordinal)}</td><td>{count(pin.record.offset)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className="pin-mapping-empty"><span>Try another name or index.</span><button type="button" onClick={clearSearch}>Show all pin mappings</button></div>}
      {matches.length > PAGE_SIZE && <nav className="pin-mapping-pagination" aria-label="Pin mapping pages">
        <button type="button" onClick={() => changePage(page - 1)} disabled={page === 0}>Previous</button>
        <span>Page {count(page + 1)} of {count(pageCount)}</span>
        <button type="button" onClick={() => changePage(page + 1)} disabled={page === pageCount - 1}>Next</button>
      </nav>}
      <p className="pin-mapping-help">Missing head/site fields have the STDF default of 1; explicitly recorded 0 remains 0. Source record numbers start at 1; byte offsets start at 0 in the uncompressed STDF stream. Rows retain their source identity without inferred FTR/MPR associations.</p>
    </div>
  </details>;
}
