<p align="center">
  <img src=".github/assets/banner.webp" alt="Hypermark" width="640" />
</p>



<p align="center">
  <strong>Everything you need to annotate and stay in the loop with your agents</strong><br/>
  <strong>Annotate Documents • Annotate Claude's Messages</strong><br/>
  <sub>Annotate markdown and text documents and mark up Claude's messages in the browser. Send feedback to Claude Code.</sub>
</p>

<p align="center">
  <img src=".github/assets/icons/claude.svg" alt="Claude Code" title="Claude Code" height="28" />
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#commands">Commands</a> · <a href="#how-it-works">How it works</a>
</p>

<p align="center">
  <sub>A fork of <a href="https://github.com/backnotprop/plannotator">backnotprop/plannotator</a>, narrowed to Claude Code.</sub>
</p>

# Hypermark

Hypermark is a local, browser-based review surface for Claude Code.

**It plugs directly into Claude Code** through its skills. You open a document or Claude's last message in the browser, mark it up, comment, and send feedback directly to the agent for it to act on it.

<table>
<tr>
<td width="40%" valign="middle">

### Annotate documents and agent messages

Annotate markdown and text files and Claude's messages, then send the feedback to Claude Code.

</td>
<td width="60%">

<img src=".github/assets/annotate.webp" alt="Annotate UI with inline annotations" width="100%" />

</td>
</tr>
</table>

## Commands


### Annotate

```
/hypermark-annotate README.md                  # Local markdown file
/hypermark-annotate notes.txt                  # Local text file
/hypermark-last                                # Annotate the agent's last message
```

Need a realistic document to try? Any markdown file works — try one of your own specs.

### CLI

```
hypermark sessions                   # List active Hypermark sessions
hypermark sessions --open 1          # Reopen a session in the browser
```

---

## Privacy and network behavior

Hypermark does not collect usage telemetry or analytics. Documents, annotations, drafts, feedback history, and configuration stay local by default.


There is no link sharing, no paste service and no hosted counterpart, so nothing is uploaded anywhere.

---

## Install

Hypermark runs from a checkout with [Bun](https://bun.sh); there are no release binaries.

```bash
git clone https://github.com/ahmadghoniem/Hypermark.git
cd Hypermark
bun install
bun run build
```

Put a `hypermark` command on your PATH that runs the checkout's CLI. On macOS, Linux, WSL or Git Bash, an executable `~/.local/bin/hypermark`:

```bash
#!/usr/bin/env bash
exec bun run "$HOME/Hypermark/src/cli/index.ts" "$@"
```

On Windows, a `hypermark.cmd` in a folder on PATH:

```bat
@bun run "%USERPROFILE%\Hypermark\src\cli\index.ts" %*
```

Then link the three skills into `~/.claude/skills/` and restart Claude Code. On macOS, Linux or WSL:

```bash
mkdir -p ~/.claude/skills
ln -s ~/Hypermark/skills/core/hypermark ~/.claude/skills/hypermark
ln -s ~/Hypermark/skills/claude/hypermark-annotate ~/.claude/skills/hypermark-annotate
ln -s ~/Hypermark/skills/claude/hypermark-last ~/.claude/skills/hypermark-last
```

On Windows, directory junctions from PowerShell:

```powershell
$s = "$env:USERPROFILE\.claude\skills"; $r = "$env:USERPROFILE\Hypermark\skills"
New-Item -ItemType Junction -Path "$s\hypermark" -Target "$r\core\hypermark"
New-Item -ItemType Junction -Path "$s\hypermark-annotate" -Target "$r\claude\hypermark-annotate"
New-Item -ItemType Junction -Path "$s\hypermark-last" -Target "$r\claude\hypermark-last"
```

A change in the checkout, skills included, is live on the next run; after a UI change, run `bun run build` again.

To remove Hypermark, delete the command, the three skill links, and `~/.hypermark` (feedback history, drafts and settings). Remove a link, not its contents: `rm ~/.claude/skills/hypermark` (no `-r`), or `(Get-Item "$env:USERPROFILE\.claude\skills\hypermark").Delete()` in PowerShell.

### Try it

The fastest way to see what Hypermark does is to invoke it yourself, right now, from your agent:

```
/hypermark-last                   # annotate the agent's last reply
/hypermark-annotate notes.md      # annotate a local document
```


---

## How it works

### Annotate

```
You run /hypermark-annotate <file> or /hypermark-last
  -> Browser opens with the document or message
  -> Select text and comment
  -> Send feedback: returned to agent session
  -> Close without annotations: nothing sent
```

---


## Configuration

Settings are saved in cookies (not localStorage) because each invocation runs on a random port. You can also set options through environment variables or `~/.hypermark/config.json`.

| Variable | Description |
|---|---|
| `HYPERMARK_PORT` | Fixed port (default: random) |
| `HYPERMARK_BROWSER` | Custom browser to open Hypermark in |
| `HYPERMARK_DATA_DIR` | Base directory for Hypermark-managed files (feedback history, drafts, `config.json`). Default: `~/.hypermark`; if that directory doesn't exist and `$XDG_DATA_HOME` is set to an absolute path, `$XDG_DATA_HOME/hypermark` is used instead |

Hypermark-managed files live under `~/.hypermark` by default. It is a fresh
root: an existing `~/.plannotator` is never read, copied, moved or deleted, so
running both tools leaves each one's data where it is. Some UI preferences are
stored in functional browser cookies. To relocate the files (for example, for
an XDG-clean home):

```bash
export HYPERMARK_DATA_DIR=~/.local/share/hypermark
```

---

## Development

```bash
bun install

bun run dev:annotate   # Annotate server
```

### Build

```bash
bun run build          # same as build:annotate
bun run build:annotate # Single-file HTML for the annotate server
```

---

## License

Copyright 2025-2026 backnotprop

Hypermark is a fork of [backnotprop/plannotator](https://github.com/backnotprop/plannotator);
the upstream copyright above stands and both license files are unchanged.

Dual-licensed under [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option.

Contributions are dual-licensed under the same terms unless you explicitly state otherwise.
