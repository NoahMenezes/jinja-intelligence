# Jinja Intelligence

[![CI](https://github.com/NoahMenezes/jinja-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/NoahMenezes/jinja-intelligence/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/jinja-intelligence)](https://www.npmjs.com/package/jinja-intelligence)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A modern, Python-aware, project-aware Language Server for Jinja templates.

> **Status: 1.0.0 released.** Built over 20 phases. See [`CHANGELOG.md`](CHANGELOG.md).

The LSP server is the core product. It is editor-agnostic and communicates over
standard LSP (stdio), so VS Code, Neovim, Zed, Helix, VSCodium and other
LSP-compatible editors use the same server (`dist/server.js`).

---

## Table of contents

- [Why](#why)
- [Features](#features)
- [Quick start](#quick-start)
- [Install per editor](#install-per-editor)
- [Usage guide](#usage-guide)
- [Python awareness setup](#python-awareness-setup)
- [Configuration](#configuration)
- [CLI reference](#cli-reference)
- [Project structure / architecture](#project-structure--architecture)
- [Development setup](#development-setup)
- [Testing / typecheck / bench](#testing--typecheck--bench)
- [Performance](#performance)
- [Limitations & roadmap](#limitations--roadmap)
- [Docs index](#docs-index)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why

Jinja templates in Flask/Django projects get no real intelligence from generic
HTML tooling: no diagnostics for missing `{% endif %}`, no completion for
filters/tests/scope vars, no go-to-definition for `{% extends %}` /
`{% include %}` / macros, and no knowledge of what Python `render_template` /
`render` actually passes in.

This project fixes that with a strict-TypeScript LSP server that parses Jinja
(error-tolerant, never crashes), analyzes scopes, indexes the whole workspace
(templates + Python route context + types), and serves diagnostics, completion,
hover, definition, references, rename, symbols, signature help, and semantic
tokens.

## Features

Everything below ships in 1.0.0. Truthful list — see
[`docs/supported-features.md`](docs/supported-features.md).

| Area | What you get |
| ---- | ------------ |
| **Diagnostics (live)** | Unclosed `{{ }}`, `{% %}`, `{# #}`, strings, expressions; `missing-end-tag` (e.g. no `{% endif %}`); `mismatched-end-tag`; `expected-expression` / `expected-property` / `expected-close` / `expected-statement` / `expected-block-name`. Published on open/change, cleared on fix/close, `source: jinja-intelligence`. Unknown tags (e.g. `{% fro %}`) intentionally silent. |
| **Completion** | `{%` → statement openers (`if`, `for`, `block`, `macro`, …); `\|` → filters; `is` → tests; scope vars, builtins, `loop.*` props, Python context vars with provenance, template-file names inside `extends`/`include`/`import` strings, typed `{{ x. }}` attrs. |
| **Hover** | Filters, tests, keywords, local symbols, macro signatures, builtins, `loop` attrs, `name: Type` for typed context vars, route-file provenance. |
| **Go to definition** | `"base.html"` → file; local names → definition; `import` / `from … import` macros incl. `alias.attr` → macro in target file. |
| **References / rename** | Single-file, identity-based find-all-uses with `includeDeclaration`; token-precise rename, refused on keywords/segments/strings/externals/invalid names. |
| **Symbols / signature / tokens** | Document symbols (macros + params, blocks, imports, vars); workspace symbols (current file pre-index, full index post-scan); signature help for macro calls + filters; delta-encoded semantic tokens. |
| **Project index** | Async workspace scan (skip dirs, 2000-file cap, `.html` marker-gated), macro/block/inheritance index, open-documents-shadow-disk, debounced external updates, `templateDirectories` + `templateExtensions` aware. |
| **Python awareness** | Flask `render_template("x.html", foo=…)` + Django `render` / `render_to_response`; dataclass / TypedDict / Pydantic / plain-class attr extraction; same-file function-return resolution. No import-chasing, no dataflow engine (deliberate). |
| **Hardening** | No full-workspace scan per keystroke; cycle-safe bounded scans; every entry point total (fuzz-tested); quadratic parser fix (44× speedup). |

## Quick start

Requirements: Node.js 18+ (`.nvmrc` pins 22). Bun 1.x for development.

```sh
npm install -g jinja-intelligence
jinja-intelligence --version   # should print 1.0.0
jinja-intelligence --stdio     # LSP over stdio (editors call this)
# or without installing:
npx jinja-intelligence --stdio
```

Verify in any Jinja file (`.j2`, `.jinja`, `.jinja2`):

1. Type `{% if user %}` with no `{% endif %}` → expect `missing-end-tag`.
2. Type `{{ user |` → expect `upper`, `default`, ….
3. Hover a filter → expect signature + docs.

## Install per editor

Full details: [`docs/installation.md`](docs/installation.md).

### VS Code (easiest)

Install **Jinja Intelligence** from the
[VS Code Marketplace](https://marketplace.visualstudio.com/) or
[Open VSX](https://open-vsx.org/). The extension (`editors/vscode-extension`,
`jinja-intelligence-vscode`) bundles the server — no further setup.
`.j2` / `.jinja` / `.jinja2` are recognized automatically.

Manual build:

```sh
cd editors/vscode-extension
bun install
bun run compile   # tsc + copy-server.mjs bundles dist/server.js
bun run package   # vsce package → .vsix
```

### Neovim (built-in LSP, no plugins)

```lua
vim.filetype.add({ extension = { j2 = "jinja", jinja = "jinja", jinja2 = "jinja" } })
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "jinja", "htmldjango" },
  callback = function()
    vim.lsp.start({
      name = "jinja-intelligence",
      cmd = { "node", "/path/to/jinja-intelligence/dist/server.js", "--stdio" },
      root_dir = vim.fs.root(0, { ".git", "requirements.txt", "pyproject.toml", "app.py" })
        or vim.fn.getcwd(),
    })
  end,
})
```

Replace the path with `npm root -g` + `/jinja-intelligence/dist/server.js`.
Plain `.html` attaches only when Jinja syntax is detected.

### Zed

```json
{
  "lsp": {
    "jinja-intelligence": {
      "binary": { "path": "/path/to/jinja-intelligence/dist/server.js", "args": ["--stdio"] }
    }
  }
}
```

### Helix (`~/.config/helix/languages.toml`)

```toml
[[language]]
name = "jinja"
language-servers = ["jinja-intelligence"]

[language-server.jinja-intelligence]
command = "node"
args = ["/path/to/jinja-intelligence/dist/server.js", "--stdio"]
```

### VSCodium / generic LSP client

Point any LSP client at `node /path/to/dist/server.js --stdio` or
`bun /path/to/src/server.ts --stdio` (from source). Transport is stdio only.

## Usage guide

### Daily workflow

- **Diagnostics:** just type. Broken templates produce partial results, never
  a crash. Fix the squiggle → diagnostics clear. Close the file → cleared.
- **Completion:** `{%` (statements), `{{ x |` (filters), `{{ x is` (tests),
  `{{ loop.` (`index`, `first`, …), `{{` (scope + Python context + builtins),
  `"…"` inside `extends`/`include`/`import`/`from` (template names).
- **Hover:** over any filter/test/keyword/var/macro/`loop` attr.
- **Definition:** `gd` on `"layout.html"` jumps to file; on a var/macro jumps
  to its definition, including cross-file imported macros.
- **References / rename:** `grr` / `grn` (single file in 1.0.0). Rename
  validates the new name and refuses unsafe edits.
- **Symbols:** `@` (document: macros, blocks, imports, vars), `#`
  (workspace: index-wide after scan).
- **Signature help:** inside `{{ my_macro(` or `{{ x | filter(`.
- **Semantic tokens:** automatic highlighting where the client supports it.

### Example templates

```jinja
{# base.html #}
{% block content %}{% endblock %}

{# page.j2 — try breaking the endif to see diagnostics #}
{% extends "base.html" %}
{% block content %}
  {% for user in users %}
    {{ loop.index }}: {{ user.name | upper }}
    {% if user is defined %}✓{% endif %}
  {% endfor %}
{% endblock %}

{% macro btn(label, kind="primary") %}<button class="{{ kind }}">{{ label }}</button>{% endmacro %}
{{ btn("Save") }}
```

Go-to-definition on `"base.html"`, completion after `|`, hover on `upper`,
signature help inside `btn(` all work out of the box.

## Python awareness setup

No config needed — open a Flask/Django workspace and the server finds route
calls automatically. Template context completes with provenance; hover names
the route file.

Flask:

```python
# app.py
from flask import render_template

@app.route("/")
def index():
    return render_template("page.j2", users=[...], title="Hi")
```

```jinja
{{ users }}   {# completes, hover shows source: app.py #}
{{ title }}
```

Django:

```python
from django.shortcuts import render
def index(request):
    return render(request, "page.j2", {"users": [...], "title": "Hi"})
```

Typed attrs (dataclass / TypedDict / Pydantic / plain class, same-file
function returns resolved):

```python
from dataclasses import dataclass

@dataclass
class User:
    name: str
    email: str

def view():
    return render_template("page.j2", user=User(name="a", email="b"))
```

```jinja
{{ user. }}   {# completes name, email with types; hover shows name: str #}
```

Limitations (1.0.0): same-file type resolution only, no import-chasing, no
dataflow engine. External analyzers (e.g. Pyright) are a possible future
opt-in, never mandatory.

## Configuration

Settings key: `jinjaIntelligence`. Set via `initializationOptions` or
`workspace/configuration`. Unknown keys ignored; invalid values fall back.
No config files read. See [`docs/configuration.md`](docs/configuration.md).

```jsonc
{
  "jinjaIntelligence": {
    "maxLogLines": 500,                                // log buffer size
    "templateExtensions": [".jinja", ".jinja2", ".j2"], // scanned exts (.html marker-gated)
    "templateDirectories": []                          // extra lookup dirs, absolute or workspace-relative
  }
}
```

Lookup order for `extends`/`include`: referring file's dir → workspace roots →
`<root>/templates/` → `templateDirectories`. The index respects the same
roots + `templateExtensions`.

VS Code: settings UI exposes the three keys directly
(`editors/vscode-extension/package.json` → `contributes.configuration`).

## CLI reference

Binary: `jinja-intelligence` → `dist/server.js` (`package.json:bin`).

```sh
jinja-intelligence --stdio     # run LSP server (stdout is protocol-owned)
jinja-intelligence --version   # print 1.0.0, exit 0
jinja-intelligence --help      # usage, exit 0
node dist/server.js --stdio    # same, explicit
bun src/server.ts --stdio      # from source (dev)
```

Protocol rule: never write to stdout except `--version`/`--help`. Logs go to
LSP console + stderr. Exit codes follow LSP (`shutdown`/`exit` semantics in
`src/lsp/lifecycle.ts`).

## Project structure / architecture

See [`docs/architecture.md`](docs/architecture.md).

```text
VS Code / Neovim / Zed / Helix / VSCodium
                |
           LSP (stdio)
                |
  Jinja Intelligence LSP Server (src/)
                |
  Document Layer | Jinja Engine | Project Engine
                |
       Intelligence Engine
                |
        LSP Response Layer
```

| Path | Role |
| ---- | ---- |
| `src/server.ts`, `src/index.ts` | Entry point, version, public exports |
| `src/lsp/` | `connection.ts` (all handlers), `capabilities.ts`, `lifecycle.ts`, `document-sync.ts`, `project-sync.ts` — editor I/O only |
| `src/jinja/lexer/` | Ranged tokens for `{{ }}`, `{% %}`, `{# #}` |
| `src/jinja/ast/`, `src/jinja/parser/` | Ranged AST + Pratt expression parser + statement parser with recovery |
| `src/jinja/analysis/` | Scopes, symbols, shadowing, `resolveAt`, externals |
| `src/jinja/syntax/`, `src/jinja/docs/` | Filters/tests/keywords/builtins + hover prose |
| `src/features/` | `diagnostics/`, `completion/`, `hover/`, `definition/`, `references/`, `rename/`, `symbols/`, `signature-help/`, `semantic-tokens/` |
| `src/project/`, `src/templates/`, `src/python/` | Workspace roots/scanner/index, template resolver, Flask/Django scanner + context + types |
| `src/documents/`, `src/config/`, `src/types/`, `src/utils/` | Document/Manager/offsets, settings, Position/Range/URI types, ranges/strings/paths/logging |
| `editors/vscode-extension/` | Thin client (`src/`, `out/`), bundles server via `scripts/copy-server.mjs` |
| `test/` | Vitest suites per area + `hardening/` (fuzz, large-file) + `lsp/` (spawn) |
| `scripts/bench.ts` | Perf harness (`bun run bench`) |
| `docs/` | architecture, installation, configuration, development, supported-features, roadmap, maintainers, performance |

Design principles: parser never imports LSP; handlers contain no parser logic;
every diagnostic/navigation node keeps source ranges; bounded async scans,
debounced external updates, never scan per keystroke.

## Development setup

See [`docs/development.md`](docs/development.md) and
[`CONTRIBUTING.md`](CONTRIBUTING.md).

Prerequisites: Bun ≥ 1.0, Node ≥ 18 (22 pinned in `.nvmrc`).

```sh
bun install          # root server deps
bun run dev          # bun src/server.ts --stdio (live from source)
bun run typecheck    # tsc --noEmit (src + test)
bun run test         # vitest run (needs bun on PATH for spawn tests)
bun run test:watch   # vitest watch
bun run bench        # bun scripts/bench.ts
bun run build        # tsc -p tsconfig.build.json → dist/ (src only)
bun run start        # node dist/server.js --stdio (prod build)

# VS Code extension (separate install):
cd editors/vscode-extension && bun install
bun run typecheck && bun run test && bun run compile && bun run package
```

Workflow per change: inspect → implement → `typecheck + test + build` green →
update `docs/supported-features.md` if user-visible → scoped commit
(`feat:`/`fix:`/`perf:`/`docs:`/`chore:`). Repo stays buildable every commit.

Tech stack: Bun + strict TypeScript (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`) + `vscode-languageserver` /
`vscode-languageserver-textdocument` / `vscode-uri` + Vitest + `tsc`.

## Testing / typecheck / bench

```sh
bun run typecheck
bun run test                 # full suite
bun run test test/hover/     # one area only
bun run bench                # perf numbers → docs/performance.md
node dist/server.js --version
```

CI (`.github/workflows/ci.yml`): server job (install → typecheck → test →
build → `--version` → assert `npm pack` ships `dist/server.js` only, no
`src/`/`test/`) + extension job (install → typecheck → test).
Publish (`.github/workflows/publish.yml`): `workflow_dispatch` with target
`npm` (`NPM_TOKEN`) / `marketplace` (`VSCE_TOKEN`) / `openvsx` (`OVSX_TOKEN`) /
`all`.

## Performance

Measured via `bun scripts/bench.ts`, see
[`docs/performance.md`](docs/performance.md). Budgets: cold startup < 500 ms,
keystroke features < 16 ms on realistic files, full scan < 5 s / index
< 50 MiB for 2000 files.

Latest (pathological 1923-line / 80 KB template; realistic 50–200 line files
are 10–50× faster): lex ~12 ms, parse ~18 ms, analyze ~1 ms, diagnostics
~16 ms, completion/hover/references ~28 ms, semanticTokens ~38 ms, 300-file
scan ~45 ms (~8 MiB), templateContext ~0.2 ms, cold startup ~65–125 ms.

Phase 19 fix: `spanOf` recomputed line tables per node (quadratic, ~760 ms) →
binary-search `positionAtOffset` + compute-once table → 44× faster parse.
Per-request parse/analyze deliberately uncached (sub-ms realistic); no memo
without bench numbers.

Known gaps: no `workspaceFolders` change handling yet (restart on folder add),
POSIX-first paths (Windows pass pending).

## Limitations & roadmap

1.0.0 is single-file for references/rename, same-file for Python types,
no formatting/inlay-hints/code-actions. See
[`docs/roadmap.md`](docs/roadmap.md) “Beyond 1.0” (ordered):

1. Cross-file references/rename (index already holds the data)
2. Formatting (`textDocument/formatting`)
3. Inlay hints + code actions (e.g. quick-fix missing `{% endif %}`)
4. Optional Pyright integration for exact types
5. Windows CI + `workspaceFolders` handling
6. Benchmarks in CI + growing fuzz corpus
7. Showcase (demo GIF, Marketplace/Open VSX listings, announcement)

Good first issues: hover prose in `src/jinja/docs/`, parser fixtures, docs
gaps — label `good first issue`.

## Docs index

- [`docs/architecture.md`](docs/architecture.md) — layers & principles
- [`docs/installation.md`](docs/installation.md) — every editor + verify + publish checklist
- [`docs/configuration.md`](docs/configuration.md) — settings reference
- [`docs/supported-features.md`](docs/supported-features.md) — truthful feature + diagnostic-code list
- [`docs/development.md`](docs/development.md) — commands & protocol rules
- [`docs/performance.md`](docs/performance.md) — budgets & bench numbers
- [`docs/roadmap.md`](docs/roadmap.md) — 20 phases + beyond-1.0
- [`docs/maintainers.md`](docs/maintainers.md) — release/publish/announce checklist
- [`CHANGELOG.md`](CHANGELOG.md) — 1.0.0 notes
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, rules, PR requirements
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), [`SECURITY.md`](SECURITY.md)

## Contributing

Issues and PRs welcome — start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

```sh
bun install && bun run typecheck && bun run test && bun run build
```

Bugs: use bug template (minimal template, expected vs actual, client,
`node dist/server.js --version`). Features: open a feature request first for
anything beyond a small fix. PRs need tests + fixtures, truthful
`supported-features.md` updates, scoped commits. No CLA — MIT applies.

## Security

See [`SECURITY.md`](SECURITY.md). Supported: `1.x`. Do **not** open public
issues for vulnerabilities — use GitHub private vulnerability reporting
(Security tab → Report a vulnerability) with version, repro, and impact
beyond normal local file reads.

## License

MIT — see [`LICENSE`](LICENSE).
