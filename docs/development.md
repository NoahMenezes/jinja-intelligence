# Development

## Prerequisites

- Bun >= 1.0
- Node >= 18 (for `node dist/server.js` production runs)

## Setup

```sh
bun install
```

The VS Code extension in `editors/vscode-extension` has its own install:

```sh
cd editors/vscode-extension && bun install
```

## Commands

```sh
bun run dev        # bun src/server.ts --stdio (live server from source)
bun run typecheck  # tsc --noEmit (src + test)
bun run test       # vitest run (includes stdio spawn tests; needs bun on PATH)
bun run build      # tsc -p tsconfig.build.json -> dist/ (src only)
bun run start      # node dist/server.js --stdio (production build)
bun run bench      # bun scripts/bench.ts (best-of-N perf numbers)
node dist/server.js --version  # prints version, exits 0
```

Extension (`editors/vscode-extension`):

```sh
npm run compile  # tsc + copy root dist/server.js into the extension
npm run typecheck
npm run test     # node --test test/*.test.mjs (manifest, language config)
npm run package  # vsce package -> *.vsix
```

## Connecting an editor

Point any LSP client at the server command with stdio transport:

- Built: `node /path/to/jinja-intelligence/dist/server.js --stdio`
- From source: `bun /path/to/jinja-intelligence/src/server.ts --stdio`

Neovim (`nvim-lspconfig` style `cmd`), Zed (custom LSP binary), Helix
`[language-server]` command, or VS Code via a generic LSP client extension
all work — the server is editor-agnostic. Copy-paste configs live in
`docs/installation.md`.

Protocol rule: never write to the server's stdout except `--version`/`--help`.
Logs go to the LSP console and stderr.

## Testing

- Layout mirrors `src/`: `test/lexer/`, `test/parser/`, `test/analysis/`,
  `test/completion/`, `test/hover/`, `test/navigation/` (definition/references/rename),
  `test/symbols/`, `test/signature-help/`, `test/semantic-tokens/`,
  `test/project/`, `test/templates/`, `test/python/`, `test/documents/`,
  `test/lsp/` (capabilities, settings, project-sync, stdio spawn),
  `test/hardening/` (fuzz + large-file), `test/utils/`, `test/types/`.
- Fixtures: `test/fixtures/` — `parser/`, `diagnostics/`, `lexer/`, `hover/`,
  `navigation/`, `analysis/`, `symbols/`, `project/app/` + `project/django/`,
  `python/`. Add a fixture for every new parser/feature case; keep them minimal.
- Focused runs: `bun run test test/hover/` (any subpath works).
- Hardening: every public entry point must stay total on hostile input —
  extend `test/hardening/fuzz.test.ts`, not just the happy path.
- Bench: `bun run bench` backs every performance claim; paste results into
  `docs/performance.md` when behavior changes timing.

## Debugging

- F5: open folder `editors/vscode-extension` in VS Code, press `F5`
  (`Run Extension`, with `preLaunchTask` rebuilding server + extension).
  In the Extension Host window open any `.j2` / `.jinja` / `.jinja2` file.
  See `CONTRIBUTING.md` for the exact sequence.
- Logs: server logs go to stderr and the LSP console (`View > Output >
  Jinja Intelligence` in VS Code; `:LspLog` in Neovim). Request a bug's
  stderr excerpt in the bug-report template.
- Bisect order for wrong intelligence: lexer tokens → parser AST
  (`test/parser/`) → analyzer scopes (`test/analysis/`) → feature output
  (`test/completion|hover|navigation/...`) → `src/lsp/connection.ts` wiring.

## Workflow

1. Inspect repo before changing code.
2. Implement scoped change + tests + fixtures.
3. Run `bun run typecheck && bun run test && bun run build`; fix failures.
4. Review diff; update docs truthfully (`supported-features.md` for any
   user-visible change, `architecture.md` for tradeoffs, `performance.md`
   for timing claims).
5. Commit with `feat:` / `fix:` / `perf:` / `docs:` / `chore:` prefix.

The repo must remain buildable after every change.
