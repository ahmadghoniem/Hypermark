# Vendored skills

These are checked in, not installed. A skill that lives in a plugin reaches a session
through this machine's plugin cache; a skill that lives here reaches it through the repo
— which is the only path that works for a cloud session, a fresh clone, or a teammate
who has never installed the plugin.

Vendored, not referenced: each is a copy, so updating one means re-copying it from
upstream. That is the trade for having it work where the plugin cache does not exist.

## Contents

| Skill | Upstream | Author | License |
| --- | --- | --- | --- |
| `interface-review` | [jakubkrehel/skills](https://github.com/jakubkrehel/skills) | Jakub Krehel | see upstream |
| `better-interface` | same | same | same |
| `better-accessibility` | same | same | same |
| `better-colors` | same | same | same |
| `better-layout` | same | same | same |
| `better-typography` | same | same | same |
| `better-ui` | same | same | same |
| `better-writing` | same | same | same |
| `grilling` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock ([aihero.dev](https://www.aihero.dev)) | MIT |
| `writing-for-agents` | same | same | MIT |

`interface-review` resolves the scope of a change and hands the review to
`better-interface`, which consults the six `better-*` domain skills. That is why all
eight are here and not just the entry point — the set is only useful whole.
