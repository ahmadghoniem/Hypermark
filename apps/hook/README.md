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

[Plugin Installation](#plugin-installation) · [Manual Installation (Hooks)](#manual-installation-hooks)  

---

## Plugin Installation

In Claude Code:

```
/plugin marketplace add backnotprop/plannotator
/plugin install hypermark@hypermark
```

**Important:** Restart Claude Code after installing the plugin for the hooks to take effect.

## Manual Installation (Hooks)

If you prefer not to use the plugin system, add this to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "hypermark",
            "timeout": 345600
          }
        ]
      }
    ]
  }
}
```

## How It Works

When Claude Code calls `ExitPlanMode`, this hook intercepts and:

1. Opens Hypermark UI in your browser
2. Lets you annotate the plan visually
3. Approve → Claude proceeds with implementation
4. Request changes → Your annotations are sent back to Claude
5. On resubmission → Plan Diff shows what changed since the last version

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HYPERMARK_PORT` | Fixed port, or an inclusive range (`9000-9010`). Default: an OS-chosen free port. |
| `HYPERMARK_BROWSER` | Custom browser to open plans in. macOS: app name or path. Linux/Windows: executable path. |

Every session is local: the server binds loopback and advertises `localhost`.
There is no remote/SSH mode in this fork.

## Slash Commands

Hypermark's slash commands are installed as Claude Code skills in `~/.claude/skills` by the install script (the canonical source is `apps/skills/core/`). Claude Code skills are user-invocable by directory name, so these three work like slash commands inside your session:

| Command | Description |
|---------|-------------|
| `/hypermark-review [--git \| --gitbutler]` | Open code review UI for current changes or a GitHub PR; optionally force the Git or GitButler provider |
| `/hypermark-annotate <file.md \| file.txt \| file.html>` | Annotate a local file |
| `/hypermark-last` | Annotate the agent's last message |
