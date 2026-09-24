# Installation

## npm (language server)

```sh
npm install -g jinja-intelligence
jinja-intelligence --stdio
```

Or without installing:

```sh
npx jinja-intelligence --stdio
```

Requires Node.js 18+. Verify with `jinja-intelligence --version`.

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
