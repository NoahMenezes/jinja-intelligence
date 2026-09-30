# Performance

Measured with `bun scripts/bench.ts` (best-of-N, dev hardware).
Reproduce: `bun run bench` (fixture: 1923 lines / ~80KB pathological template).
Budgets: cold startup < 500ms, keystroke features < 16ms on realistic files,
full scan < 5s for 2000 files, index < 50MiB for 2000 files.

## Latest run (1.0.0)

| operation | best of N | note |
| --- | --- | --- |
| lex (large) | ~12 ms | tokenize 2000-line template |
| parse (large) | ~18 ms | full template to AST |
| analyze (large) | ~1 ms | scopes + symbols |
| diagnostics (large) | ~16 ms | parse to LSP diagnostics |
| completion (large) | ~28 ms | variable slot incl. parse+analyze |
| hover (large) | ~28 ms | symbol hover incl. parse+analyze |
| references (large) | ~28 ms | single-file search |
| semanticTokens (large) | ~38 ms | full delta-encoded tokens |
| project scan (300 files) | ~45 ms | walk + parse + index |
| index memory (300 files) | ~8 MiB heap after scan | order of magnitude |
| templateContext | ~0.2 ms | merged map build |
| basenames | ~0.1 ms | sorted name list |
| cold startup | ~65–125 ms | spawn to first response |

“Large” is a pathological 1923-line / 80KB template; realistic files
(50–200 lines) measure 10–50x faster, comfortably inside budget.
Completion/hover fire on explicit user action, so ~28ms worst-case is
imperceptible; only diagnostics runs per keystroke.

## What was fixed (Phase 19)

The bench found `parseTemplate` at ~760ms on the large fixture — a
quadratic: `spanOf` recomputed the line table per AST node, and offset
conversion scanned lines linearly per token. Fixes: binary search in
`positionAtOffset` (line tables are strictly ascending) and a
compute-once line table threaded through `BodyState`. Result: 44x faster
parsing, 6x faster lexing, proven by round-trip property tests.

## Deliberately not cached

- Per-request parse/analyze: sub-millisecond on realistic files; a
  version-keyed memo would add invalidation risk for no measurable gain.
  Revisit with bench numbers if templates grow 10x.
- `templateContext` (0.2ms) and `basenames` (0.1ms): rebuilt per request;
  memoize only if a profile says so.
- Diagnostics stay synchronous: deterministic and test-honest; the numbers
  above show no need for debounce machinery and its staleness risk.

## Structural budgets enforced

- `walkRoots`: async, skip-dirs, symlink-cycle guard (canonical paths),
  `MAX_INDEX_FILES = 2000` cap with a log line.
- Debounced external file events (500ms trailing); editor open/change stay
  synchronous single-file upserts; `prune()` on watched-flush and rescan.
- No full-workspace scans per keystroke, ever. No `workspaceFolders`
  change handling yet — folders added mid-session need a restart.
- Windows paths remain POSIX-first (platform pass is Phase 20 work).
