# Roadmap (20 phases)

- [x] Phase 1 — Bootstrap & Tooling
- [x] Phase 2 — Core Types & Utils
- [x] Phase 3 — Document Engine
- [x] Phase 4 — Jinja Lexer
- [x] Phase 5 — AST + Expression Parser
- [x] Phase 6 — Statement Parser + Recovery
- [x] Phase 7 — LSP Shell & Lifecycle
- [x] Phase 8 — Syntax Diagnostics
- [x] Phase 9 — Scope & Symbol Analysis
- [x] Phase 10 — Completion: Core
- [x] Phase 11 — Completion: Context-Aware
- [x] Phase 12 — Hover & Documentation
- [x] Phase 13 — Template Resolution + Definition
- [x] Phase 14 — References + Rename
- [x] Phase 15 — Symbols + Signature Help + Semantic Tokens
- [x] Phase 16 — Project Intelligence & Indexing
- [x] Phase 17 — Python Awareness: Basic
- [x] Phase 18 — Python Frameworks + Type Intelligence
- [x] Phase 19 — Performance & Hardening
- [x] Phase 20 — Editor Integrations & Release (1.0.0)

Each phase must end with `typecheck + tests + build + docs` green and a
`feat:`/`chore:` commit. The repo stays buildable after every phase.

## Beyond 1.0 (ordered by value)

The open-source readiness review confirmed the contribution surface is
complete (`CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, issue/PR
templates, CI). What to build next, in order:

1. **Cross-file references/rename** — the index already holds the data;
   make `grr`/`grn` span files. Biggest user-visible win remaining.
2. **Formatting** (`textDocument/formatting` for Jinja blocks) —
   highly requested in template tooling, self-contained.
3. **Inlay hints + code actions** — e.g. quick-fix a missing `{% endif %}`;
   small, delightful.
4. **Pyright-optional integration** — exact Python types where our scanner
   reports unknown. External analyzer, never mandatory.
5. **Windows CI job + `workspaceFolders` change handling** — the two known
   platform gaps (see `docs/performance.md`).
6. **Benchmarks in CI** — fail on >2x `bun run bench` regression, plus a
   growing fuzz corpus.
7. **Showcase** — demo GIF in `README.md`, Marketplace/Open VSX listings,
   announcement post. See `docs/maintainers.md` for the full checklist.

Good starter issues for newcomers: hover prose in `src/jinja/docs/`,
parser fixtures, docs gaps — label them `good first issue`.
