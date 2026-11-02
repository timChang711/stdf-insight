# Record support, traceability and analysis roadmap

Baseline: published v22, `9abfb5e69117797a34fe3fd416f171ffd4b35749`.
Status: local record inventory plus typed FTR/MPR decoding and inspection implemented. No publication is authorized for this round.

## Implemented local slice

- FTR and MPR raw decoders with strict bounds, both byte orders, flags and fixed first-record optional defaults; PMR raw mapping fields.
- Source references and local byte inspection, nullable head/site-to-PRR association, independent raw/effective fields, and preserved orphan/default observations.
- Dedicated test-family navigation, searchable record lists, verdict/head-site filters, bounded pagination, FTR pin/vector evidence, and MPR selected raw result index with separate scale/unit fields.
- FTR-only/MPR-only/metadata-only loading; PRR map and bin inspection work without a numeric test. Die inspection includes typed evidence and unknown recorded PRR dispositions.
- Existing PTR calculations and legacy yield/first-fail populations remain unchanged. MPR scalar charts, execution grouping, retest/wafer identity and cross-family analytics remain subsequent qualified phases.

The v22 behavior table below describes the baseline, not the complete current implementation. See `TYPED_RECORDS_VALIDATION.md` for qualification and remaining gaps.

## Goal and boundaries

TEs should be able to open a file, see what it contains, inspect a die's complete recorded evidence, and choose the appropriate analysis for each test family. Adding record decoding must not silently change existing populations, limits, yield or retest policy.

The architecture is **source records → resolved semantics → analysis views**. A record is not automatically a test execution. A numeric result is not automatically a die, an independent test number or a per-result verdict. Missing, invalid, unknown and excluded are different states.

## What v22 actually does

| Area | Current behavior | Consequence for expansion |
|---|---|---|
| File/parser gate | Requires both PRR parts and PTR measurements | FTR-only, MPR-only and metadata-only files cannot yet enter a content inspector |
| Record handling | FAR validation; selected MIR/MRR/WIR/WCR/PIR/PRR/PTR fields; FTR/MPR counts only | Complete records, original flags and most metadata cannot be reconstructed from RunData |
| PTR metadata | Rolling defaults are updated on every PTR; TestData retains the first non-null unit/limits | A measurement's effective limits can differ from the displayed limits; inheritance changes require numerical qualification |
| Part identity | Buffer by head/site; retain only site and final PRR index | Head identity is lost; implicit/orphan buffers and duplicate PIR can lose observations |
| Wafer identity | One global wafer ID/geometry is overwritten by later wafer records | Different wafers at the same X/Y cannot safely be distinguished from repeated coordinates |
| Outcomes | Boolean pass; recorded flag and numeric limit comparisons folded together | Unknown, not executed, invalid value and diagnostics cannot be explained independently |
| Tests | Numeric test number is the key; every test owns scalar values and Cpk | FTR must not be appended to the numeric list; MPR needs a channel-aware projection |
| Die inspector | PRR outcome separate from latest selected PTR result; all decoded PTR failures retained | Extend evidence by record family, without changing PRR or treating an empty failure list as PASS |
| Pareto | PTR-only first-fail or hard bin, one count per failed PRR record | All-test failures overlap; the same cumulative denominator cannot be reused |
| Comparison | Numeric test ID and part-index alignment | Identity and channel compatibility need explicit qualification before broader comparison |

Synthetic code-behavior probes demonstrated rolling override propagation, lost head identity, dropped trailing implicit PTR, overwritten buffers after repeated PIR, differing cardinality between part.values and test.values, and merged wafer scopes. These are observed v22 behaviors, not approved replacement rules.

## Information architecture

Keep the current Overview, Test Explorer, Wafer map and Compare runs. Add **Test setup** and **Logs & records** when their data models are ready. Basic run/file metadata belongs in Overview; advanced source inspection is available from every relevant item through one shared record drawer.

### Overview

