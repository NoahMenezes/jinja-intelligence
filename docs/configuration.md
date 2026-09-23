# Configuration

> Phase 7: settings are accepted (initialization options + workspace
> configuration) and stored, but no feature reads them yet.

## Defaults

```jsonc
{
  // "jinjaIntelligence": {
  //   "maxLogLines": 500,
  //   "templateExtensions": [".jinja", ".jinja2", ".j2"],
  //   "templateDirectories": [] // extra lookup dirs, absolute or workspace-relative
  // }
}
```

Settings key: `jinjaIntelligence`. Unknown keys are ignored; invalid values
fall back to defaults. No config files are read. `templateExtensions`
selects scanned template files (`.html` is additionally marker-gated);
`templateDirectories` extends both go-to-definition lookup and the index
(referring file's dir, workspace roots, `<root>/templates/` always apply).
