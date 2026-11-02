# Security policy

## Supported version

Security fixes are currently provided for the latest version on the default branch. No public support SLA is offered until a customer agreement defines one.

## Data handling

- STDF files are read by browser JavaScript and are not intentionally sent to an application backend.
- Parsed data is held in page memory and is cleared by closing or refreshing the page.
- No telemetry, analytics SDK, crash reporter, or third-party upload integration is included in version 0.1.0.
- `.gitignore` and `.dockerignore` exclude STDF, ATDF, environment files, and common customer-data folders.

## Operator responsibilities

- Deploy only over HTTPS when users access the application across a network.
- Restrict the server to authorized users through a reverse proxy, VPN, or identity-aware gateway.
- Do not place customer STDF files inside the application directory or Docker build context.
- Validate browser caching and workstation disk policies against customer security requirements.
- Keep Node.js, npm dependencies, the base container image, and the host operating system patched.
- Review dependency and container scans before every customer release.

## Current security limitations

- No built-in login, role-based access control, tenant isolation, audit log, or license enforcement.
- No Content Security Policy customized for a standalone commercial deployment.
- No signed release artifact, software bill of materials, or automatic vulnerability-scanning workflow is included yet.
- Large or malicious files can consume browser memory; production hard limits still need to be added.

## Reporting a vulnerability

Do not open a public issue containing customer data or exploit details. Contact the repository owner privately and include:

1. affected version and deployment method;
2. reproduction steps using synthetic data;
3. expected impact;
4. suggested mitigation, if known.

Replace this section with a dedicated security email before the first commercial release.

