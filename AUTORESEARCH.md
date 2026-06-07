# Autoresearch Policy

Objective: run bounded Karpathy-style improvement cycles for this SLP.Docs repository, adopting only changes that beat the current baseline without regressing required gates.

Installed skill: `autoresearch`, from `https://github.com/Veritas-7/autoresearch-skill-system` at source commit `ec2907754c905cf5f94644905e946ffe604d2630`.

Runtime:
- Source repo: `/Users/audifox/.codex/src/autoresearch-skill-system`
- Codex skill link: `/Users/audifox/.codex/skills/autoresearch`
- Project skill marker: `skill/autoresearch/SKILL.md`
- Python: `/Users/audifox/.codex/venvs/autoresearch-skill-system/bin/python`
- Harness command: `/Users/audifox/.codex/venvs/autoresearch-skill-system/bin/autoresearch-evolve`

## Scope

- Target: `/Users/audifox/Downloads/SLP.Docs.-main`
- Stack: React, Vite, TypeScript, Express, Firebase
- Do not modify secrets, production credentials, billing settings, or destructive data paths.
- Preserve existing user work and avoid unrelated refactors.
- Treat external GitHub repositories as hypothesis sources only until sandbox safety, same-sample A/B, and local project gates pass.

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
- Source-specific UX or workflow metric recorded before each implementation cycle.
- Count of GitHub candidates that pass metadata, license, secret-scan, sandbox-download, and sandbox-use gates.

## Commit And Push

The user explicitly authorized commit/push for this continuous improvement setup on 2026-06-07. When committing is authorized, include only adopted cycle files and include the metric evidence in the commit message. Do not commit generated archive directories, lock files, secrets, credentials, or rejected candidates.

## Continuous Mode

- Work in bounded, inspectable cycles even when the user asks for "infinite" improvement.
- Use `--forever` only with a stop file and durable status surfaces; never run invisible unbounded background work in this chat.
- Before adopting a candidate, record baseline, candidate, metric, guards, result, and rollback path in `working.md` and `.autoresearch/experiments.jsonl`.
- Stop or pause when the user says to stop, when a required gate fails, when target ownership is ambiguous, or when a candidate needs risky external code execution.
- Archive roots under `.autoresearch/archives/` and generated reader ledgers under `12-research/AutoResearch_External_Research_Ledger_*/` are runtime evidence and intentionally ignored by git.
- `skill/autoresearch/SKILL.md` is a project-local version marker so the Veritas harness can read `v8.863` from this repo root; the executable Codex skill remains installed under `/Users/audifox/.codex/skills/autoresearch`.

## Installed Harness Verification

- `validate_autoresearch_skill.py --skill-root /Users/audifox/.codex/src/autoresearch-skill-system/skill/autoresearch --json`: passed, 3657/3657 checks.
- `autoresearch-evolve --repo-root /Users/audifox/Downloads/SLP.Docs.-main --research-root .autoresearch/archives --reader-research-root 12-research --forever --max-iterations 1 --no-install-sync --depth standard`: archive created; GitHub safety and top-source smoke passed after installing `gh` and `gitleaks`; final archive validation remained blocked only by pre-existing `working.md` banner/worklog freshness, which this setup records.
