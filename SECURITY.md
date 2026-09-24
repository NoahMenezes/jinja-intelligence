# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

Pre-1.0 development versions receive no security fixes; upgrade to the
latest 1.x release.

## Reporting a Vulnerability

**Do not open a public issue for security problems.** Report them
privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository (Security tab → Report a vulnerability).

Please include:

- Affected version (`node dist/server.js --version` output)
- What you ran (editor, config, template/Python snippets when relevant)
- What you expected vs. what happened
- Whether arbitrary template or project content can trigger it

## What to expect

- Acknowledgement as fast as maintainers can manage (this is a
  community project, not a staffed security team — days, not hours).
- A fix release plus a `CHANGELOG.md` entry crediting the reporter,
  unless anonymity is requested.
- Honest scope: this server reads local project files by design (that is
  its job); a report should demonstrate impact beyond normal local
  operation, such as remote-triggerable behavior through crafted
  templates, dependency confusion, or supply-chain issues in our published
  packages.

## Ground rules

Our [Code of Conduct](CODE_OF_CONDUCT.md) applies to security discussions
as everywhere else.
