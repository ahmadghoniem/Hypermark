<p align="center">
  <img src=".github/assets/banner.webp" alt="Hypermark" width="640" />
</p>



<p align="center">
  <strong>Everything you need to annotate and stay in the loop with your agents</strong><br/>
  <strong>Markdown Review • Code Review • HTML Artifacts</strong><br/>
  <sub>Annotate plans, specs, markdown, and HTML before implementation. Review diffs and PRs. Send feedback to your agent.</sub>
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

**It plugs directly into Claude Code** through its hooks and skills. When the agent proposes a plan, html, or finishes writing code, the work opens in your browser and you mark it up, comment, and send feedback directly to the agent for it to act on it.

<table>
<tr>
<td width="40%" valign="middle">

### Review documents, plans, and agent messages

Annotate plans, specs, messages, html, then send the feedback to your agent. 

<p><strong>Demo:</strong> <a href="https://youtu.be/XqFun9XCXPw">Plan review with Pi</a></p>

</td>
<td width="60%">

<img src=".github/assets/annotate.webp" alt="Annotate UI with inline annotations" width="100%" />

</td>
</tr>
<tr>
<td width="40%" valign="middle">

### Code Review

Review local changes or remote PRs. Comment on diffs, suggest code. Your comments go back to the agent. Works with Git, GitButler, Jujutsu (`jj`), Perforce (`p4`), GitHub, and GitLab.

</td>
<td width="60%">

<img src=".github/assets/review.webp" alt="Code review with file tree and side-by-side diff" width="100%" />

</td>
</tr>
</table>

<p align="center">
  <sub><strong>AI built in:</strong> ask AI about anything you're reviewing,<br/>or launch AI reviews that post comments to the diff.</sub>
</p>

## Annotate HTML Artifacts

<p align="center">
  <img src=".github/assets/html.webp" alt="Annotating a rendered HTML artifact" width="720" />
</p>

## Commands


### Annotate

```
/hypermark-annotate README.md                  # Local markdown file
/hypermark-annotate src/                       # Browse and annotate files in a folder
/hypermark-annotate https://docs.rs/…          # Fetch and annotate any URL
/hypermark-annotate report.html --render-html  # Render HTML as-is instead of converting
/hypermark-last                                # Annotate the agent's last message
```

Need a realistic document to try? Any markdown file works — try one of your own specs.

### Code review

```
/hypermark-review                    # Review uncommitted changes
hypermark review --gitbutler         # Review an active GitButler workspace
```

GitButler users can review the whole workspace, one stack, or one branch layer.

### Plan mode

No command needed. Plan mode is wired in through each harness's hooks. Any time your agent creates a plan, the markdown review surface opens for you.

### CLI

```
hypermark sessions                   # List active Hypermark sessions
hypermark sessions --open 1          # Reopen a session in the browser
hypermark archive                    # Browse saved plan decisions read-only
```

---

## Privacy and network behavior

Hypermark does not collect usage telemetry or analytics. Plans, diffs, annotations, drafts, history, and configuration stay local by default.

Each plan review, annotate, archive, and code-review app surface checks GitHub for the latest Hypermark release when it loads. This sends no plan or review content and gives the Hypermark project owner no usage analytics, although GitHub receives an ordinary request. There is currently no opt-out setting. Local Git code review can also query the configured `origin` with `git ls-remote` to detect the default branch and a stale baseline; it does not send the local diff.

Content leaves the local workflow only when a network feature needs it:

- URL annotation fetches the requested site, through Jina Reader by default for public pages or directly when Jina is disabled or unavailable.
- GitHub and GitLab review uses your authenticated CLI and Git remote to retrieve PR or MR data.

There is no link sharing, no paste service and no hosted counterpart: this fork
removed all three, so nothing is uploaded anywhere.

---

## Install

The installer puts the `hypermark` binary on your PATH and configures Claude Code's hooks, skills and slash commands:

```bash
# macOS / Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.ps1 | iex
```

The installer downloads the binary from GitHub Releases. A full install also contacts GitHub for release resolution and the skills checkout, Ataraxy-Labs/sem for the optional `sem` sidecar, and npm for the extra skills or the managed agent-terminal runtime. Pinning `--version` skips only GitHub API release resolution, not the release download.

Want just the binary and nothing else? Pass `--minimal` (or export `HYPERMARK_MINIMAL=1`) to install only the `hypermark` binary to `~/.local/bin`, skipping every skill, hook, slash command and hook config:

```bash
curl -fsSL https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.sh | bash -s -- --minimal
```

Then finish the Claude Code step:

```
/plugin marketplace add ahmadghoniem/Hypermark
/plugin install hypermark@hypermark
```

Restart Claude Code. See [`apps/hook/README.md`](apps/hook/README.md) for
details, and `scripts/install.sh --help` for every installer flag.

### Uninstall

The safe default removes recognized Hypermark-installed components and keeps
your local plans, history, drafts, guides, and settings:

```bash
hypermark uninstall
```

Use `--purge` for a full removal of known local Hypermark data as well:

```bash
hypermark uninstall --purge
```

