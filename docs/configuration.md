# Configuration

> Phase 7: settings are accepted (initialization options + workspace
> configuration) and stored, but no feature reads them yet.

## Defaults

```jsonc
{
  // "jinjaIntelligence": {
  //   "maxLogLines": 500,
  //   "templateExtensions": [".jinja", ".jinja2", ".j2"]
  // }
}
```

Settings key: `jinjaIntelligence`. Unknown keys are ignored; invalid values
fall back to defaults. No config files are read; `templateExtensions` is
reserved for Phase 16 project configuration.
