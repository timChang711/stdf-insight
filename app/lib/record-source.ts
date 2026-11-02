import type { RunData } from "./model.ts";
import type { RecordReference } from "./typed-records.ts";

type SourceHandle = { buffer: WeakRef<ArrayBuffer>; read: (signal?: AbortSignal) => Promise<ArrayBuffer> };
const sources = new WeakMap<RunData, SourceHandle>();

/** Retain a replayable File closure, not a second permanent copy of decompressed bytes. */
export function registerRecordSource(run: RunData, buffer: ArrayBuffer, read: SourceHandle["read"]) {
  sources.set(run, { buffer: new WeakRef(buffer), read });
}

/** Byte offsets always address the uncompressed STDF stream. No network I/O. */
export async function readRecordBytes(run: RunData, record: RecordReference, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const source = sources.get(run);
  if (!source) throw new Error("Original file is unavailable. Reload this local file to inspect source bytes.");
  let buffer = source.buffer.deref();
  if (!buffer) { buffer = await source.read(signal); source.buffer = new WeakRef(buffer); }
  signal?.throwIfAborted();
  const end = record.offset + 4 + record.bodyLength;
  if (!Number.isSafeInteger(record.offset) || record.offset < 0 || !Number.isSafeInteger(record.bodyLength) || record.bodyLength < 0 || end > buffer.byteLength) throw new Error("The record reference is outside its source stream.");
  const view = new DataView(buffer);
  if (view.getUint16(record.offset, run.recordCoverage?.byteOrder !== "big") !== record.bodyLength || view.getUint8(record.offset + 2) !== record.type || view.getUint8(record.offset + 3) !== record.subtype) throw new Error("The record reference does not match this source.");
  return new Uint8Array(buffer.slice(record.offset, end));
}
