# Autoresearch Policy

Objective: run bounded Karpathy-style improvement cycles for this SLP.Docs repository, adopting only changes that beat the current baseline without regressing required gates.

## Scope

- Target: `/Users/audifox/Downloads/SLP.Docs.-main`
- Stack: React, Vite, TypeScript, Express, Firebase
- Do not modify secrets, production credentials, billing settings, or destructive data paths.
- Preserve existing user work and avoid unrelated refactors.

## Required Gates

- `npm run lint`
- `npm run build`

## Optional Gates

- `npm audit --omit=dev --audit-level=moderate`

This security gate is currently advisory because `xlsx@0.18.5` reports high-severity advisories with no npm audit fix available.

## Metrics

- Largest emitted JavaScript chunk size from `npm run build`.
- Count of build chunk-size warnings.
- Count and severity of `npm audit` findings.

## Commit And Push

Do not commit or push automatically unless the user explicitly asks for it in this repository. When committing is authorized, include only adopted cycle files and include the metric evidence in the commit message.
