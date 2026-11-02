# Commercial readiness

## Product positioning for version 0.1.0

Version 0.1.0 is a polished commercial MVP for demonstrations, discovery calls, controlled trials, and engineering validation. It should not yet be sold with an unconditional claim of complete STDF compatibility or production-release accuracy.

## Ready now

- Professional responsive user interface.
- Local opening of common STDF V4 PTR/PRR streams.
- Yield, bins, sites, test time, test search, plots, Cpk, and wafer maps.
- Generic synthetic sample data.
- Local Windows/macOS/Linux commands.
- Docker and Docker Compose deployment.
- Proprietary repository notice and security documentation.
- No application-backend upload of selected STDF files.

## P0 blockers before paid production use

| Priority | Requirement | Acceptance criterion |
|---|---|---|
| P0 | Parser conformance | Golden-corpus comparison passes for every marketed record and tester family |
| P0 | Calculation validation | Yield, bins, limits, Cpk, site, and coordinate results match approved references |
| P0 | Remove demo-only claims | Every insight, trend, export, and button is implemented or clearly labeled demonstration |
| P0 | Pass-bin configuration | Customer/product-specific pass bins replace the `HBIN 1` assumption |
| P0 | Retest policy | Raw, QA, correlation, retest, and rescreen rules are defined and tested |
| P0 | File safety | Worker isolation, size limits, timeouts, corruption handling, and memory guardrails |
| P0 | Release QA | Automated unit, integration, cross-browser, and regression tests |
| P0 | Legal package | Signed software license/EULA, privacy notice, warranty, liability, and support terms reviewed by counsel |

## P1 enterprise requirements

- License key or customer entitlement system.
- Signed builds, checksums, SBOM, dependency scanning, and container scanning.
- Built-in authentication and role-based permissions where required.
- CSV/Excel/PDF exports with versioned calculation metadata.
- Saved projects and optional encrypted on-premises database.
- Audit logs, retention policy, backup, restore, and disaster recovery.
- Branding, configuration, limits, and customer-specific report templates.
- Installer or managed update workflow.
- Support diagnostics that do not collect customer data without consent.

## Suggested commercial packages

| Package | Deployment | Scope |
|---|---|---|
| Evaluation | Customer workstation | Time-limited local pilot with synthetic and approved sample files |
| Engineer | Customer workstation or Docker | Local analysis, named user, defined supported formats |
| Team On-Prem | Customer server | Authentication, shared projects, database, backup, and admin controls |
| Enterprise | Customer-managed environment | SSO, audit, support SLA, validated compatibility matrix, and custom integration |

Do not set pricing only from UI completeness. Price against qualified format coverage, customer risk, deployment/support effort, number of users/sites, and validation obligations.

## Pre-sale checklist

1. Define the exact tester vendors, STDF versions, record types, file sizes, and use cases in scope.
2. Obtain customer-approved non-confidential acceptance files.
3. Demonstrate results against their reference tool.
4. Document exclusions and unsupported records in the quote/SOW.
5. Confirm whether data may leave the workstation or site.
6. Confirm deployment, updates, support hours, response time, backups, and ownership.
7. Execute the commercial license/EULA and privacy/security review.
8. Deliver a versioned release with checksum and change log.
9. Obtain written acceptance against agreed test cases.

## Repository and release policy

- Keep the GitHub repository Private.
- Protect the default branch and require pull-request review when collaborators are added.
- Tag releases using semantic versions such as `v0.1.0`.
- Never commit customer STDF or screenshots containing proprietary identifiers.
- Keep each customer configuration separate from the core product repository.
- Back up releases and commercial agreements outside GitHub according to the business continuity plan.

## Legal note

The included `LICENSE` is a proprietary repository notice, not a complete customer contract. Obtain qualified legal advice for the countries and industries in which the software will be sold.

