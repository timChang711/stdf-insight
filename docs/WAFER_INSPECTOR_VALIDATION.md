# Wafer inspection and zoom validation

Date: 2026-10-01. Baseline: published v21, commit `0d641b15d5833a9b08a3518809305b41209965f4`.

## Behavior

- Reference-style coordinate grid retains green P/red F cells, black gridlines, top X/left Y labels and explicit Y orientation. Small cells reduce label density without dropping die records.
- Each coordinate record gets its own inspector. Overall PRR disposition, selected test result and recorded failing tests are separate. Last coordinate record still supplies map color; no retest consolidation is introduced.
- Known failures retain test numbers, complete names, invalid values and earlier failures followed by later PASS. More than three failing tests expand on demand.
- Missing measurements remain unavailable. Missing failure reasons and ignored FTR/MPR coverage are disclosed. An absent parsed failure is never interpreted as a passing die.
- Cell size supports 4–80 px, fractional numeric entry, Apply/Enter, Escape/Discard, Fit to view and Reset. A different run resets size and selection; test switches retain them.
- Pure indexes scan each measurement once per run/test identity; resizing and die selection reuse summaries. Parser, statistics and pass/fail policy are unchanged.

## Passed

- `npm run check:local`: lint with no errors, typecheck, 34 unit tests, production build and rendered HTML test.
- `STDF_TEST_URL=http://127.0.0.1:5175 npm run test:ui`: 15 interaction groups.
- `npm run test:distribution:ui`: 17 groups, including independent numeric expectations, float32 histogram boundaries, population conservation, filters and incomplete input.
- `npm run test:wafer:ui`: 7 groups, including reference style, repeated coordinates, geometry, large coordinate windows and empty maps.
- `npm run test:wafer-inspector:ui`: 13 groups covering conflicting overall/selected results, four failures, long names, missing reasons, repeated measurements and coordinates, invalid values, staged entry and cancellation, min/max hit testing, responsive Fit, run/test switching and workspace clearing.
- Local browser tests use headless Edge on the user's computer and generated in-memory STDF only. Desktop/mobile screenshots are retained in ignored `outputs/round3/wafer-inspector/` and `outputs/round2/wafer/`.

## Observations and limits

- Two existing unused legacy-component lint warnings remain in `app/page.tsx`; no new lint errors. The existing Vinext route-classification notice remains.
- The first broad UI invocation targeted its default port 5173 while preview was on 5175. It failed to connect; rerunning with the correct explicit URL passed all groups.
- FTR/MPR decoding, unknown-result policy and retest identity rules are outside this change. The failure list is decoded measurement evidence, not proof of the cause of a final die disposition.
- Very large coordinate extents retain bounded 160-by-160 windows; Fit at the 4 px minimum may still require local scrolling.
- Company/private STDF was not uploaded, committed, included in screenshots or used for public-site verification. No new private-data correctness claim is made for this UI-only round.
