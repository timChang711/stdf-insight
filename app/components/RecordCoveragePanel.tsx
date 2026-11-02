import type { RunData } from "../lib/model";
import { recordDefinition } from "../lib/record-coverage";
import PinMappingPanel from "./PinMappingPanel";
import "./record-coverage.css";

export default function RecordCoveragePanel({ run }: { run: RunData }) {
  const source = run.recordCoverage;
  const ignored = run.ignoredRecords;
  const incompleteTests = !!(ignored?.ftr || ignored?.mpr);
  const decoded = run.typedTests !== undefined;
  const unknownParts = run.parts.filter(part => part.recordedVerdict === "unknown").length;
  if (!source && !incompleteTests) return null;
  return <><details className={`run-coverage record-coverage-panel${incompleteTests ? " has-unread-tests" : ""}`}>
    <summary>{incompleteTests ? decoded ? "Record coverage: FTR / MPR available in Test Explorer" : "Partial test coverage: FTR / MPR details are not analyzed" : "Record coverage and source details"}</summary>
    {incompleteTests && <p>{ignored?.ftr.toLocaleString("en-US")} functional (FTR) and {ignored?.mpr.toLocaleString("en-US")} multiple-result (MPR) records {decoded ? "are decoded in their dedicated test views" : "are not decoded"}. Numeric charts and test-level / first-fail Pareto cover PTR measurements only. Part yield still uses the existing PRR disposition calculation.</p>}
    {!!run.recordDiagnostics?.length && <p>{run.recordDiagnostics.length} source association warning(s). {run.recordDiagnostics.slice(0,3).map(item=>`Record ${item.record.ordinal}: ${item.message}`).join(" ")}</p>}
    {unknownParts > 0 && <p>{unknownParts.toLocaleString("en-US")} PRR records have no valid verdict. The map shows UNKNOWN. Existing summary yield still uses the PRR fail bit and includes every PRR record; it is not a qualified unknown-exclusion or retest policy.</p>}
    {source && <>
      <p>{source.recordCount.toLocaleString("en-US")} record envelopes · {source.uncompressedBytes.toLocaleString("en-US")} uncompressed bytes · {source.byteOrder === "little" ? "Little" : "Big"}-endian.</p>
      <p>Counts below are records, not test executions, results or dies. FTR tests may use multiple records; MPR records may contain multiple values. “Partial fields” does not mean complete format support.</p>
      <div className="record-coverage-table" role="region" aria-label="STDF record coverage" tabIndex={0}>
        <table><caption>Records present in this file, in order of first occurrence</caption><thead><tr><th scope="col">Record</th><th scope="col">Type / sub</th><th scope="col">Count</th><th scope="col">Current support</th><th scope="col">Use / purpose</th><th scope="col">First / last record</th><th scope="col">First / last byte offset</th></tr></thead>
          <tbody>{source.records.map(record => { const definition = recordDefinition(record.type, record.subtype); return <tr key={`${record.type}/${record.subtype}`} data-record-type={`${record.type}/${record.subtype}`}><th scope="row">{definition.name}</th><td>{record.type} / {record.subtype}</td><td>{record.count.toLocaleString("en-US")}</td><td><span className={`record-support-${definition.support}`}>{definition.support === "validated" ? "Initial header checked" : definition.support === "partial" ? "Partial fields" : "Not decoded"}</span></td><td>{definition.usage}</td><td>{record.firstRecord.toLocaleString("en-US")} / {record.lastRecord.toLocaleString("en-US")}</td><td>{record.firstOffset.toLocaleString("en-US")} / {record.lastOffset.toLocaleString("en-US")}</td></tr>; })}</tbody>
        </table>
      </div>
      <p>Record numbers start at 1. Byte offsets start at 0 in the uncompressed stream and include the four-byte record header. This inventory does not expose record payloads or validate undecoded fields.</p>
    </>}
  </details><PinMappingPanel run={run}/></>;
}
