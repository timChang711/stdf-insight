# STDF support and calculation rules

## Supported input containers

| Input | Status |
|---|---|
| STDF V4 binary `.stdf` / `.std` | Supported for common record flows |
| Gzip STDF `.stdf.gz` / `.std.gz` | Supported through bundled asynchronous `fflate` decompression |
| ATDF | Not supported |
| CSV / Excel | Not supported |
| STDF V3 | Not supported |

## Parsed records

| Record | Type/Sub | Current use |
|---|---:|---|
| FAR | 0/10 | Validate stream and determine CPU byte order |
| MIR | 1/10 | Lot, device, tester, program, and start time |
| MRR | 1/20 | Finish time |
| WIR | 2/10 | Wafer ID and wafer start time |
| WCR | 2/30 | Basic wafer size, die dimensions and units |
| PIR | 5/10 | Start a part buffer by head/site |
| PRR | 5/20 | Part, site, bins, coordinates, test time, and disposition |
| PTR | 15/10 | Test number, name, result, units, and common limits |
| FTR | 15/20 | Typed record outcomes, raw pin/vector fields, first-record optional defaults and source bytes |
| MPR | 15/15 | Typed parent records, independent result/state/index arrays, selected raw result index and first-record optional defaults; synthetic qualification only |
| PMR | 1/60 | Raw pin mappings with search, source references and explicit omitted fields |

## Not yet parsed or not fully supported

- ATR, RDR, SDR, PCR, HBR, SBR, PGR and PLR payloads.
- WRR metadata and full WCR orientation handling.
- TSR summary reconciliation.
- MPR channel statistics, per-result verdicts and verified pin/result pairing. No real MPR sample has been qualified.
- FTR execution grouping, cross-family first-fail and diagnostic interpretation beyond recorded fields. Numeric analytics and existing first-fail remain PTR-only.
- BPS, EPS, GDR, and DTR payloads.
- Vendor extensions and non-standard records.
- STDF V3 conversion.
- Robust repair of truncated or malformed streams.
- Retest/rescreen consolidation.

## Record inventory and typed inspection (local implementation)

Successfully loaded files now expose all observed type/subtype pairs, record counts, body-byte totals, first/last record numbers and first/last byte offsets. Offsets address the uncompressed STDF stream. The coverage panel distinguishes the initial FAR check, partially decoded fields and undecoded record types; recognized VUR/PSR/scan names do not imply payload decoding or complete V4-2007 support.

Counts are record envelopes, not test executions or dies. One functional test can generate multiple FTR records, and an MPR can hold an array of results. FTR-only, MPR-only and metadata-only V4 files can now load. Typed observations retain source ordinal, byte offset, raw/effective fields, head/site and nullable PRR association. Source bytes are read locally on demand from the original File; decompressed bytes have a weak cache. The inventory itself remains bounded by record types. The staged extension design is in `RECORD_SUPPORT_ROADMAP.md`.

FTR and MPR optional defaults come only from the first record of that kind/test number. Later overrides affect one record, including explicit NUL text overrides; they do not become new defaults. Raw data is unchanged. Invalid/no-limit fields are absent from the effective inspection view. Array result counts do not create new parts or test numbers. Missing links remain visible, and header/default-only observations outside a part do not fabricate a device. `present` describes decoded field availability; a zero-length array can consume zero bytes.

## Byte order

The parser checks the FAR record and treats CPU type 1 as big-endian; other common CPU types are read as little-endian. Every target tester family must be qualified with a reference file before support is claimed.

## Part assembly

- A part buffer is tracked by `HEAD_NUM:SITE_NUM`.
- PTR records are assigned to the current part buffer for that head/site.
- PRR finalizes the part and attaches stored measurements to its coordinates and site.
- FTR/MPR records associate by head/site with the closing PRR; default-only and orphan observations remain inspectable without an invented part.
- Replaced buffers are diagnosed. Existing explicit PIR-without-PRR rejection remains. Multi-wafer separation and retest identity still require a qualified policy.
- Files that omit or reorder the common PIR/PTR/PRR flow may not produce the expected result.

## Population and memory limits

All parsed measurements attached to completed parts are retained; there is no 6,000-sample cap in this source version. Sequence and scatter displays may bound the visible points, while their analytical populations remain as documented by the view.

Files and decompressed bytes are held in browser memory. Gzip runs asynchronously; record parsing yields every 2,048 records for cancellation and UI responsiveness. This is not a streaming parser or a complete parser-worker architecture. The eight-million-record safety limit rejects the run instead of silently returning a partial population. Large-file memory qualification is still required.

The parser validates FAR V4, record envelopes, required prefixes, partial PRR fixed fields and explicit PIR parts left without PRR. Optional trailing PRR fields use their missing values (soft bin 65535, coordinates -32768, test time 0). Optional defaults and default-only PTR metadata outside an explicit part remain accepted. This is not full conformance validation of every field, flag, optional length, or vendor extension.

## Pass/fail rules

The current implementation combines:

- PTR test flags;
- parsed lower and upper limits when present;
- PRR part flags.

Hard bin 1 is not forced to pass by the current parser. Existing PTR numeric/limit calculations and legacy PRR statistical booleans remain unchanged. Typed TEST_FLG evidence separates verdict, execution and diagnostics; not-executed/no-verdict records show UNKNOWN. PRR's invalid-verdict flag shows UNKNOWN in the map and die inspector, with raw flags retained. This does not change legacy yield denominators. Nonfinite PTR values, rolling PTR defaults, changing per-record limits and HBR/PCR reconciliation still need a separately qualified policy.

## Cpk

For finite values with sample standard deviation `s`:

```text
CPU = (USL - mean) / (3s)
CPL = (mean - LSL) / (3s)
Cpk = min(CPU, CPL)
```

When only one applicable limit exists, the current display uses the available one-sided capability. When no usable limit or zero spread exists, Cpk is not reported.

## Required conformance work

Before claiming production-grade compatibility:

1. assemble a licensed, synthetic, or customer-approved golden corpus;
2. compare every parsed field with an accepted reference parser;
3. add unit tests for every record and optional-field combination;
4. add endian, gzip, truncation, corruption, missing-field, multi-head, and multi-site cases;
5. define pass-bin policy per customer/program;
6. validate numerical statistics independently;
7. publish a tested compatibility matrix by tester, OS, program, and file size.

