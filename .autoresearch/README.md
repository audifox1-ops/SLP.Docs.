# AutoResearch Runtime

This directory stores the project-local AutoResearch state for SLP.Docs.

Tracked:
- `config.json`: stable harness configuration for this repo.
- `experiments.jsonl`: append-only cycle decisions and metrics.

Ignored:
- `archives/`: generated evidence archives from `autoresearch-evolve`.
- `lock/`: local single-writer lock files.
- `tmp/`: scratch files for disposable experiments.

Use bounded runs by default. External GitHub repositories may inform hypotheses,
but they are not cloned, installed, imported, or executed in this project unless
the sandbox and A/B gates in `AUTORESEARCH.md` pass first.
