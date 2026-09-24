# Contributing

Everyone is welcome here. By participating you agree to our
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through
[SECURITY.md](SECURITY.md), never public issues.

## Setup

```sh
bun install
bun run typecheck
bun run test
bun run build
```

Requires Bun 1.x and Node 18+ (`.nvmrc` pins Node 22). The VS Code extension lives in
`editors/vscode-extension` with its own install (`bun install` there) and
commands (`typecheck`, `test`, `compile`, `package`).

Useful focused commands:

```sh
bun run test test/hover/        # one area only
bun run bench                   # performance numbers (see docs/performance.md)
```

## Before you code

- **Bugs:** use the bug-report template — minimal template, expected vs
  actual, client, and version (`node dist/server.js --version`).
- **Features:** open a feature request first for anything beyond a small
  fix, so scope (single-file vs cross-file, which editors) is agreed
  before implementation.
- **Good first issues:** look for the `good first issue` label — docs
  tables (`src/jinja/docs/`), fixtures, and hover prose are friendly
  starting points that still ship real value.

## Development rules

1. **One concern per change.** Small modules, explicit types, strict
   TypeScript (`strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`). No `any` unless genuinely necessary.
2. **Layering is law.** The parser never imports LSP; LSP handlers contain
   no parser logic; features consume shared analysis/index data. New
   `vscode-languageserver` runtime imports belong in `src/lsp/` only
   (type-only imports elsewhere).
3. **Never crash on user input.** Every public entry point is total:
   malformed templates, hostile offsets, and broken configs degrade to
   empty results or log lines — covered by `test/hardening/fuzz.test.ts`.
4. **No fiction.** Unknown names return `null`/empty with documented gaps;
   hover and completion never invent types, files, or signatures.
5. **Measure before optimizing.** `bun run bench` backs performance claims;
   results live in `docs/performance.md`. No caches without numbers.
6. **Docs stay truthful.** `docs/supported-features.md` lists only what
   exists; `docs/architecture.md` records deliberate tradeoffs with reasons.

## Pull requests

- `bun run typecheck && bun run test && bun run build` green before review.
- Tests for every behavior change; fixtures for every parser/feature case.
- Update `docs/supported-features.md` when user-visible behavior changes.
- Keep commits scoped (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`).
- No contributor license agreement needed — contributions land under the
  repo's MIT license.

## Release process (maintainers)

`docs/installation.md` has the checklist: verify, changelog, versions,
commit, tag, push, then the Publish workflow with registry tokens.
