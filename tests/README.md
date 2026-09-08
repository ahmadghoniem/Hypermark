# Tests

This directory contains manual testing scripts for Hypermark.

## Manual Browser UI Smokes (`tests/manual/local/`)

These are local-only scripts for launching Hypermark UI flows with fixture data so you can manually verify them in a browser. They are not automated CI tests.

**Plan review UI smoke tests:**

```bash
./tests/manual/local/test-hook.sh          # Claude Code simulation
```

**Code review UI:**

```bash
./tests/manual/local/test-worktree-review.sh  # Worktree support test (creates sandbox with 4 worktrees)
```

See [UI-TESTING.md](../docs/UI-TESTING.md) for detailed UI testing documentation.

The end-to-end, user-centered Vim controls matrix lives in
[manual/vim-ux-smoke.md](manual/vim-ux-smoke.md). It covers real Markdown and
raw-HTML navigation, selection, annotation, focus recovery, HUD behavior, and
native-control compatibility.

## Integration & Utility Tests (`manual/local/`)

These scripts test integrations, releases, and provide utilities.

**Binary release testing:**

```bash
./tests/manual/local/test-binary.sh        # Test installed binary from ~/.local/bin/
```

Tests the installed `hypermark` binary to verify releases work correctly.

**Bulk plan testing (Obsidian integration):**

```bash
./tests/manual/local/test-bulk-plans.sh    # Iterate through ~/.claude/plans/
```

Opens each `.md` file from `~/.claude/plans/` in Hypermark. Great for testing Obsidian integration with multiple
plans.

Tips:

- Set `HYPERMARK_BROWSER=/usr/bin/true` when you want to drive the opened plan-review session with Playwright
  instead of auto-opening a browser.
- The validated workflow is: run the script in one terminal, then point Playwright at the printed session URL from a
  second terminal.

**Obsidian utility:**

```bash
./tests/manual/local/fix-vault-links.sh /path/to/vault/hypermark
```

Adds Obsidian backlinks (`[[Hypermark Plans]]`) to existing plan files in your vault.

## SSH Remote Testing (`manual/ssh/`)

Tests SSH session detection and port forwarding for remote development scenarios.

```bash
cd tests/manual/ssh/
docker-compose up -d
./test-ssh.sh
```

See [manual/ssh/DOCKER_SSH_TEST.md](manual/ssh/DOCKER_SSH_TEST.md) for detailed setup instructions.