1. Source identity and load state, with record coverage always available.
2. PRR record populations, current legacy yield and explicit policy label. Do not call all-record yield qualified first-pass yield before a retest policy exists.
3. Failure analysis with separate choices for hard-bin, legacy PTR first-fail and future qualified cross-family views.
4. Run metadata, wafer segments and head/site inventory; missing fields stay missing.
5. Recorded PCR/WRR/TSR summaries beside recomputed summaries, with source/scope/policy labels and differences. A file summary is not filtered data and never silently overwrites it.

### Test Explorer

The test list offers type chips (PTR, MPR, FTR), full names and search. Record family and metadata context form identity; test number alone is not enough when types, units or configurations conflict. Selection has a typed key rather than only a numeric ID.

- **PTR:** retain Distribution, site plot, sequence, CDF and raw measurement views. A limits/defaults panel explains each metadata variant and the current analysis cohort.
- **FTR:** show recorded functional outcomes, covered part records, record sequence, head/site and available pin/vector diagnostics. Use record counts and valid-verdict counts until execution grouping is qualified. Do not show Cpk, a fabricated numeric histogram or Pearson correlation. NUM_FAIL is diagnostic pin-failure information, not the number of failed dies. Failure addresses never become wafer X/Y.
- **MPR:** first show the parent test and observation list. Expand an observation to its result array, return-state/index arrays and optional input/scan information. Choose a result channel before opening numeric plots. RTN_ICNT and RSLT_CNT remain separate; unmatched indexes remain unresolved. A child result keeps the parent observation and PRR part association. No synthetic TEST_NUM or extra die is created.
- **MPR channel selection:** distinguish result ordinal, verified pin mapping and input/scan position. Display result index when pin mapping is absent. Never infer one-to-one result/pin correspondence or pool unlike pin/input dimensions by default.
- **Raw views:** label their unit: PTR measurement rows, FTR record rows, MPR parent records or expanded result rows. Every row links to its source and parent part. Filters retain clear/reset behavior and disclose denominator changes.

### Wafer map and die details

Preserve the reference-style P/F grid and PRR color mode. Add a wafer-segment selector before supporting multiple wafers; head/site and source context prevent accidental coordinate merging. Existing repeat markers continue to mean multiple records, not automatic retest consolidation.

The die inspector hierarchy is:

1. **Original part result:** PRR flags, hard/soft bin, source part ID, wafer/head/site and identity confidence.
2. **Selected test evidence:** family, observation(s), recorded verdict, numeric validity and diagnostics independently.
3. **Recorded failure evidence:** PTR/MPR/FTR evidence groups, complete names, source order, coverage gaps and links. A prior failure followed by a later PASS remains inspectable.
4. **All observations:** ordered timeline with repeat/implicit association notes; expandable MPR arrays and FTR pin details.
5. **Source drawer:** record ordinal, uncompressed byte offset, fields, presence, original flags, inheritance provenance and parse diagnostics.

A map of selected-test verdict is a distinct mode from overall PRR disposition. A parametric map requires a compatible numeric channel. An unmeasured/unknown/invalid result has a neutral state and explicit legend; it is never presented as PASS.

### Test setup

- MIR/SDR: program/equipment and head/site context, with source records and optional-field status.
- PMR: pin indexes and names; PGR: groups; PLR: logic/state mapping. Scope names by their declared context and keep unresolved links visible.
- HBR/SBR: declared bin labels/pass indications, alongside raw numbers; remove demo-only label assumptions when real metadata is used.
- WIR/WRR/WCR: wafer segments, recorded geometry/orientation and summary scope.
- ATR/RDR/VUR/PSR: audit, retest configuration, version and pattern setup. Recognizing their names is not a claim that extension payloads are decoded.

### Logs & records

Provide record-type/search filters, an ordered virtualized table and the shared drawer. Show source order even when timestamps are absent. BPS/EPS supply section context, DTR remains text, GDR retains typed values, and unknown/vendor payloads remain opaque. Do not render DTR/GDR content as executable HTML or infer a test outcome from free text.

Keep overview summaries concise; full metadata, byte evidence and diagnostics are available by progressive disclosure. Pinned filters, clear-all, back-to-die/test navigation and stable selection should work consistently.

## Data layers and invariants

