# Saito repository guidance

## Scope and navigation

This file contains shared guidance for the `saito-all` repository. Paths below
are relative to this directory.

- [node/AGENTS.md](node/AGENTS.md): Node application framework, modules, browser
  interfaces, and JavaScript/TypeScript development.
- [rust/](rust/): Rust workspace, core implementation, and JS/WASM integration.
  Begin with [rust/README.md](rust/README.md) and the relevant crate's documentation.
- [e2e/README.md](e2e/README.md): repository-level end-to-end testing.
- [README/coding/](README/coding/): detailed framework and application development
  guidance.
- [README/consensus/](README/consensus/): consensus design and analysis.

Before working in a component, read its `AGENTS.md` if present, plus any deeper
`AGENTS.md` files governing the files you will change. For work spanning
components, read the guidance for each affected component. More specific
instructions refine this shared guidance within their directory scope.

## Using the documentation

- Use the component's reading guide to select documentation relevant to the
  task. Inspect headings, read applicable sections and prerequisites, and expand
  reading when the work crosses architectural boundaries.
- Prefer individual topic documents for focused reading.
  [SAITO-FRAMEWORK.md](README/coding/SAITO-FRAMEWORK.md) is a large combined
  document with substantial overlap; do not load it in full for every task or
  read duplicate copies of the same material.
- Treat documented architectural practices as guidance for intended design.
  Inspect current code, configuration, and tests to establish actual behavior
  and available APIs. Existing code is not automatically a recommended pattern.
- Some documents are explicitly unfinished. Do not treat their planned scope
  as implemented behavior or invent requirements to fill the gaps.
- If sources disagree materially, identify the discrepancy and resolve it from
  the relevant implementation, tests, and task requirements. Ask for clarification
  when an unresolved design choice would change the requested outcome.
- When changing documented behavior, update the affected topic documentation.
  Check overlapping references for contradictions; do not silently assume the
  combined framework document and individual chapters are synchronized.

For consensus changes or analysis, read the relevant sections of
[SAITO-CONSENSUS.md](README/consensus/SAITO-CONSENSUS.md) and
[SAITO-CONSENSUS-MECHANISM-DESCRIPTION.md](README/consensus/SAITO-CONSENSUS-MECHANISM-DESCRIPTION.md).

## Working practices

- Keep changes focused on the requested outcome and preserve unrelated local
  changes and untracked files.
- Use the affected component's commands and working directory. Inspect scripts
  before running unfamiliar setup, reset, deployment, or migration commands.
- Run checks appropriate to the change. Documentation-only edits normally need
  link and content checks; code changes need relevant tests and build checks.
- Report what changed, what was verified, and any unresolved limitations.
