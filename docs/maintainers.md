# Maintainer Checklist

Things only a maintainer with GitHub + registry access can do. Work
through top to bottom, checking each off.

## 1. Push and tag the release

```sh
git log --oneline -3        # confirm HEAD is the release commit
bun run typecheck && bun run test && bun run build
git push origin main
git tag -a v1.0.0 -m "Jinja Intelligence 1.0.0"
git push origin v1.0.0
```

## 2. Repository settings (github.com → Settings)

- [ ] **Branch protection** on `main`: require a pull request and green
  `CI` status checks before merging; dismiss stale approvals.
- [ ] **Discussions** enabled (Q&A category on); keep Issues for bugs
  and features via the templates in `.github/ISSUE_TEMPLATE/`.
- [ ] **Topics**: `jinja`, `jinja2`, `lsp`, `language-server`, `flask`,
  `django`, `typescript`.
- [ ] **About section**: short description + website link to the repo.
- [ ] **Private vulnerability reporting** enabled (Security tab) — this
  is the route `SECURITY.md` promises reporters.
- [ ] **Social preview image** (optional but high-visibility ROI).

## 3. Publish secrets (Settings → Secrets → Actions)

- [ ] `NPM_TOKEN` — npm access token (automation type) for `jinja-intelligence`.
- [ ] `VSCE_TOKEN` — VS Marketplace personal access token; create the
  publisher identity first.
- [ ] `OVSX_TOKEN` — Open VSX personal access token; claim the namespace first.

## 4. Publish (in order)

1. Actions → **Publish** → Run workflow → target `npm`; confirm the
   package page shows 1.0.0 with the README rendered.
2. Sanity-install elsewhere: `npm install -g jinja-intelligence` on a
   clean machine, then `jinja-intelligence --version`.
3. Target `marketplace`, then `openvsx`; install the extension from each
   into a clean editor profile and open a `.j2` file.
4. Create the **GitHub Release** for tag `v1.0.0`, pasting the
   `CHANGELOG.md` entry as notes; attach nothing (registries hold artifacts).

## 5. Announce (what actually brings contributors)

- [ ] Demo GIF in `README.md` (broken template → squiggles → fix → clear,
  plus one completion + hover moment; under 30 seconds).
- [ ] Announcement post (dev.to / Reddit r/neovim, r/vscode, r/flask /
  r/django as appropriate — check each community's promo rules first).
- [ ] Label starter issues: `good first issue` on hover-prose additions
  (`src/jinja/docs/`), new parser fixtures, and docs gaps.

## 6. Ongoing cadence

- Triage issues weekly; keep `docs/supported-features.md` truthful on
  every behavior change.
- Re-run `bun run bench` before any performance claim; record numbers in
  `docs/performance.md`.
- See `docs/roadmap.md` (“Beyond 1.0”) for what to build next, in order.