| Layer | Proposed shape / invariants |
|---|---|
| Source | Session source ID, original File reference, compression, CPU/version, byte order, uncompressed length, parser/policy version. Byte offsets always refer to the decompressed stream. Reloading/releasing a source invalidates its derived references safely. |
| Record index | Stable source ID + record ordinal, type/subtype, offset and length. Use packed/chunked numeric arrays, not millions of duplicated JS record objects. Keep all accepted envelopes in order. |
| Field evidence | Raw encoded value/bytes; present/omitted/invalid/reserved/malformed state; diagnostic; source record. Preserve original strings separately from trimmed display strings. |
| Resolved fields | Value plus origin (explicit field, qualified file default, unavailable) and the source default record. A record-local override does not become a rolling default. Separate family-specific rules; do not generalize Cursor fallback values into real data. |
| Part records | Identity anchored to original PRR/source context; PIR association and head/site/wafer segment retained; uncertain/implicit/orphan links produce diagnostics. A repeated coordinate is not an identity decision. |
| Test observations | Discriminated PTR scalar, MPR arrays and FTR functional records; retain ordered record references. Repeated TEST_NUM is preserved. Do not manufacture a universal execution ID for FTR. |
| Outcome | Part disposition, recorded test verdict, execution state, value validity and diagnostic conditions are independent. Keep raw flags even after interpretation. Unknown/invalid/not executed/excluded are not synonyms. |
| Numeric projection | Explicit channel/cohort/limits policy and originating observation/result index; feeds existing charts through a compatibility adapter. Each projection declares the population and exclusion reasons. |
| Analysis | Named policy/version, eligibility, numerator/denominator, distinct part/record/result counts, metadata variants and coverage qualification. Calculations consume views, not raw decoder side effects. |

FTR grouping remains optional and qualified: one test can produce several records, and identical adjacent test numbers are not sufficient proof of one execution. The first usable release can report observations, covered PRR part records and valid recorded verdicts without an execution rate.

PTR, MPR and FTR require separate flag decoders. Numeric validity must not be inferred from a flag bit that is reserved for that record family. PRR validity also remains separate from its fail bit. Per-result MPR verdicts are only present when supported by qualified evidence; a parent verdict is not copied to every child value.

## Memory and browser execution

- Phase 0 adds O(distinct record types) inventory only; it does not duplicate payload bytes or preserve every record reference.
- Full traceability must budget original File retention, decompressed bytes and index memory before implementation. Keeping both all decoded objects and another full payload copy is unacceptable for large runs.
- Prototype a cancellable worker plus compact index. Decode drawers/large arrays lazily, virtualize rows, and release caches/history on clear. Source replay/reinflation is an explicit fallback; never promise lossless inspection when bytes were discarded.
- Derive per-test/per-part indexes once, using immutable identities; do not rescan all measurements for each map resize or selected die.
- Benchmark one large local authorized file and a generated stress fixture. Publish only synthetic/generic qualification evidence, never company identifiers or payloads.

## Phased delivery and acceptance gates

| Phase | Deliverable | Must pass before proceeding |
|---|---|---|
| **0 — Current local slice** | Per-type envelope inventory, first/last record and byte offsets, support labels, all-types coverage panel | Exact counts/offsets, gzip/endian equality, unknown record visibility, malformed-envelope rejection, unchanged existing tests/parts/statistics; no claim of full raw preservation |
| **1 — Source and semantics foundation** | File-details entry independent of numeric tests; compact source/record index, field presence, diagnostics, head/site/wafer scope, family-specific raw flag evidence; v22 adapter | FTR-only/MPR-only/metadata-only opens without invented measurements; original record order retained; duplicate PIR/orphans/multiple wafers visible; cancellation/memory limits; legacy view unchanged |
| **2 — FTR evidence** | Strict bounds-aware FTR decoding, functional test catalog, die evidence, pin/vector drawer; PMR and required setup context | Both endian, omitted tails, flag combinations, multiple records per test, absent pin metadata, multi-head/site and no fabricated execution counts; real approved FTR examples compared to accepted reference output |
| **3 — MPR evidence and channels** | Parent observation + arrays; independently decoded counts/states/indexes and optional input dimension; selected qualified channel numeric projection | Odd nibble counts, differing RTN_ICNT/RSLT_CNT, omitted/defaulted arrays, scan input dimension, unresolved pins, repeated observations and nonfinite results; part count unchanged; no pooling by default |
| **4 — Setup, summaries and logs** | Remaining metadata, bins/groups/logic, section/log records and recorded summary reconciliation | Correct scopes; no computed-summary overwrite; no invented timestamps/HTML; source navigation and large-table performance |
| **5 — Approved analysis policy** | Qualified tri-state rates, effective-limit cohorts, cross-family first-fail, separate per-test Pareto and cross-run comparison | Explicit decisions below, before/after population and numerical comparison, independent golden expectations, clear labels and reversible version |