Purge requires typing `purge` at the prompt and explains that the data is
local-only: it is not stored on a Hypermark server and cannot be recovered.
For automation, pass `--yes` (or `-y`); non-interactive removal refuses to run
without it. Use `--dry-run` to preview recognized work without making changes.
If a broken or unavailable host prevents safe cleanup, the command names the
blocking plugin manager or configuration, gives exact manual cleanup
instructions, and stops before deleting the binary. Complete that cleanup and rerun uninstall.
These mechanics keep the ordinary confirmation default-negative, make the
irreversible outcome require a stronger explicit word, and still give package
managers and scripts a conventional non-interactive flag.

The command covers the conventional macOS, Linux, WSL, and Windows binary
locations; the managed `sem` sidecar, agent-terminal and call-flow runtimes;
the skills it installed under `~/.claude/skills` and `~/.agents/skills`; the
Claude Code commands it replaced with skills; its managed hooks in Claude's
`settings.json`; and the Claude Code plugin through the `claude` CLI. It
removes nothing else — an existing Plannotator installation's data, skills,
commands and agent homes are another product's files and are left untouched.
Strict JSON updates preserve the file's indentation, line endings, and
trailing-newline style. Custom
or unrecognized files, separately installed optional skills, project-local
integrations, external plan-save locations, and invalid configs are preserved
(malformed host config is a fail-safe error). If cleanup reports an error,
the CLI remains available for a safe retry, and its Windows PATH entry is
retained or restored when possible. If PATH restoration itself fails, the
output gives the full CLI path for retry and asks for manual PATH repair.
For safety, purge refuses filesystem roots, the home directory, the shared
temporary directory, symlinked data directories, and non-directory data paths.
Existing paths are compared by filesystem identity, so case aliases, symlinks,
hardlinks, and bind mounts cannot bypass the root/home/ancestor checks.
That identity and every containment guard are revalidated after awaited host
commands, immediately before the synchronous data-removal block; a replaced
data directory is refused without touching either the old or replacement data.
If your dedicated data directory is symlinked, point `HYPERMARK_DATA_DIR` at
its resolved target and retry.

<details>
<summary>Claude Code: manual hook setup (without the plugin system)</summary>

Add to `~/.claude/settings.json`:

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

</details>

<details>
<summary>Pin a specific version</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.sh | bash -s -- --version vX.Y.Z
```

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.ps1))) -Version vX.Y.Z
```

</details>

### Try it

The fastest way to see what Hypermark does is to invoke it yourself, right now, from your agent:

```
/hypermark-last                   # annotate the agent's last reply
/hypermark-review                 # review your current diff, PR-style
/hypermark-annotate report.html   # annotate any file, folder, or URL
```


Plan review needs no command at all. The next time your agent proposes a plan, it opens in your browser automatically.

---

## How it works

### Plan review

```
Agent calls ExitPlanMode
  -> PermissionRequest hook fires
  -> Local server reads plan from hook input
  -> Browser opens with review UI
  -> You annotate and approve/deny
  -> Approve: agent proceeds
  -> Deny: structured feedback sent to agent
  -> Agent revises, plan diff shows what changed
```

### Code review

```
You run /hypermark-review
  -> git diff captures changes (or PR fetched by URL)
  -> Browser opens with diff viewer
  -> Annotate lines, stage/unstage files
  -> Send feedback: returned to agent session
  -> Approve: "LGTM" sent
```

---

## Integrations

**Obsidian**: Auto-save approved plans to a vault with YAML frontmatter, tags from the plan title, and backlinks for graph connectivity. Configure in Hypermark's Settings panel.

**Bear**: Save plans as Bear notes with nested tags and project metadata.

**GitHub / GitLab**: Pass any PR or MR URL to `/hypermark-review` and review it with the full diff viewer, annotations, and file tree.

---

## Security

