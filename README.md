# STDF Insight

Local-first semiconductor test-data analysis for STDF V4 files.

**Version:** 0.1.0 commercial MVP  
**License:** Proprietary / All rights reserved  
**Default data policy:** Files are parsed in the browser and are not uploaded to an application server.

STDF Insight turns common ATE STDF streams into an engineering workspace with yield summaries, bin Pareto, site balance, parametric plots, capability statistics, wafer maps, and run comparison.

> This repository is a commercial MVP. It is suitable for controlled demos, evaluations, and pilot customers. Read [Commercial readiness](docs/COMMERCIAL_READINESS.md) before making production accuracy, compliance, or full-STDF-compatibility commitments.

## 中文摘要

STDF Insight 是以瀏覽器本機解析為核心的半導體測試資料分析工具。目前支援常見 STDF V4 PTR／PRR 流程，可查看 Yield、Bin、Site、Histogram、Box plot、CDF、Sequence trend、Cpk 與 Wafer map。

此版本沒有將客戶 STDF 上傳至後端，也不會永久保存資料。正式販售前，請先閱讀[商業化準備清單](docs/COMMERCIAL_READINESS.md)與[STDF 支援範圍](docs/STDF_SUPPORT.md)。

## Core features

- Open `.stdf`, `.std`, `.stdf.gz`, and `.std.gz` files.
- Parse common STDF V4 records locally in the browser.
- Show first-pass yield, fail count, hard-bin Pareto, test count, and test time.
- Search tests by test number or test name.
- Filter parametric data by test site.
- Plot histogram, site box plot, sequence trend, and CDF.
- Calculate mean, standard deviation, range, fail rate, and Cpk.
- Display pass/fail and parametric wafer maps.
- Compare files loaded in the current browser session.
- Ship with synthetic demo data only; no customer STDF is committed to Git.

## Quick start

### Windows PowerShell

```powershell
git clone https://github.com/timChang711/stdf-insight.git
cd stdf-insight
npm ci
npm run dev:local
```

Open `http://localhost:5173`.

### macOS / Linux

```bash
git clone https://github.com/timChang711/stdf-insight.git
cd stdf-insight
npm ci
npm run dev:local
```

### Local production mode

```bash
npm ci
npm run build:local
npm run start:local
```

Open `http://localhost:3000`.

### Docker

```bash
docker compose up --build -d
```

Open `http://localhost:3000`. See [Local deployment](docs/LOCAL_DEPLOYMENT.md) for Windows, Linux, LAN, Docker, reverse proxy, upgrade, and troubleshooting instructions.

## Documentation

| Document | Purpose |
|---|---|
| [Local deployment](docs/LOCAL_DEPLOYMENT.md) | Developer, production, Docker, LAN, and reverse-proxy setup |
| [User guide](docs/USER_GUIDE.md) | Uploading data and using every analysis view |
| [STDF support](docs/STDF_SUPPORT.md) | Supported records, calculation rules, and known limitations |
| [Architecture](docs/ARCHITECTURE.md) | Data flow, components, trust boundaries, and extension points |
| [Commercial readiness](docs/COMMERCIAL_READINESS.md) | What is ready, gaps, roadmap, and sale checklist |
| [Security policy](SECURITY.md) | Data handling, safe disclosure, and deployment security |
| [Changelog](CHANGELOG.md) | Version history |

## Commands

| Command | Use |
|---|---|
| `npm run dev:local` | Cross-platform local development server |
| `npm run build:local` | Cross-platform production build |
| `npm run start:local` | Vinext production server; see the documented Windows asset limitation |
| `npm run preview:local` | Preview the existing Cloudflare build on loopback port 5175 |
| `npm run check:local` | Lint, typecheck, synthetic regressions, production build and rendered-HTML check |
| `npm run test:ui` | Local Edge interaction checks against a running loopback server |
| `npm run docker:build` | Build local Docker image |
| `npm run docker:run` | Run Docker image on port 3000 |
| `npm run dev` / `npm run build` | ChatGPT Sites lifecycle scripts; Linux-oriented |

## Browser requirements

- Current Chrome, Edge, Firefox, or Safari.
- Gzip decompression uses the bundled `fflate` asynchronous worker; no STDF bytes are uploaded.
- Memory requirements depend on uncompressed file size and test count. Start pilot validation below 250 MB per file and qualify larger files on the intended customer workstation.

## Data and privacy model

The current parser runs inside the browser. Selecting a file does not send it to this application’s server. Parsed results live in page memory and are removed when the tab is closed or refreshed.

The repository ignores STDF and common customer-data directories. Do not remove those ignore rules. Never commit customer, production, correlation, qualification, or RMA data.

## Commercial status

| Area | Current state |
|---|---|
| Product UI | Working commercial MVP |
| Local STDF parsing | Common STDF V4 PTR/PRR flow |
| Customer-data upload | Not used; browser-local only |
| Persistent projects/database | Not implemented |
| Full STDF record coverage | Not implemented |
| License activation | Not implemented |
| Automated parser conformance suite | Synthetic regressions present; full tester/golden-corpus qualification still required |
| Legal terms/privacy/EULA | Must be finalized with qualified counsel |

## Proprietary license

Copyright © 2026 Tim Chang. All rights reserved.

This source code is proprietary. No right to use, copy, modify, distribute, sublicense, host for third parties, or sell the software is granted without written permission or a signed commercial license agreement. See [LICENSE](LICENSE).

## GitHub source backup (2026-11-02)

This repository contains the STDF Insight website project from the official Sites source repository, matching saved version **v34**, source commit `43fd1b1f896294a99590bcdff718f9d485df7c6e`. The Site's configured live URL is https://stdfinsight.com. This backup does not independently certify which version is currently being served.

Application source, backend routes, Worker code, database schema and migrations, assets, dependency lockfile, build configuration, tests, and documentation are included at the repository root. This is the web project; it does not include a separate desktop application.

The production project identity was removed from `.openai/hosting.json`; the `DB` binding declaration remains for local development. Production environment values, credentials, live database rows, uploaded files, dependency installations, and build outputs are not included. Restoring feedback/analytics requires your own database and `FEEDBACK_RATE_LIMIT_SECRET`; hosted authentication requires its corresponding trusted gateway. Do not commit those secrets.

Only backup metadata, clone instructions, a local filesystem path in a historical report, and the hosting identity differ from the source snapshot. The original source Git history was not imported. No website deployment was performed. Backup validation checks file hashes and repository contents; historical test results in documentation are not new test runs.