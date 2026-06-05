# Dependency Security Research

Date: 2026-06-06

## Sources

- npm audit output in this repository.
- npm registry: `npm view xlsx version` reports `0.18.5` as the latest npm release.
- GitHub Advisory `GHSA-4r6h-8v6p-xvw6`: SheetJS prototype pollution.
- GitHub Advisory `GHSA-5pgg-2g8v-p4x9`: SheetJS ReDoS.
- GitHub Advisory `GHSA-qx2v-qp2m-jg93`: PostCSS stringify XSS.
- GitHub Advisory `GHSA-q8mj-m7cp-5q26`: qs stringify DoS.

## Observed Pattern

- `npm audit fix` can update `protobufjs`, `@protobufjs/*`, `postcss`, `qs`, `ws`, `express`, and related transitive packages without changing `package.json`.
- The remaining audit finding is `xlsx@0.18.5`. GitHub advisories list patched SheetJS versions, but also state that no patched version is available from the npm `xlsx` package.
- This app reads user-provided CSV/XLS/XLSX payment files, so the SheetJS advisories are relevant to the upload path.

## Local Implication

Adopt the safe lockfile updates immediately. Keep the `xlsx` replacement as a larger future migration because the current app supports legacy `.xls` files. Add local upload constraints now: maximum file size, maximum rows, maximum columns, and filtering of dangerous field names such as `__proto__`, `constructor`, and `prototype`.

Confidence: medium. The constraints reduce exposure and local prototype-pollution risk in mapped records, but they do not remove the vulnerable `xlsx` package. Full remediation requires replacing SheetJS npm `xlsx` or sourcing a maintained patched distribution under an explicit policy decision.
