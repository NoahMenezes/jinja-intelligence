# Jinja Intelligence

[![CI](https://github.com/NoahMenezes/jinja-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/NoahMenezes/jinja-intelligence/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/jinja-intelligence)](https://www.npmjs.com/package/jinja-intelligence)

A modern, Python-aware, project-aware Language Server for Jinja templates.

> **Status: 1.0.0 released.** See [`docs/installation.md`](docs/installation.md) to install.

The LSP server is the core product. It is editor-agnostic and communicates over
standard LSP (stdio), so VS Code, Neovim, Zed, Helix, VSCodium and other
LSP-compatible editors can use the same server.

## Install

```sh
npm install -g jinja-intelligence
```

Full instructions for every editor: [`docs/installation.md`](docs/installation.md).

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
- `docs/performance.md`
- `docs/installation.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`

## License

MIT — see `LICENSE`.
