# Local verification — 2026-11-02

The website source backed up at `7191cfe` was installed and tested on Windows 11 with Node.js 22.17.1, npm 10.9.2 and headless Microsoft Edge. Verification found and fixed local startup and lint failures. The checked-in fixes accompany this report; this report does not certify the deployed stdfinsight.com version.

## Fixes

- `useMemo` now uses an inline factory, and a JSX apostrophe is escaped, resolving two lint errors.
- `npm start` and `npm run start:local` now serve the built Worker using Wrangler local mode. The previous plain Node/Vinext startup failed on the `cloudflare:workers` import.
- The histogram slider now has a 24 px interaction height, meeting the existing layout regression check.
- Browser tests now use v34 navigation, search roles and raw-data controls. Readiness waits target an available control instead of network-idle, which timed out on this streaming application.
- Added a current workspace smoke suite and `npm run test:ui:all`. Empty PTR-family checks now assert the intended hidden-tab behavior for FTR-only files.

## Results

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Pass; 509 packages installed from the existing lockfile |
| `npm run check:local` | Pass |
| ESLint | Zero errors; five existing warnings remain |
| TypeScript no-emit check | Pass |
| Unit tests | 179 passed, zero failures/skips |
| Production bundle build | Pass |
| Worker-rendered pages and private-route protection | 1 passed |
| `npm run test:ui:all` | Pass; all six suites complete in one run |
| Current workspace browser tests | 10 groups passed |
| Distribution browser tests | 18 groups passed |
| Wafer browser tests | 7 groups passed |
| Die-inspector browser tests | 13 groups passed |
| Record-coverage browser tests | 6 groups passed |
| FTR/MPR/PMR browser tests | 15 groups passed |

The 69 browser groups cover STDF and gzip loading, independently calculated means and distributions, filtering, keyboard navigation, chart switches, CSV export, wafer coordinates and repeated records, die inspection, FTR/MPR/PMR provenance, invalid inputs, cancellation, clear/reload, and responsive layouts down to 390 px. The fixture mean of 2.5 and site-1 mean of 2.0 are checked against known inputs, not against the application's own statistics function. Comparison checks confirm that unidentified lots/wafers are not paired; unit tests separately cover valid coordinate pairing and ambiguous records.

Fixtures and exported CSVs contain generated synthetic data only. Browser suites reported no uncaught runtime errors. Application asset loading was checked. Machine-local logs, screenshots and generated results are retained under ignored `outputs/` directories and are not published.

## Reproduce

```powershell
npm ci
npm run check:local
npm start
```

Open http://localhost:3000. In a second terminal in the same checkout, with Microsoft Edge installed:

```powershell
npm run test:ui:all
```

The browser tests default to loopback port 3000. Set `STDF_TEST_URL` to another loopback URL if needed. They reject non-local test targets. Stop the local server with Ctrl+C.

## Limits

- This verifies browser-local semiconductor analysis, not all possible STDF files, vendor extensions, large production datasets, or certified measurement accuracy.
- Feedback/analytics intentionally return unavailable without the required database and environment configuration. Hosted authentication needs its trusted gateway. No production secrets or live data were copied or tested.
- Docker, macOS/Linux runtime behavior, other browsers and public production deployment were not tested in this local run. Wrangler local mode is a development/preview runtime.
- A Windows process interruption occurred during an aggregate run; its incomplete result was not treated as a pass. The complete aggregate command then passed with a single local server.
- Five non-blocking lint warnings remain (unused legacy bindings/import and a hook-dependency warning). The build also retains the framework's route-classification notice.
- No website deployment or live-site changes were made.
