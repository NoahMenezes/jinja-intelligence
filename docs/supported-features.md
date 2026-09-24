# Supported Features

> Truthful status. Only what exists is marked done.

## Done (Phase 19/20)

- Project tooling: Bun + strict TypeScript + Vitest + build scripts.
- Core types and utils: Position/Range/TextEdit/URIs, range/string/path helpers.
- Document engine: immutable Document, DocumentManager, UTF-16 offset/position conversion.
- Jinja lexer: ranged tokens for {{ }}, {% %}, {# #} with graceful errors.
- Jinja expressions: ranged AST + Pratt parser for {{ }} (filters, tests, calls, operators, collections) with recovery.
- Jinja statements: nested if/for/set/block/extends/include/import/from/macro/call/filter/with/raw/do with missing/mismatched-end recovery.
- LSP lifecycle: stdio server, initialize/initialized/shutdown/exit with correct exit codes, Full document sync (didOpen/didChange/didClose) into the document store.
- Syntax diagnostics: parser errors publish as versioned Error diagnostics on open/change and clear on fix/close (`source: jinja-intelligence`).
- Scope and symbol analysis (internal plumbing; nothing editor-visible yet): loop/set/macro/import/block/with bindings, shadowing, `resolveAt`, external-name collection.
- Core completion: statement openers after `{%`, filters after `|`, tests after `is` (no variables/properties yet — Phase 11).
- Context-aware completion: scope variables, builtins, file-context names, `loop.*` properties, template-file names from the project index.
- Hover documentation: filters, tests, keywords, symbols, macro signatures, builtins, `loop` attributes (typed properties and template references return nothing yet — Phases 13+).
- Go-to-definition: template strings → files, local names → definitions, imported macros (incl. `alias.attr` segments and from-import bindings) → the macro in the target file. Block chains and Python references need later phases.
- References and rename (single file): identity-based find-all-uses with `includeDeclaration`; validated rename with token-precise edits, refused on keywords/segments/strings/externals/invalid names. Cross-file rename is deferred to hardening.
- Document symbols (macros with nested params, blocks, imports, variables), current-file workspace search, signature help for macro calls and filters, delta-encoded semantic tokens.
- Project indexing: async workspace scan (skip dirs, file cap, `.html` marker-gated), macro/block/inheritance index, open-documents-shadow-disk, debounced external updates; template-name completion in strings and index-wide workspace symbols.
- Python awareness (Flask `render_template` only): context variables complete with provenance and hover names the route file. Django, types, and cross-file rename are later phases.
- Python frameworks and types: Django `render`/`render_to_response`, dataclass/TypedDict/Pydantic/plain attribute extraction, function-return resolution (same-file), typed `{{ x. }}` completion, `name: Type` hovers. No dataflow engine, no imports-chasing; external analyzers optional.
- Production hardening: measured budgets in `docs/performance.md`, quadratic parser fix, cycle-safe bounded scans, debounced external updates with pruning, fuzz coverage over every entry point.

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

- Cross-file references/rename
- Performance hardening
- Editor integrations (VS Code, Neovim, Zed, Helix)

Do not assume any item above works until its phase lands and this file is updated.
