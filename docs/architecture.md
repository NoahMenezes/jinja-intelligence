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

## Current state (1.0.0 — Phase 20/20)

Released. The server (`src/`) stays editor-agnostic; the thin VS Code
client lives in `editors/vscode-extension/` and bundles `dist/server.js`
at package time. See `docs/installation.md` for every editor.
