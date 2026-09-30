# Architecture

Jinja Intelligence is an editor-agnostic Jinja Language Server.

```
VS Code / Neovim / Zed / Helix / VSCodium
                |
           LSP (stdio)
                |
        Jinja Intelligence LSP Server
                |
  Document Layer | Jinja Engine | Project Engine
                |
        Intelligence Engine
                |
          LSP Response Layer
```

## Layers

1. **LSP (`src/lsp/`)** — editor communication only. No parser logic.
   `connection.ts` wires every handler; `lifecycle.ts` (initialize/shutdown/exit),
   `document-sync.ts` (didOpen/didChange/didClose → document store),
   `project-sync.ts` (workspace roots → index), `capabilities.ts` (advertised features).
2. **Jinja engine (`src/jinja/`)** — lexer / parser / AST / syntax / analysis. No LSP imports.
   `lexer/` ranged tokens for `{{ }}`, `{% %}`, `{# #}` with graceful errors.
   `parser/` Pratt expressions + nested statements with missing/mismatched-end recovery.
   `ast/` nodes (all range-bearing) + `query.ts` helpers (e.g. `templateReferences`).
   `syntax/` keyword/filter/test/builtin tables. `docs/` hover prose per name.
   `analysis/` scope/symbol bindings (loop/set/macro/import/block/with), shadowing, `resolveAt`.
3. **Project (`src/project/`, `src/templates/`, `src/python/`)** — workspace indexing,
   template resolution, Python context. Independent of editors.
   `project/scanner.ts` async walk (skip dirs, symlink-cycle guard, `MAX_INDEX_FILES = 2000`);
   `project/template-index.ts` macro/block/inheritance index;
   `project/project.ts` merged facade; `project/workspace.ts` root detection.
   `templates/resolver.ts` template-name → file lookup.
   `python/scanner.ts` + `symbols.ts` + `types.ts` extract Flask/Django context;
   `python/context.ts` merges it per template.
4. **Features (`src/features/`)** — completion, diagnostics, hover, definition, references,
   rename, symbols, signature-help, semantic-tokens. Consume shared analysis/index data.
   Each is a pure function of `(text, offset, options)` — see request flow below.

Supporting: `src/documents/` (immutable `Document`, `DocumentManager`, UTF-16 offsets),
`src/config/settings.ts` (`resolveSettings`, never throws), `src/types/` + `src/utils/`
(Position/Range/URI/path/string/range helpers), `src/index.ts` (version + public re-exports),
`src/server.ts` (stdio entry; only `--version`/`--help` touch stdout).

## Request flow (example: completion)

```
editor --textDocument/completion--> connection.ts --complete(text, offset, {templateNames, contextNames, contextTypes})--> features/completion/completion.ts
  detectContext (lexer-driven, multiline-safe) --> providers.ts / variables.ts items
  scope data <-- jinja/analysis/analyzer.ts <-- jinja/parser/parser.ts <-- jinja/lexer/lexer.ts
  template names <-- project/template-index.ts
  python names/types <-- python/context.ts
```

All other features follow the same shape: `connection.ts` gathers
(open-document text + index + python context + settings), calls a pure feature
function, returns LSP types. Handlers never throw across the connection boundary;
every body degrades to empty results or a log line.

## Where to change what

| Want | Edit | Fixtures/tests |
|---|---|---|
| New filter/test/keyword | `src/jinja/syntax/<name>.ts` + prose in `src/jinja/docs/<name>.ts` | `test/lexer/syntax-data.test.ts`, `test/jinja/docs.test.ts`, `test/completion/`, `test/hover/` |
| Parser behavior | `src/jinja/parser/expressions.ts` / `statements.ts`, errors in `parser-errors.ts` | `test/parser/`, `test/fixtures/parser/`, `test/features/diagnostics.test.ts` + `test/fixtures/diagnostics/` |
| Completion/hover/definition/references/rename/symbols/signature/semantic-tokens | `src/features/<area>/` + wire-up in `src/lsp/connection.ts` if new capability | `test/completion/`, `test/hover/`, `test/navigation/`, `test/symbols/`, `test/signature-help/`, `test/semantic-tokens/` |
| Template resolution / indexing | `src/templates/resolver.ts`, `src/project/scanner.ts` / `template-index.ts` | `test/project/`, `test/templates/`, `test/fixtures/project/` |
| Python context / types | `src/python/scanner.ts` / `symbols.ts` / `types.ts` / `context.ts` | `test/python/`, `test/fixtures/python/` |
| Settings | `src/config/settings.ts`, mirror defaults in `editors/vscode-extension/package.json` | `test/lsp/settings.test.ts`, extension `test/manifest.test.mjs` |
| Crash safety | keep entry total; add hostile input to `test/hardening/fuzz.test.ts` | `test/hardening/` |

## Design principles

- Separation of concerns; small modules; explicit types; strict TypeScript.
- Parser never imports LSP; LSP handlers never contain parser logic.
- Every AST node that drives diagnostics/navigation retains source ranges.
- Error recovery: broken templates produce partial results, never crash the server.
- No full-workspace scans per keystroke; prefer caches, indexes, incremental updates, debouncing.

## Current state (1.0.0 — Phase 20/20)

Released. The server (`src/`) stays editor-agnostic; the thin VS Code
client lives in `editors/vscode-extension/` (`src/extension.ts` launches the
bundled `dist/server.js` over stdio) and bundles `dist/server.js` at package
time via `scripts/copy-server.mjs`. See `docs/installation.md` for every editor.
