# Changelog

All notable changes to Jinja Intelligence are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0]

First public release: a Python-aware, project-aware Jinja language server
plus a VS Code extension, built over twenty phases.

### Language server (`jinja-intelligence`)

- Editor-agnostic LSP over stdio: initialize, Full document sync, shutdown
  with spec-correct exit codes
- Jinja lexer, Pratt expression parser, and statement parser with error
  recovery (never crashes on broken templates)
- Scope and symbol analysis: loop/set/macro/import/block/with bindings,
  shadowing, external-name collection
- Live syntax diagnostics with stable codes, cleared on fix and close
- Context-aware completion: statements, filters, tests, scope variables,
  builtins, template context, template names, `loop.*` properties
- Hover documentation for filters, tests, keywords, symbols, macros,
  builtins, and loop attributes
- Go-to-definition for template strings, local names, and imported macros
- Identity-based references and validated, refuse-on-unsafe rename
- Document symbols, current-file workspace search, signature help,
  delta-encoded semantic tokens
- Async project index (macros, blocks, inheritance edges) with open-doc
  shadowing, single-file fallback, and debounced external updates
- Flask `render_template` and Django `render`/`render_to_response`
  context; dataclass / TypedDict / Pydantic / plain-class attribute
  extraction with function-return resolution (same-file)
- Measured budgets in `docs/performance.md` (44x parser speedup in
  hardening; per-request work deliberately uncached at proven sub-ms scale)

### Editor integrations

- VS Code extension (`jinja-intelligence-vscode` 1.0.0): launches the
  bundled server, registers Jinja language support, mirrors settings
- Generic-LSP instructions for Neovim, Zed, Helix, and VSCodium