Phases 1–4 may expose additional evidence without changing legacy analysis. Policy-sensitive fixes can be developed and tested behind a separate view, but switching the default requires a concrete comparison and an explicit decision. Do not interpret a general request to continue as a choice of every algorithm.

## Decisions that must remain explicit

| Decision | Alternatives to present | Safe interim behavior |
|---|---|---|
| Invalid/unknown verdict rates | Valid executed verdicts only vs all recorded observations, with unknown separately | Keep legacy metrics labeled; show raw/unknown counts alongside; do not decide unknown = PASS |
| Flag vs numeric limits | Recorded verdict, recomputed spec check, or both displayed as different facts | Preserve both evidence streams; do not silently overwrite either |
| PTR/MPR defaults and limits | Correct file-default resolution; per-context/per-record limit cohorts; handling changing limits for Cpk | Correct raw/resolved layer after spec tests; keep legacy adapter for before/after comparison until analysis switch is approved |
| Retest/part identity | All PRR records, first qualified attempt, last qualified attempt, explicit supersession flags | Preserve all records; no deduplication by X/Y alone; show policy in yield labels |
| FTR execution grouping | Qualified vendor/program rules vs record-observation reporting | Use record counts and covered part counts; no guessed grouping/rate |
| Cross-family first-fail | Earliest valid recorded failure per PRR part; include/exclude PRR PASS parts; unknown preceding evidence | Retain PTR-only legacy result; show coverage; no attribution before complete ordering/eligibility rules |
| Per-test Pareto | Failed observations, qualified executions, or unique failed PRR parts per test | Use separate chart and denominator. A die can fail multiple tests; affected-die percentages need not sum to 100%. Do not reuse disjoint first-fail cumulative percent. |
| MPR channel matching | Ordinal, verified pin, input dimension or a qualified compound key | Unresolved channel cannot silently join another channel or run |
| Cross-run pairing | Verified lot/wafer/part/attempt identity vs population comparison | Existing part-index correlation labeled; do not claim same-die identity or correlate FTR outcomes as numeric values |
| Summary conflicts | Recorded file summary vs recomputed qualified population | Show both with scope and delta; neither wins implicitly |

## Qualification data still needed

Existing authorized local copies can qualify envelope inventory and present FTR/setup record families. They do not qualify MPR or every functional diagnostic/flag case. No other shared directories are to be searched without authorization.

Request the smallest approved, anonymized examples (or vendor-generated equivalents) for: MPR with multiple results and unequal return/result counts; MPR scan input dimensions; pin groups/logic; representative unknown/not-executed/invalid flags; omitted default tails and local overrides; big-endian records; repeated FTR records for one test with a documented vendor grouping rule; multiple wafer/head/site scopes; explicit retest/supersession. An accepted reference decode or tester report should accompany each example. Missing real examples remain a qualification gap even when synthetic tests pass.

## Specification references

- [Teradyne STDF V4 specification, archived original](https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/stdf-eclipse/Stdf-V4-spec.pdf): PRR pp.41–42, PTR pp.45–50, MPR pp.51–54, FTR pp.55–59. Consult the complete field notes when implementing defaults/flags; summaries do not replace the specification.
- [STDF V4-2007 specification](https://www.roos.com/roos/documentation.nsf/3d6a93a7e05462cf85256a9c007dcaf3/92102f712ce51df48825783800832332/$FILE/STDF%20Spec%20V4%202007.pdf): record type registry pp.20–21. Inventory recognition of VUR/PSR and scan-family names does not imply decoding or full V4-2007 conformance.