Every released binary ships with a SHA256 sidecar. [SLSA provenance](https://slsa.dev/) attestations are available from v0.17.2. The current release workflow also attaches a CycloneDX JSON SBOM, evaluates it with a fresh Grype database before anything is attested or published, and creates a GitHub/Sigstore SBOM attestation for the shipped binaries and npm tarballs.

The SBOM is intentionally labeled as a release-wide Syft inventory of the monorepo's locked build inputs and dependencies. It is not an exact per-binary runtime inventory: Bun standalone executables do not expose their bundled JavaScript package metadata to Syft. The SBOM verification commands are below.

The release gate rejects scanner-side ignored matches and treats unknown applicability conservatively as runtime when evaluating CISA KEV and fixable Critical findings. Its explicit Grype configuration, complete JSON results, database status, and repository policy decision remain available as workflow evidence.

To verify a released Linux x64 binary, its existing provenance, and the new SBOM evidence directly:

```bash
tag=vX.Y.Z
version="${tag#v}"
mkdir -p /tmp/hypermark-release-verify
gh release download "$tag" --repo ahmadghoniem/Hypermark \
  --pattern 'hypermark-linux-x64*' \
  --pattern "hypermark-${version}-release-sbom.cdx.json*" \
  --dir /tmp/hypermark-release-verify

(cd /tmp/hypermark-release-verify && sha256sum --check hypermark-linux-x64.sha256)
(cd /tmp/hypermark-release-verify && sha256sum --check "hypermark-${version}-release-sbom.cdx.json.sha256")

gh attestation verify /tmp/hypermark-release-verify/hypermark-linux-x64 \
  --repo ahmadghoniem/Hypermark --source-ref "refs/tags/$tag" \
  --signer-workflow ahmadghoniem/Hypermark/.github/workflows/release.yml \
  --predicate-type https://slsa.dev/provenance/v1

gh attestation verify /tmp/hypermark-release-verify/hypermark-linux-x64 \
  --repo ahmadghoniem/Hypermark --source-ref "refs/tags/$tag" \
  --signer-workflow ahmadghoniem/Hypermark/.github/workflows/release.yml \
  --predicate-type https://cyclonedx.org/bom
```

These are separate claims over the same artifact digest: provenance identifies its builder/source/workflow, while the CycloneDX predicate describes the release-wide inventory. The release runbook also canonicalizes the downloaded SBOM and attested predicate with `jq -S` and compares them.

To verify on install:

```bash
curl -fsSL https://raw.githubusercontent.com/ahmadghoniem/Hypermark/main/scripts/install.sh | bash -s -- --verify-attestation
```

Requires the `gh` CLI, but no login: the installer fetches the attestation bundle from GitHub's public attestations API and verifies it with `gh attestation verify --bundle` (the extraction needs node, python3, or jq on PATH; gh's authenticated fetch is the fallback). Can also be set persistently in `~/.hypermark/config.json`:

```json
{ "verifyAttestation": true }
```

Installer verification remains opt-in and verifies SLSA build provenance; normal installation does not require `gh`.

---

## Configuration

Settings are saved in cookies (not localStorage) because each hook invocation runs on a random port. You can also set options through environment variables or `~/.hypermark/config.json`.

### Optional Vim controls

Plan and annotate views offer a default-off **Vim controls** profile under
**Settings → Vim**. Once enabled, focus the document and use `j` / `k`
to move one rendered block at a time. After `l` refines into a semantic level,
`j` / `k` move among sibling rows, cells, or inline targets; `h` moves back to
the containing target. Refining past the deepest target enters text. `v`
starts characterwise Visual selection and
`V` selects whole blocks. `Space` opens the normal annotation toolbar; `c`,
`d`, `m`, and `t` select comment, redline, markup, and label actions. The same
semantic target graph drives pointer Pinpoint and keyboard navigation. Press
`?` in the document for the contextual key reference. Inputs, dialogs,
editors, `Tab`, and all pointer interactions retain their native behavior.
The document takes focus automatically when the page is otherwise neutral;
press `Escape` from app chrome to return to it without clicking.
An additional default-off **Vim HUD** toggle appears beneath Vim controls. It
uses the product-demo styling for the live target reticle and navigation
context. Its bottom-right **Key panel** is independently hideable while the
reticle remains active; `?` still opens the complete key map on demand. The
panel shows recent handled keys, the current block/line/word/Visual phase, and
the command meaning without capturing text typed into comments or other
controls.
| Variable | Description |
|---|---|
| `HYPERMARK_PORT` | Fixed port (default: random) |
| `HYPERMARK_BROWSER` | Custom browser to open plans in |
| `HYPERMARK_ORIGIN` | Override agent detection. Only `claude-code` is installed by this fork |
| `HYPERMARK_JINA` | `0`/`false` to disable Jina Reader for URL annotation |
| `JINA_API_KEY` | Jina Reader API key for higher rate limits |
| `HYPERMARK_DATA_DIR` | Base directory for Hypermark-managed files (plans, history, drafts, `config.json`). Default: `~/.hypermark`; if that directory doesn't exist and `$XDG_DATA_HOME` is set to an absolute path, `$XDG_DATA_HOME/hypermark` is used instead |

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

bun run dev:hook       # Plan review server
bun run dev:review     # Code review editor
```

### Build

```bash
bun run build          # build:review then build:hook, in that order
bun run build:review   # Code review editor
bun run build:hook     # Single-file HTML for the hook server
```

Build order matters. The hook build copies pre-built HTML from `apps/review/dist/`. If you change UI code in `packages/ui/`, `packages/editor/`, or `packages/review-editor/`, rebuild the review app first:

```bash
bun run --cwd apps/review build && bun run build:hook
```

Test the plugin locally:

```bash
claude --plugin-dir ./apps/hook
```

Full binary build:

```bash
bun run --cwd apps/review build && bun run build:hook && \
  bun build apps/hook/server/index.ts --compile --outfile ~/.local/bin/hypermark
```


---

## License

Copyright 2025-2026 backnotprop

Hypermark is a fork of [backnotprop/plannotator](https://github.com/backnotprop/plannotator);
the upstream copyright above stands and both license files are unchanged.

Dual-licensed under [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option.

Contributions are dual-licensed under the same terms unless you explicitly state otherwise.
