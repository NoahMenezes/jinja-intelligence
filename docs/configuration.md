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
fall back to defaults. No config files are read. `templateDirectories`
extends go-to-definition lookup (referring file's dir, workspace roots,
`<root>/templates/` are always searched); `templateExtensions` is reserved
for Phase 16 project configuration.
