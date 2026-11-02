type PayloadEntry<T> = { body: number; end: number; value: T };

/**
 * Bounded interning of exact record-body bytes within one parse/test context.
 * FNV-1a is only a bucket selector: every hit compares length and ALL bytes.
 * Entries retain offsets and the immutable payload reference, never byte copies.
 * The byte view aliases the original DataView's exact window. Keep both source
 * bytes and payloads immutable; discard this cache after parsing, not on RunData.
 * A full cache retains its existing entries and declines additional unique ones.
 */
export class RecordPayloadCache<T> {
  private readonly bytes: Uint8Array;
  private readonly capacity: number;
  private readonly buckets = new Map<number, PayloadEntry<T>[]>();
  private count = 0;

  constructor(view: DataView, capacity = 32) {
    if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError("Payload cache capacity must be a nonnegative safe integer");
    this.bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    this.capacity = capacity;
  }

  private requireBounds(body: number, end: number): void {
    if (!Number.isSafeInteger(body) || !Number.isSafeInteger(end) || body < 0 || end < body || end > this.bytes.length) {
      throw new RangeError("Payload cache range is outside its DataView");
    }
  }

  private hash(body: number, end: number): number {
    let hash = 0x811c9dc5;
    for (let offset = body; offset < end; offset++) hash = Math.imul(hash ^ this.bytes[offset], 0x01000193);
    return hash >>> 0;
  }

  private find(bucket: PayloadEntry<T>[] | undefined, body: number, end: number): PayloadEntry<T> | undefined {
    if (!bucket) return undefined;
    const length = end - body;
    for (const entry of bucket) {
      if (entry.end - entry.body !== length) continue;
      let offset = 0;
      while (offset < length && this.bytes[entry.body + offset] === this.bytes[body + offset]) offset++;
      if (offset === length) return entry;
    }
    return undefined;
  }

  get(body: number, end: number): T | undefined {
    this.requireBounds(body, end);
    if (this.count === 0) return undefined;
    return this.find(this.buckets.get(this.hash(body, end)), body, end)?.value;
  }

  set(body: number, end: number, value: T): void {
    this.requireBounds(body, end);
    if (this.count >= this.capacity) return;
    const hash = this.hash(body, end);
    const bucket = this.buckets.get(hash);
    // The first payload stays canonical; repeated sets do not consume capacity.
    if (this.find(bucket, body, end)) return;
    const entry = { body, end, value };
    if (bucket) bucket.push(entry);
    else this.buckets.set(hash, [entry]);
    this.count++;
  }
}
