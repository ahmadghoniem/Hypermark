# Hypermark Claude Code Plugin

This directory contains the Claude Code plugin configuration for Hypermark.

## Prerequisites

Install the `hypermark` command so Claude Code can use it:

**macOS / Linux / WSL:**
```bash
curl -fsSL https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.ps1 | iex
```

**Windows CMD:**
```cmd
curl -fsSL https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.cmd -o install.cmd && install.cmd && del install.cmd
```

Released binaries ship with SHA256 sidecars and [SLSA build provenance](https://slsa.dev/) attestations from v0.17.2 onwards. Run `scripts/install.sh --help` for version pinning and `--verify-attestation`.

---

[Plugin Installation](#plugin-installation) · [How It Works](#how-it-works)

---

## Plugin Installation

In Claude Code:

```
/plugin marketplace add ahmadghoniem/Hypermark
/plugin install hypermark@hypermark
```

**Important:** Restart Claude Code after installing the plugin for the skills to take effect.

## How It Works

Hypermark opens a local review surface in your browser for three things:

1. Annotate a file or document (`/hypermark-annotate`)
2. Annotate Claude's last message (`/hypermark-last`)
3. Review code changes (`/hypermark-review`)

Your annotations are sent back to Claude Code. When you annotate a file again, the version diff shows what changed since you last reviewed it.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HYPERMARK_PORT` | Fixed port, or an inclusive range (`9000-9010`). Default: an OS-chosen free port. |
| `HYPERMARK_BROWSER` | Custom browser to open Hypermark in. macOS: app name or path. Linux/Windows: executable path. |

Every session is local: the server binds loopback and advertises `localhost`.
There is no remote/SSH mode in this fork.

## Slash Commands

Hypermark's slash commands are installed as Claude Code skills in `~/.claude/skills` by the install script (the canonical source is `skills/core/`). Claude Code skills are user-invocable by directory name, so these three work like slash commands inside your session:

| Command | Description |
|---------|-------------|
| `/hypermark-review [--git]` | Open code review UI for current changes; optionally force the Git provider |
| `/hypermark-annotate <file.md \| file.txt \| file.html>` | Annotate a local file |
| `/hypermark-last` | Annotate the agent's last message |
