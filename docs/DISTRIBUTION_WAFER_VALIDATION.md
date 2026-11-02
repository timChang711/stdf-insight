# Distribution and wafer-map update

## Changes

- Distribution stages edits until Apply/Enter, with explicit discard/reset, automatic blank fields and quick ranges. Incomplete numeric edits cannot change the chart.
- Float32 display noise no longer creates an extra histogram sliver. A synthetic 5.6–6 V range with 0.02 V bins has 20 bars. Source measurements are not rounded.
- Bins include the left edge; only the final bin includes its right edge. A genuinely shorter final bin is labeled, and the full-width normal reference is hidden in that case.
- Numeric N, visible count, out-of-view counts and nonfinite exclusions are separate. Axis changes do not change the statistical population.
- Fail rate uses the existing recorded pass/fail result over all filtered records, consistently with the upper summary. An all-nonfinite test no longer falsely reports zero recorded failures. No flag interpretation or unknown-disposition policy was added.
- Per-test settings and drafts survive plot-tab changes; changing the loaded run resets them.
- Wafer maps use a coordinate grid, green P/red F cells and white unmeasured positions. Original coordinates, WCR geometry and bin/parametric modes are retained; Y direction is explicitly adjustable.
- Repeated wafer coordinates retain every record in the inspector. The last record supplies the visible cell color, with an explicit marker and explanation. No retest consolidation is performed.
- Load-progress display is throttled to 100 ms; opening/completing/cancelling remains immediate. Cross-run calculations are memoized and reuse their paired rows. Pairing still uses test ID and sequential part index, with an explicit same-die identity warning.

## Verification

Commands: `npm run check:local`, `npm run test:ui`, `npm run test:distribution:ui`, `npm run test:wafer:ui` against the built loopback preview.

Final local results: lint and typecheck pass (two pre-existing unused legacy-component warnings); 25 numeric/parser tests and one rendered-HTML test pass; production build passes with the pre-existing Vinext route-classification notice. Browser regression passes all 15 general workflow groups, 17 Distribution groups and 7 wafer-map groups, with no page errors. Synthetic screenshot inspection confirms unwrapped summary numbers and readable map controls at desktop and mobile sizes.

Numeric regressions independently check histogram endpoints/count conservation, decimal boundaries, nonfinite records, constant data, very small values, large offsets, narrow ranges, and sample mean/standard deviation/Cpk. Deterministic Float32 sweeps exercise thousands of synthetic scales and populations. Authorized local-file comparisons preserved the prior finite statistics and recorded pass/fail results; private sample-level results remain outside source control.

Browser checks use isolated headless Microsoft Edge on the connected Windows computer. Screenshots and uploaded browser fixtures are synthetic only. Tests cover staging, invalid/unfinished edits, discard/reset, clipping, filters, statistics, tab/test/run changes, four viewport widths (1440/1024/768/390), wafer orientation, keyboard selection, duplicates, missing coordinates, WCR geometry and bounded large-coordinate windows.

Local screenshots and detailed machine-readable UI results are under ignored `outputs/`. Production smoke verification uses generated synthetic STDF only.

## Limits

- FTR/MPR decoding, invalid/unknown policy, changing test limits, retest consolidation and same-die cross-run identity are not expanded by this update.
- Decimal-scaled Float32 values lack original scale metadata in the current model; the display helper does not guess a new precision or alter their measurement values.
- Normal fit is a sample-statistic reference, not a normality test or conformance assertion.
- Profiler timings are diagnostic measurements, not a controlled browser throughput benchmark. The parser scheduler itself is unchanged.
- Full STDF conformance and all browser engines remain outside this qualification.

The release source is a sanitized snapshot based on the previously saved source commit. Private local report history remains only in local checkpoints and backups.
