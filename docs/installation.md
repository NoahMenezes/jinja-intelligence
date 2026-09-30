# Installation

## Language server (one `npm publish` covers all managers)

All managers below pull the same `jinja-intelligence` package from the npm
registry. Requires Node.js 18+. Verify with `jinja-intelligence --version`.

```sh
# npm
npm install -g jinja-intelligence
jinja-intelligence --stdio
# without installing:
npx jinja-intelligence --stdio

# bun
bun add -g jinja-intelligence
jinja-intelligence --stdio
# without installing:
bunx jinja-intelligence --stdio

# pnpm
pnpm add -g jinja-intelligence
jinja-intelligence --stdio
# without installing:
pnpm dlx jinja-intelligence --stdio

# yarn classic (v1)
yarn global add jinja-intelligence
jinja-intelligence --stdio
# yarn berry (v3/v4, no global install needed)
yarn dlx jinja-intelligence --stdio
```

### curl (no package manager)

```sh
curl -fsSL https://raw.githubusercontent.com/NoahMenezes/jinja-intelligence/main/scripts/install.sh | sh
# pin a version / custom prefix:
# curl -fsSL .../install.sh | sh -s -- 1.0.0
# PREFIX=$HOME/.local sh install.sh
# PREFIX=/usr/local sudo sh install.sh
```

Installs to `$PREFIX/share/jinja-intelligence` with a
`$PREFIX/bin/jinja-intelligence` shim (uses the bundled `npm install
--omit=dev` once for runtime deps). Ensure `$PREFIX/bin` is on `PATH`,
then `jinja-intelligence --version`.

### Finding the binary path (for Neovim / Zed / Helix below)

```sh
command -v jinja-intelligence  # global install
npm root -g                    # npm global dir (dist lives under it)
pnpm root -g
bun pm bin -g
yarn global bin                # yarn classic
```

## VS Code

Install **Jinja Intelligence** from the
[VS Code Marketplace](https://marketplace.visualstudio.com/) or
[Open VSX](https://open-vsx.org/). The extension bundles the server; no
further setup is needed. File types `.j2`, `.jinja`, `.jinja2` are
recognized automatically.

Settings (prefix `jinjaIntelligence`):

- `templateDirectories`: extra lookup dirs, absolute or workspace-relative
- `templateExtensions`: scanned template extensions
- `maxLogLines`: maximum retained log lines

## Neovim (built-in LSP, no plugins)

```lua
vim.filetype.add({ extension = { j2 = "jinja", jinja = "jinja", jinja2 = "jinja" } })
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "jinja", "htmldjango" },
  callback = function()
    vim.lsp.start({
      name = "jinja-intelligence",
      cmd = { "node", "/path/to/jinja-intelligence/dist/server.js", "--stdio" },
      root_dir = vim.fs.root(0, { ".git", "requirements.txt", "pyproject.toml", "app.py" })
        or vim.fn.getcwd(),
    })
  end,
})
```

Replace the server path with your install location (`npm root -g` shows
the global directory). Plain `.html` files attach only when Jinja syntax
is detected; Django templates typically use the `htmldjango` filetype.

## Zed

Custom server settings (adjust the binary path):

```json
{
  "lsp": {
    "jinja-intelligence": {
      "binary": { "path": "/path/to/jinja-intelligence/dist/server.js", "args": ["--stdio"] }
    }
  }
}
```

## Helix (`~/.config/helix/languages.toml`)

```toml
[[language]]
name = "jinja"
language-servers = ["jinja-intelligence"]

[language-server.jinja-intelligence]
command = "node"
args = ["/path/to/jinja-intelligence/dist/server.js", "--stdio"]
```

## Verifying the install

1. Open a Jinja file containing `{% if user %}` with no `{% endif %}` —
   expect a `missing-end-tag` diagnostic.
2. Type `{{ user |` — expect filter completions (`upper`, `default`, …).
3. Hover a filter — expect its signature and description.

## Publishing (maintainers)

1. `bun run typecheck && bun run test && bun run build`
2. Update `CHANGELOG.md`, bump versions (`package.json`,
   `editors/vscode-extension/package.json`)
3. Commit, tag `git tag vX.Y.Z`, push with tags
4. Run the **Publish** workflow (`workflow_dispatch`), choosing the target:
   - `npm` needs the `NPM_TOKEN` secret (trusted publishing configured)
   - `marketplace` needs `VSCE_TOKEN` (create a publisher first, then a PAT)
   - `openvsx` needs `OVSX_TOKEN` (create a namespace claim first)
