# Typed record inspection: local qualification

Baseline: published v22 (`9abfb5e`). This work is local; no new Site version or deployment was created.

## Delivered behavior

- Strict raw FTR/MPR/PMR decoders preserve independent counts, optional tails, original text bytes, arrays and bitfields. Partial declared fields/arrays reject the file rather than return an apparently complete run.
- Recorded verdict, execution and numerical eligibility are separate concepts. FTR/MPR bit 1 is reserved; PTR bit 1 semantics are not reused. Not-executed and no-verdict records show UNKNOWN.
- FTR defaults begin at PATG_NUM; MPR defaults begin at OPT_FLAG. Only the first record establishes them. Later overrides are local, empty text and explicit NUL differ, and raw/effective/source fields are inspectable. Invalid effective fields are omitted without deleting raw evidence.
- FTR/MPR observations retain kind/test number, head/site, source order/offset and nullable PRR association. Orphans/default-only records remain visible without creating parts. Duplicate PIR buffers produce a source warning. Explicit unfinished PIR parts still reject the file.
- Test Explorer separates PTR, FTR and MPR. Typed lists support search, record verdict and head/site filters, reset, 50-record pages, lazy array pages, raw/effective field comparison and a bounded local source-byte preview. MPR selects a raw result index and displays scale/unit separately; it does not assign parent PASS/FAIL to individual results.
- FTR-only, MPR-only and metadata-only files load. PRR map/bin views work without a numeric test. Die inspection keeps all linked typed outcomes in source order, with 25-record pages. UNKNOWN PRR dispositions render gray `?`; existing statistical booleans remain unchanged and the coverage panel explains that distinction.
- PMR mappings are searchable and paginated, with raw names, explicit omitted head/site defaults, duplicate-index warnings and source references. No pin/result pairing is guessed.
- Repeated identical record bodies share immutable raw/effective fields through a bounded 32-variant per-test cache. Hashing only selects a bucket; every hit compares all original bytes. Each observation still owns its source, PRR link and diagnostics. The parse cache is discarded, and on-demand source reads use a weak decompressed-byte cache.

## Checks

`npm ci --no-audit --no-fund` completed from the unchanged lockfile. `npm run check:local` passed: lint (zero errors, two pre-existing unused-component warnings), TypeScript, 137 unit/integration tests, production build and one rendered HTML test. The final build includes the sidebar count and namespaced component-key fix.

Tests include both byte orders; gzip; truncated scalars, strings and arrays; independent MPR counts; odd nibble counts; raw NUL; NaN/Infinity/signed zero; optional defaults and local overrides; every test/part flag byte; 65,536 PTR flag combinations; every FTR optional flag byte; multi-head/site association; original source bytes; cancellation; repeated payload ownership; bounded cache capacity and a real equal-length FNV collision.

Browser checks use the user's computer's local headless Microsoft Edge and loopback preview. Only generated fixtures are used for browser screenshots. Passed groups: typed records 15, die inspector 13, general UI 15, distribution 17, wafer 7, coverage 6. They exercise repeated operations, filter/reset, cancel/clear, source retention and responsive sizes. The die-inspector suite additionally made 54 explicit single-coverage-panel checks and continuously tracked DOM count transitions. No browser runtime errors or external HTTP requests were reported by the suites that monitor them. Current result JSON and screenshots are in ignored `outputs/round4/typed`, `outputs/round3/wafer-inspector`, `outputs/record-coverage`, `outputs/distribution` and `outputs/round1/built-preview`. Desktop/mobile typed and wafer-inspector screenshots were visually reviewed. Generated review inputs are in `outputs/round4/review-fixtures`.

Visual review found that the coverage panel and wafer page used the same sibling React key. Navigation could stack stale coverage panels although existing interaction checks passed. The keys are now distinct and browser regressions assert a single panel after navigation, selection changes and reloads. Initial test-harness issues (a wrong preview port and selectors racing lazy details) were corrected before rerunning; they were not accepted as successful checks.

## Real-data qualification

Only the twelve already-authorized anonymous local gzip copies were read. No source shares were rescanned, no data was uploaded, and no identifying strings or measurements are stored in this repository. Private scripts, snapshots, source hashes and detailed results remain in the sibling `private-stdf-validation` directory.

All twelve files passed raw FTR/PMR decoding with no unexplained trailing bytes. They exercise little-endian FTR PASS/FAIL and PMR names; their FTR optional diagnostic flags mark fields invalid, and pin/state/bit arrays are empty. Nonempty arrays, odd nibbles, unknown/not-executed flags and big-endian layouts therefore have synthetic coverage only. No real MPR sample is present.

The final parser preserved every legacy PTR measurement, PRR legacy field and statistic in all twelve files, checked with complete hashes. Typed/PMR counts equal the independent envelope/decoder scan; every real FTR retained the correct head/site-to-PRR association. A second pass re-decoded each FTR at its source offset and compared raw fields, presence, identity, outcome, ordinal, length and effective invalid-field masking. PMR fields/references also match. All twelve passed with actual payload sharing and no association diagnostics.

The initial full typed model retained too much duplicate payload memory. Exact-byte sharing reduced post-GC retained heap by 61–67% in the twelve-file Node process measurements, to 157–195 MiB (1.17–1.22 times the legacy parser). Peak RSS was 341–448 MiB (1.05–1.29 times legacy). Median parse time was 1.05 times legacy, with a noisy single-run range of 0.96–1.48 under other work on the same computer. These are local Node measurements, not browser performance guarantees. Private source snapshots and SHA-256 hashes fix the compared versions.

## Deliberate remaining boundaries

- MPR has synthetic qualification only. Selected values are raw inspection, not qualified scaled channel statistics, distribution/Cpk, channel wafer color or cross-run comparison.
- FTR execution grouping, cross-family first-fail, overlapping per-test Pareto denominators, retest identity and multi-wafer identity require explicit policies. Counts in typed views are records or covered PRR part records.
- Legacy PTR rolling defaults, per-record limit variants and numeric-invalid eligibility are documented baseline issues, not silently changed by this implementation. The new flag helpers are not wired into legacy statistics.
- PCR/HBR/SBR/WRR/TSR reconciliation, SDR/PGR/PLR metadata, logs and scan-extension payloads remain roadmap work. Recognizing their record names does not imply decoding them.
- Large unique payload populations still consume browser memory. The parser remains cooperative main-thread parsing, not a streaming/worker rewrite; full browser heap qualification across target devices remains necessary.

Layout and flag authority: [original STDF V4 specification](https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/stdf-eclipse/Stdf-V4-spec.pdf), especially PMR p27, PRR pp41–42, PTR pp45–50, MPR pp51–54 and FTR pp55–59.
