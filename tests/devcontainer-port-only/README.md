# Hypermark Test - Port Only (Expected to Fail)

This fixture reproduces a common misconfiguration in Docker/devcontainer
environments: setting only `HYPERMARK_PORT` without `HYPERMARK_REMOTE`.

## The Problem

Users in Docker/devcontainer environments often set:
```bash
HYPERMARK_PORT=9999
```

But forget to set:
```bash
HYPERMARK_REMOTE=1
```

Without `HYPERMARK_REMOTE=1` (and no `SSH_TTY`/`SSH_CONNECTION` in the
environment), Hypermark will:
1. ✅ Use port 9999
2. ❌ Still try to open a browser (fails silently or hangs)

## Expected Behavior

When you trigger a plan in this devcontainer:
- Server starts on port 9999
- It attempts to open a browser (fails)
- No feedback to user
- Appears to hang

## The Fix

Both environment variables are needed:
```bash
HYPERMARK_REMOTE=1
HYPERMARK_PORT=9999
```

## Testing

1. Open this folder in VS Code
2. Reopen in Container
3. Install the Claude Code plugin (`/plugin marketplace add ahmadghoniem/Hypermark`,
   then `/plugin install hypermark@hypermark`)
4. Ask Claude Code for a plan and let it reach `ExitPlanMode`
5. Observe the hang/failure — nothing on port 9999
6. Add `HYPERMARK_REMOTE=1` and repeat: the session is reachable on the
   forwarded port instead
