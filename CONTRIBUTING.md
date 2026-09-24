# Contributing

## Setup

```sh
bun install
bun run typecheck
bun run test
bun run build
```

Requires Bun 1.x and Node 18+. The VS Code extension lives in
`editors/vscode-extension` with its own install (`bun install` there).

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
