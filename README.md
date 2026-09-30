# Jinja Intelligence

[![CI](https://github.com/NoahMenezes/jinja-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/NoahMenezes/jinja-intelligence/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/jinja-intelligence)](https://www.npmjs.com/package/jinja-intelligence)

A modern, Python-aware, project-aware Language Server for Jinja templates.

> **Status: 1.0.0 released.** See [`docs/installation.md`](docs/installation.md) to install.

The LSP server is the core product. It is editor-agnostic and communicates over
standard LSP (stdio), so VS Code, Neovim, Zed, Helix, VSCodium and other
LSP-compatible editors can use the same server.

## Quick example

```jinja
{% if user %}
Hello, {{ user | title }}
{% endif %}
{% macro greet(name) %}Hi {{ name }}{% endmacro %}
{{ greet("Sam") }}
```

With the server running you get squiggles, completions, hovers,
go-to-definition, rename, symbols, signature help, and Python context for
this exact pattern. See [Features](#features) for what to try.

## Features

Truthful 1.0.0 surface. Details and diagnostic codes live in
[`docs/supported-features.md`](docs/supported-features.md).

- **Syntax diagnostics (live, versioned, `source: jinja-intelligence`).**
  `missing-end-tag`, `mismatched-end-tag`, `unterminated-variable` /
  `unterminated-block` / `unterminated-comment` / `unterminated-string` /
  `unterminated-expression`, `expected-expression` / `expected-property` /
  `expected-close`, `expected-statement` / `expected-block-name`.
  Published on open/change, cleared on fix/close.
  Try: delete `{% endif %}` → `missing-end-tag`; type `{{ user | }}` →
  `expected-expression`. Unknown tags (e.g. `{% fro x %}`) intentionally
  produce no diagnostics.
- **Context-aware completion (`Ctrl+Space`).**
  Statement openers after `{%` (`if/for/block/macro/...`), filters after `|`
  (`title/upper/default/...`), tests after `is`, scope variables, builtins,
  `loop.*` properties, file-context names, template-file names in strings,
  and Flask/Django context variables with provenance.
  Try: `{%` → openers, `{{ user |` → filters, `{{ x is` → tests,
  `{% extends "` → template names.
- **Hover documentation.**
  Filters, tests, keywords, symbols, macro signatures, builtins, and `loop`
  attributes. Typed `x.attr` and template references return nothing yet.
  Try: hover `title`, `if`, `macro`, `greet`, `user`.
- **Go-to-definition (`F12` / `Ctrl+Click`).**
  Template strings → files, local names → definitions, imported macros
  (incl. `alias.attr` segments and `from ... import` bindings) → the macro
  in the target file. Block chains and Python references need later phases.
  Try: `Ctrl+Click` `greet` in `{{ greet("Sam") }}` → jumps to
  `{% macro greet %}`.
- **References (`Shift+F12`) and rename (`F2`), single-file.**
  Identity-based find-all-uses with `includeDeclaration`; validated,
  token-precise rename, refused on keywords/segments/strings/externals/
  invalid names. Cross-file rename is deferred.
  Try: `F2` on `greet` or `name`.
- **Document symbols (`Ctrl+Shift+O`), workspace search (`Ctrl+T`),
  signature help, semantic tokens.**
  Macros (with nested params), blocks, imports, variables; current-file
  workspace search plus index-wide template symbols; signature help for
  macro calls and filters; delta-encoded semantic tokens for highlighting.
  Try: `{{ greet("` → `(name)` signature.
- **Project indexing.**
  Async workspace scan (skip dirs, `MAX_INDEX_FILES = 2000` cap,
  `.html` marker-gated), macro/block/inheritance index,
  open-documents-shadow-disk, debounced external updates.
  Powers template-name completion in strings and index-wide symbols.
  Always searched: referring-file dir, workspace roots, `<root>/templates/`,
  plus `templateDirectories`.
- **Python awareness (Flask + Django, same-file types).**
  Flask `render_template("x.j2", user=...)` and Django `render` /
  `render_to_response` context; `dataclass` / `TypedDict` / Pydantic /
  plain-class attribute extraction with same-file function-return
  resolution; typed `{{ x. }}` completion and `name: Type` hovers.
  No dataflow engine, no imports-chasing; external analyzers optional.
  Try: add `render_template("hello.j2", user="sam")` → `{{ user. }}`
  completes, hover names the route file.
- **Production hardening.**
  Measured budgets in [`docs/performance.md`](docs/performance.md)
  (cold startup < 500 ms, keystroke features < 16 ms on realistic files,
  full scan < 5 s for 2000 files, index < 50 MiB).
  Quadratic parser fix, cycle-safe bounded scans, debounced updates with
  pruning, fuzz coverage over every entry point. Broken templates produce
  partial results, never crash the server.

### Explicitly not in 1.0.0

Cross-file references/rename, formatting, inlay hints, code actions
(e.g. auto-add `{% endif %}`), Pyright-optional integration, Windows
polish, `workspaceFolders` change handling (restart needed). See
[`docs/roadmap.md`](docs/roadmap.md) for ordered next work.

## Install

One `npm publish` covers every manager — they all pull the same
`jinja-intelligence` package from the npm registry (Node 18+).

```sh
npm install -g jinja-intelligence   # npm
bun add -g jinja-intelligence       # bun
pnpm add -g jinja-intelligence      # pnpm
yarn global add jinja-intelligence  # yarn classic
# without installing:
npx jinja-intelligence --stdio | bunx jinja-intelligence --stdio | pnpm dlx jinja-intelligence --stdio | yarn dlx jinja-intelligence --stdio
# no manager at all:
curl -fsSL https://raw.githubusercontent.com/NoahMenezes/jinja-intelligence/main/scripts/install.sh | sh
```

Full matrix for every editor: [`docs/installation.md`](docs/installation.md).

- **VS Code:** install **Jinja Intelligence** from Marketplace / Open VSX.
  Bundles the server; `.j2/.jinja/.jinja2` recognized automatically.
- **Neovim (built-in LSP, no plugins), Zed, Helix, VSCodium:** point any
  LSP client at `node /path/to/jinja-intelligence/dist/server.js --stdio`.
  Copy-paste configs are in `docs/installation.md`.
- Verify: `jinja-intelligence --version`, then open a Jinja file with a
  missing `{% endif %}` (expect `missing-end-tag`), type `{{ user |`
  (expect filter completions), hover a filter (expect docs).

## Configuration

Settings key: `jinjaIntelligence`. Unknown keys ignored; invalid values fall
back to defaults. No config files read. Full reference:
[`docs/configuration.md`](docs/configuration.md).

| Setting | Default | Meaning |
|---|---|---|
| `templateExtensions` | `[".jinja", ".jinja2", ".j2"]` | Scanned template files (`.html` additionally marker-gated) |
| `templateDirectories` | `[]` | Extra lookup dirs, absolute or workspace-relative; extends go-to-definition + index |
| `maxLogLines` | `500` | Maximum retained log lines |

## Project layout

```
my-app/
  app.py / pyproject.toml / requirements.txt
  templates/
    base.html.j2
    index.j2
```

Root detection uses `.git`, `requirements.txt`, `pyproject.toml`, `app.py`.
`<root>/templates/` is always indexed.

## Tech stack

- Runtime / package manager: Bun
- Language: TypeScript (strict)
- Protocol: `vscode-languageserver`, `vscode-languageserver-textdocument`, `vscode-uri`
- Testing: Vitest
- Build: TypeScript compiler

## Development

```sh
bun install
bun run typecheck
bun run test
bun run build
```

F5 debugging: open `editors/vscode-extension` in VS Code and press `F5`
(`Run Extension`). From the repo root first run `bun run build`, then
`npm run compile` in `editors/vscode-extension` so `dist/server.js` is
bundled. See `docs/development.md` for details.

Useful:

```sh
bun run dev        # bun src/server.ts --stdio (live server from source)
bun run start      # node dist/server.js --stdio (production build)
bun run bench      # performance numbers (see docs/performance.md)
bun run test test/hover/  # one area only
```

Workflow per change: inspect repo, implement, run
`typecheck + test + build`, review diff, update docs truthfully.
Commit prefixes: `feat:` / `fix:` / `perf:` / `docs:` / `chore:`.

## Docs

- `docs/architecture.md`
- `docs/development.md`
- `docs/configuration.md`
- `docs/supported-features.md`
- `docs/roadmap.md`
- `docs/maintainers.md`
- `docs/performance.md`
- `docs/installation.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`

## License

MIT — see `LICENSE`.

## Contributing

Issues and pull requests are welcome — start with [`CONTRIBUTING.md`](CONTRIBUTING.md)
and our [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Report security problems
privately per [`SECURITY.md`](SECURITY.md).

Good first issues are labeled `good first issue` — hover prose in
`src/jinja/docs/`, parser fixtures, and docs gaps.
