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

## Current state (Phase 8/20)

Syntax diagnostics (`src/features/diagnostics/`) done: parser errors publish
as versioned LSP diagnostics on open/change and clear on fix/close, with
dedup + range clamping. Publishing is synchronous by design (deterministic,
test-honest); debounced scheduling is a Phase 19 performance task.
Phase 9 introduces scope and symbol analysis.
