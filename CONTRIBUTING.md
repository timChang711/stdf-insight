# Internal contribution guide

This is a private proprietary product repository.

## Workflow

1. Create a feature branch from the latest `main`.
2. Do not add customer STDF, production identifiers, screenshots, credentials, or license keys.
3. Keep parsing, normalization, calculations, and presentation changes logically separated.
4. Add or update tests for every parser and calculation change.
5. Run `npm ci` and `npm run check:local`.
6. Update `CHANGELOG.md` for customer-visible behavior.
7. Open a pull request and document the validation files using non-confidential identifiers only.

## Commit guidance

Use concise imperative messages, for example:

```text
Add MPR decoding for multi-result tests
Fix big-endian PTR limit parsing
Document rescreen consolidation policy
```

## STDF validation

Parser changes must include synthetic fixtures or approved test data that can legally be stored in the repository. Expected fields and calculation outputs must be asserted independently from the implementation.

## Release changes

Do not describe a record type, tester, file size, export, or algorithm as supported until it has passed the documented acceptance matrix.

