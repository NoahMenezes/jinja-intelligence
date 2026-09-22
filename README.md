# Jinja Intelligence

A modern, Python-aware, project-aware Language Server for Jinja templates.

> **Status (Phase 9/20):** Live syntax diagnostics + full semantic analysis (scopes/symbols/resolution). No completion/hover yet.

The LSP server is the core product. It is editor-agnostic and communicates over
standard LSP (stdio), so VS Code, Neovim, Zed, Helix, VSCodium and other
LSP-compatible editors can use the same server.

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

See `docs/development.md` for details.

## Docs

- `docs/architecture.md`
- `docs/development.md`
- `docs/configuration.md`
- `docs/supported-features.md`
- `docs/roadmap.md`

## License

MIT — see `LICENSE`.
