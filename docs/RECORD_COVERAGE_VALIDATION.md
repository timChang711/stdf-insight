# Record coverage phase 0 validation

Local work based on published v22 (`9abfb5e`). This phase has not been pushed or deployed.

## Implemented

- O(distinct record types) inventory in the existing parser loop: envelope count, body-byte total, first/last record number and uncompressed byte offset, endian and total uncompressed length.
- Explicit support registry and expandable coverage table, including undecoded FTR/MPR, recognized setup/scan names and unknown type/subtype pairs.
- Clarified record counts versus executions/results/dies. FAR labeling refers to the initial header check, not full validation of every field or subsequent record.
- Staged architecture, screen mapping, qualification gates and unresolved analytical decisions in `RECORD_SUPPORT_ROADMAP.md`.
- Existing decoder expressions, PTR/PRR populations, pass/fail, limits, statistics and first-fail policy unchanged.

## Passed

- `npm run check:local`: typecheck, 40 unit tests, build and rendered HTML test. ESLint has zero errors and the same two pre-existing unused legacy-component warnings.
- New six-case unit coverage includes independently expected record ordinals/offsets, byte conservation, LE/BE, gzip/plain equality, unknown types, bounded inventory storage and truncated-envelope rejection. Existing tests/parts remain deep-equal with opaque additional records.
- `npm run test:coverage:ui`: six groups covering support/count labels, unknown and extension types, exact offsets, collapse/reload, gzip, desktop/mobile local scrolling and clearing stale coverage.
- `STDF_TEST_URL=http://127.0.0.1:5175 npm run test:ui`: 15 existing interaction groups, including filters, chart sizing, cancellation and stale-load protection.
- Headless Edge ran on the user's Windows computer using generated in-memory STDF only. Screenshots/results are in ignored `outputs/record-coverage/`.
- Existing authorized local copies were scanned read-only for envelope coverage only; detailed private aggregates remain outside the repository. No shared-folder expansion or upload occurred.

## Corrected verification setup

The first typecheck rejected the new runtime `.ts` import used by native Node type-stripping tests. Enabling `allowImportingTsExtensions` with the existing `noEmit` configuration resolved this; build and tests passed afterward.

## Not implemented or qualified here

FTR/MPR payload decoding, source-byte retention, a complete record index, field-presence/default provenance, tri-state outcomes, multi-wafer identity, retest consolidation and alternative statistical policies remain future phases. Non-PTR-only files still fail the existing parser eligibility check. The inventory must not be described as lossless raw-record support or as complete STDF conformance. Real MPR and several diagnostic/flag families still need representative approved qualification data.
