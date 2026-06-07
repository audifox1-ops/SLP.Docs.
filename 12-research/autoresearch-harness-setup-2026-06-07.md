# AutoResearch Harness Setup

## Sources

- Veritas-7/autoresearch-skill-system: installed as the Codex `autoresearch` skill and source-backed harness.
- karpathy/autoresearch: retained as the conceptual loop pattern through the installed harness and this repo's existing `karpathy-autoresearch` process.
- promptfoo/promptfoo, EleutherAI/lm-evaluation-harness, confident-ai/deepeval, stanfordnlp/dspy, and openai/evals: detected by the harness as external GitHub candidates for future eval or prompt-optimization inspiration.

## Installation Evidence

- Python 3.12 installed with Homebrew because the requested harness requires Python 3.11+ and system `/usr/bin/python3` was 3.9.6.
- Package installed in `/Users/audifox/.codex/venvs/autoresearch-skill-system`.
- Source cloned to `/Users/audifox/.codex/src/autoresearch-skill-system`.
- Codex skill linked at `/Users/audifox/.codex/skills/autoresearch`.
- Skill validation passed with 3657/3657 checks.
- Project-local marker `skill/autoresearch/SKILL.md` records the installed `v8.863` banner for the harness working-state freshness check; it is not the executable skill installation.

## Project Adaptation

- Runtime archive output is routed to `.autoresearch/archives/` and ignored by git.
- Reader-facing generated ledgers are ignored under `12-research/AutoResearch_External_Research_Ledger_*/`.
- Stable project policy lives in `AUTORESEARCH.md`.
- Stable command/config contract lives in `.autoresearch/config.json`.
- Version freshness marker lives in `skill/autoresearch/SKILL.md`.
- Cycle decisions remain in `.autoresearch/experiments.jsonl` and `working.md`.

## Bounded Standard Run

The first network-enabled standard archive run created:

`.autoresearch/archives/AutoResearch_Source_Repo_Evolution_2026-06-07_235512_108909_pid86030_5250b9a1`

Notable results:
- GitHub source safety: PASS after installing `gh` and `gitleaks`.
- Safe candidates: 5.
- Sandbox-download candidates: 5.
- Sandbox-use candidates: 5.
- Top-source smoke: PASS with 5/5 metadata/local fixture checks.
- Candidate A/B: PASS for archive-only skill validation.
- Remaining archive validation gap before this repo update: `working.md` did not include the installed skill banner/version, so run worklog freshness failed closed.

## Next Candidate

The next source-improvement cycle should target a small user-visible workflow improvement, not the harness itself. Current backlog fit:

- Monthly close checklist: strongest fit for SLP.Docs because it converts scattered student info, payment records, monthly journal status, guardian message, and submission readiness into one scan-friendly work queue.
- Safer payment import history: useful after xlsx risk mitigation, but it touches data rollback behavior and should get a narrower A/B plan.
- Command palette: useful for repeated operator actions, but less directly tied to monthly close correctness.
