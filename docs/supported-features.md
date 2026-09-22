# Supported Features

> Truthful status. Only what exists is marked done.

## Done (Phase 8/20)

- Project tooling: Bun + strict TypeScript + Vitest + build scripts.
- Core types and utils: Position/Range/TextEdit/URIs, range/string/path helpers.
- Document engine: immutable Document, DocumentManager, UTF-16 offset/position conversion.
- Jinja lexer: ranged tokens for {{ }}, {% %}, {# #} with graceful errors.
- Jinja expressions: ranged AST + Pratt parser for {{ }} (filters, tests, calls, operators, collections) with recovery.
- Jinja statements: nested if/for/set/block/extends/include/import/from/macro/call/filter/with/raw/do with missing/mismatched-end recovery.
- LSP lifecycle: stdio server, initialize/initialized/shutdown/exit with correct exit codes, Full document sync (didOpen/didChange/didClose) into the document store.
- Syntax diagnostics: parser errors publish as versioned Error diagnostics on open/change and clear on fix/close (`source: jinja-intelligence`).

## Diagnostic codes

| Code | Meaning |
|---|---|
| `unterminated-variable` / `unterminated-block` / `unterminated-comment` / `unterminated-string` / `unterminated-expression` | Unclosed tag, comment, string, or expression |
| `missing-end-tag` | Block opened without its end tag (e.g. missing `{% endif %}`) |
| `mismatched-end-tag` | Stray end tag (`{% endif %}`, dangling `{% else %}`/`{% elif %}`) |
| `expected-expression` / `expected-property` / `expected-close` | Malformed or incomplete expression |
| `expected-statement` / `expected-block-name` | Truncated or nameless statement |

Unknown tags (e.g. `{% fro x %}`) intentionally produce no diagnostics.

## Planned (not implemented)

- Scope and symbol analysis
- Completion (statements, filters, tests, context-aware)
- Hover and documentation
- Go-to-definition / template resolution
- References / rename
- Document symbols / workspace symbols / signature help / semantic tokens
- Project indexing
- Python awareness (`render_template` context)
- Type intelligence (dataclasses, TypedDict, Pydantic)
- Performance hardening
- Editor integrations (VS Code, Neovim, Zed, Helix)

Do not assume any item above works until its phase lands and this file is updated.
