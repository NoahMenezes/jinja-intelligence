# Jinja Intelligence for VS Code

Python-aware, project-aware language intelligence for Jinja templates
(`.j2`, `.jinja`, `.jinja2`), powered by the Jinja Intelligence language
server over standard LSP.

## Features

- Syntax diagnostics with stable codes, updated live, cleared on fix
- Context-aware completion: statements, filters, tests, scope variables,
  builtins, template context, template names, `loop.*` properties
- Hover documentation for filters, tests, keywords, symbols, and macros
- Go-to-definition across templates, references, safe rename
- Document and workspace symbols, signature help, semantic tokens
- Whole-workspace template index; Flask and Django template context;
  dataclass / TypedDict / Pydantic type intelligence

## Requirements

Node.js 18 or newer (the bundled server runs on it).

## Extension Settings

- `jinjaIntelligence.templateDirectories`: extra template lookup
  directories, absolute or workspace-relative (default `[]`)
- `jinjaIntelligence.templateExtensions`: scanned template extensions
  (default `[".jinja", ".jinja2", ".j2"]`)
- `jinjaIntelligence.maxLogLines`: maximum retained log lines (default `500`)

## Known limitations

Cross-file references/rename are single-file only; Python type lookup is
same-file only. See the repository issue tracker to report problems.

## Release Notes

### 1.0.0

Initial public release, tracking language server 1.0.0.
