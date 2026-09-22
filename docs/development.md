# Development

## Prerequisites

- Bun >= 1.0
- Node >= 18 (for `node dist/server.js` production runs)

## Setup

```sh
bun install
```

## Commands

```sh
bun run dev        # bun src/server.ts --stdio (live server from source)
bun run typecheck  # tsc --noEmit (src + test)
bun run test       # vitest run (includes stdio spawn tests; needs bun on PATH)
bun run build      # tsc -p tsconfig.build.json -> dist/ (src only)
bun run start      # node dist/server.js --stdio (production build)
node dist/server.js --version  # prints version, exits 0
```

## Connecting an editor (Phase 7+)

Point any LSP client at the server command with stdio transport:

- Built: `node /path/to/jinja-intelligence/dist/server.js --stdio`
- From source: `bun /path/to/jinja-intelligence/src/server.ts --stdio`

Neovim (`nvim-lspconfig` style `cmd`), Zed (custom LSP binary), Helix
`[language-server]` command, or VS Code via a generic LSP client extension
all work — the server is editor-agnostic. Only `initialize`, document sync,
and `shutdown`/`exit` are implemented so far; intelligence arrives later.

Protocol rule: never write to the server's stdout except `--version`/`--help`.
Logs go to the LSP console and stderr.

## Workflow per phase

1. Inspect repo before changing code.
2. Implement only the requested phase.
3. Run `typecheck`, `tests`, `build`; fix failures.
4. Review diff; update docs truthfully.
5. Commit with `feat:` / `chore:` / `perf:` prefix.

The repo must remain buildable after every phase.
