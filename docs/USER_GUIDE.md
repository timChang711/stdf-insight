# User guide

## Load and manage local runs

The workspace starts empty. Choose **Open STDF**, drag files onto the page, or use **Open folder**. Up to 24 supported files are processed in a batch. Supported extensions are .stdf, .std and their .gz variants. **Sample run** creates synthetic demonstration data only.

Watch the file name and progress while parsing. **Cancel loading** discards the pending batch and retains the previous workspace. Selecting another file, choosing a sample, changing to a recent run or clearing the workspace cancels the previous operation. Cancelling the operating-system picker is silent.

The last successfully parsed file becomes active. Other successful files and the previous active run enter recent history. If a batch contains invalid files, the message identifies skipped files and their errors. Verify lot, device, program, tester, wafer, test count and part count against the file before using the results.

**Run options** provides summary export, **Clear recent runs** and **Clear workspace**. Clearing the workspace removes page-memory runs without changing local files. No saved projects or persistent analysis sessions are provided. STDF bytes remain in the browser.

## Analyze a run

**Run overview** shows PRR-based yield, failed parts, test count, test-time summaries, cumulative yield, wafer disposition, bin and first-fail Pareto, and site yield. No retest/rescreen deduplication is performed; do not interpret the first-pass label as a qualified retest policy.

**Test explorer** searches by test number or name and filters tests by failing/review/capable status. Select a test and optionally a site. Long names wrap. The selected test remains visible while searching, so a search result list does not silently change the analysis population. **Clear test filters** recovers an empty list.

Distribution, Site box plot, Sequence, CDF and Raw data use the selected site and that test's column filters. Raw data supports sequence/part/coordinate ranges, site, numeric value bounds, unit and pass/fail filters. The filter strip remains visible on chart views; **Clear filters** resets both site and column filters. The table is paginated in 100-row pages.

Distribution has explicit X limits, bin width and tick-spacing fields. Leave a field blank for automatic. Edit any combination, then choose **Apply** or press Enter; invalid or unfinished edits leave the applied chart intact. **Discard edits** restores the applied fields. **Fit all** resets to data plus specifications, **Fit data** fits measured values, and **Spec range** uses valid two-sided limits. **Reset** clears manual settings. Settings persist for each test across plot tabs until the run changes.

The shown count is the sum of histogram bars; below-range, above-range and non-numeric counts are listed separately. Range limits only change the view. Statistics use all filtered numeric records, while Fail % uses the recorded pass/fail results of all filtered records. The normal fit uses sample standard deviation; it is hidden when the last bin has a shorter width. Bins include their left edge and exclude the right edge, except the final bin, which includes both. Float32 display cleanup does not round the source measurements.

Mean and sample standard deviation use finite values; Cpk uses the existing one-sided or two-sided specification rule. Review missing/invalid flags and the limitations in [STDF support](STDF_SUPPORT.md) before release decisions. This version does not implement a qualified unknown-disposition policy.

**Wafer map** opens in Pass / fail mode with a coordinate grid: green P cells, red F cells, black gridlines and white unmeasured positions. X is labeled across the top, Y on the left. Y increases downward by default; the direction control can reverse the view without changing coordinates. Adjust cell size and scroll inside the map. Parametric and hard-bin modes remain available.

Click a measured cell or use the keyboard to inspect its original records. Repeated coordinates show the last record and a corner marker; the inspector retains every record, without retest consolidation. Missing STDF coordinate sentinels are excluded and counted; large valid coordinates are retained. Extremely wide coordinate extents use a movable window to keep rendering bounded.

## Compare and export

**Compare runs** compares the active run against the previous run in history. Select a row in **Correlation ranking** to update the scatter and its R, R², slope and intercept. Drift rows still navigate to the corresponding test.

Pairing currently uses test number and sequential part index. Confirm that runs contain the same devices in the same order before interpreting cross-run correlation; die-identity matching and retest consolidation are not implemented. This round preserves that calculation rule.

CSV controls export run summaries, the current test view and run comparisons locally. There is no implemented PDF, Excel workbook, signed report or persistent project workflow.

## Qualification

Synthetic regression and local browser tests do not qualify a tester family. Before operational use, compare approved reference files across byte orders, optional fields, sites, wafer/final test, retests, compressed files and target large-file sizes against an accepted parser and calculation reference. See [round-one validation](ROUND1_VALIDATION.md).
