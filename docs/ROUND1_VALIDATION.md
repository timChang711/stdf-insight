# STDF Insight — round-one implementation and validation

Date: 2026-10-01. This is a local, unpublished change set.

## Provenance and recovery

- Confirmed Sites project: `appgprj_6a8739aa70ac81918aa7365aa1a6b761`, STDF Insight, public live URL https://stdfinsight.com.
- Official Sites Open a Site workflow restored the source into `<local-checkout>/stdf-insight`.
- Saved v20 baseline: `6fba7d73e8af30b51a689ed8640ae34a4ddbfdaa`.
- Deployed v19 baseline: `ee31ba3cfce21d1b20cfa5e179a19a795a7d9d58`. Saved v20 is not treated as the live version.
- v20 adds Test Explorer fit and distribution scale controls: only `app/page.tsx` and `app/globals.css`, 69 insertions / 3 deletions versus v19. This work is retained.
- Initial checkout was clean. No applicable AGENTS.md or repository .agents skills were present.
- Local branch: `improve/local-workflow-20261001`.
- Baseline tags: `checkpoint/saved-v20-20261001`, `checkpoint/deployed-v19-20261001`.
- Sibling backup: `../stdf-insight-baseline.bundle`; final change bundle: `../stdf-insight-round1.bundle`.
- No company repository was modified. No source push, merge, Sites save, deployment or access-policy change was performed.

## Changes

1. Extracted the existing parser/model and statistics into testable modules. Statistical formulas, per-record fail rules and cross-run part-index pairing remain unchanged.
2. Added structural rejection for unsupported STDF versions, truncated record envelopes, missing prefixes, partial PRR fields and explicit PIR parts without PRR. Preserved legitimate optional tails/default metadata; missing PRR coordinates now use -32768 instead of fabricating an origin.
3. Added asynchronous local gzip decompression, cooperative record parsing, progress, batch cancellation, folder cancellation and stale-operation guards. Clear workspace/history and same-file reload reset the appropriate state.
4. Removed unbounded argument-spread extrema crashes and cached run-level test summaries.
5. Kept the existing brand, colors and author links; wrapped long test names, enlarged working controls, put the distribution before secondary diagnostics, and made chart/report heights respond to their content.
6. Added a visible filter reset across site and column filters. Correlation ranking now updates the scatter on the comparison page; the original baseline ordering and pairing rule are retained.
7. Made local lint/typecheck validation portable. Added pinned development-only Worker types and Playwright Core. Runtime dependencies and hosting identity are unchanged.

## Verification

Commands from the checkout:

```powershell
npm ci
npm run check:local
npm run dev:local
# In a second terminal; installed Microsoft Edge is required:
npm run test:ui
```

`test:ui` refuses non-loopback URLs. Set `STDF_TEST_URL` only to another local port if necessary. It launches an isolated headless Edge browser on the connected Windows computer, without the user's browser profile. All fixtures are generated in memory; no private/company STDF was used or uploaded.

| Check | Result |
| --- | --- |
| Lint | Pass, with 2 pre-existing unused legacy component warnings |
| TypeScript | Pass |
| Synthetic parser/statistics suite | 10 tests pass |
| Production build | Pass; existing Vinext static route-classification notice remains |
| Existing rendered-HTML test | 1 test passes |
| Local Edge UI | 15 synthetic operation groups pass; authorized local-file checks pass |
| Built-output preview | Cloudflare/Vite preview passes; Windows Vinext start has the limitation below |
| Diff whitespace validation | Pass |

Parser/statistics coverage: little/big endian, gzip equivalence, optional PTR defaults, PRR pass/fail and first-fail retention, malformed envelope/version/prefix, optional PRR/WCR tails, default-only metadata, cancellation before/during/at final progress, known sample SD/Cpk and 150,000 measurements without argument overflow.

UI coverage: initial empty state, local synthetic file loading, repeated same-name reload, raw sequence and site filters reflected in plots/statistics, clear filters, invalid bin width and scale reset, empty test-search recovery, all plot tabs, correlation selection, gzip input, invalid-file preservation, cancellation, clear during a 100,000-part pending parse, delayed folder discovery cancellation, picker cancellation, clear history and reopening. Folder picker/traversal cancellation uses an explicit test double; native OS permission dialogs are not automated.

Responsive inspection: screenshots at 1440, 1024, 768 and 390 pixels; no page-level horizontal overflow; distribution plot and summary retain positive usable dimensions. Long synthetic test names remain available. Synthetic screenshots and machine-readable results are in ignored `outputs/round1/` (built preview under `built-preview/`). Private real-file results are kept separately outside the repository.

Preliminary failures resolved during this round: missing Worker type declarations, Linux-only lint command, optional-tail validation that was initially too strict, and UI harness setup/syntax issues. The final check:local pipeline and the Cloudflare/Vite preview checks pass. The two unused legacy component lint warnings were present in the baseline and were retained to avoid unrelated deletion. A concurrent build also reloaded the development UI during one test attempt; the suite passed when rerun after the build finished.

## Remaining limits and decisions

- **No production deployment:** no deployment was requested or performed. Native OS directory-picker permissions, other browser engines and 200% text enlargement remain untested. Private validation records are stored outside this source tree.
- **Windows Vinext start:** the pinned Vinext static-file cache retains Windows backslashes in nested asset keys; `vinext start` returned 404 for JS/CSS while the HTML returned 200. This is a local serving limitation, not a STDF decode failure. Use `npm run preview:local` to inspect the existing Cloudflare build output. No dependency internals were patched or framework upgraded.
- **Memory:** complete files, decompressed bytes and results remain in memory. Cooperative parsing improves cancellation but is not a streaming parser or full parser-worker conversion. Peak memory at 250 MB+ and the eight-million-record limit were not load-qualified.
- **Analysis policy:** existing invalid/unknown PTR/PRR flags and nonfinite values can still disagree with finite-only statistical sample counts. Choose a qualified unknown/invalid disposition policy before changing those results.
- **Comparison identity:** sequential `partIndex` pairing is unchanged. Choosing head/site + die identity and a retest policy requires a separate analytical decision and reference corpus.
- **Limits:** changes to limits across records, complete optional-field validation, MPR/FTR coverage and vendor extensions remain outside this round.
- **Qualification:** synthetic tests and authorized local-file comparisons demonstrate these cases only; they do not certify complete STDF V4 conformance or a tester family.

Optional-tail decisions were cross-checked against the [PySTDF V4 record reference](https://raw.githubusercontent.com/cmars/pystdf/master/pystdf/V4.py) and [Semi-ATE PRR implementation](https://raw.githubusercontent.com/Semi-ATE/STDF/main/Semi_ATE/STDF/PRR.py). A primary Teradyne PDF mirror could not be retrieved; no claim of full official-spec conformance is made.


## Private local validation

Authorized local files were also checked against the saved baseline, with independent record counts and sample-statistic comparisons. Raw files, identifying paths, sample-level measurements, counts and timings are retained only in a private local validation record outside this repository. None are included in the published source or deployment artifact.
