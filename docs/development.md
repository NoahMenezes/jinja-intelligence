# Development

## Prerequisites

- Bun >= 1.0
- Node >= 18 (for `node dist/index.js` production runs)

## Setup

```sh
bun install
```

## Commands

```sh
bun run dev        # bun src/index.ts (placeholder; src/server.ts --stdio lands in Phase 7)
bun run typecheck  # tsc --noEmit (src + test)
bun run test       # vitest run
bun run build      # tsc -p tsconfig.build.json -> dist/ (src only)
bun run start      # node dist/index.js (placeholder)
```

## Workflow per phase

1. Inspect repo before changing code.
2. Implement only the requested phase.
3. Run `typecheck`, `tests`, `build`; fix failures.
4. Review diff; update docs truthfully.
5. Commit with `feat:` / `chore:` / `perf:` prefix.

The repo must remain buildable after every phase.
