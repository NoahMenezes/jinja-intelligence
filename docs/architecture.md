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
2. **Jinja engine (`src/jinja/`)** — lexer / parser / AST / syntax / analysis. No LSP imports.
3. **Project (`src/project/`, `src/templates/`, `src/python/`)** — workspace indexing, template resolution, Python context. Independent of editors.
4. **Features (`src/features/`)** — completion, diagnostics, hover, definition, references, rename, symbols, signature-help, semantic-tokens. Consume shared analysis/index data.

## Design principles

- Separation of concerns; small modules; explicit types; strict TypeScript.
- Parser never imports LSP; LSP handlers never contain parser logic.
- Every AST node that drives diagnostics/navigation retains source ranges.
- Error recovery: broken templates produce partial results, never crash the server.
- No full-workspace scans per keystroke; prefer caches, indexes, incremental updates, debouncing.

## Current state (Phase 9/20)

Scope and symbol analysis (`src/jinja/analysis/`) done: lexical scopes
(Template/For/Macro/With — if-blocks share scope, true to Jinja), symbol
definitions, occurrence tracking, `resolveAt`, and external-name collection
for future template-context work. Deliberate approximations: flow-insensitive
`set` visibility, statement-level definition ranges, `self`/`super` unmodeled.
Phase 10 introduces core completion.
