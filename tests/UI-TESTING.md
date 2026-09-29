# UI Testing Guide

This guide helps you test UI changes in Hypermark. Whether you're adding new features or fixing bugs, follow these
steps to ensure your changes work correctly.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Development Workflow](#development-workflow)
3. [Quick Testing Guide](#quick-testing-guide)
4. [Debugging Common Issues](#debugging-common-issues)
5. [Decision Control Manual Checklist](#decision-control-manual-checklist)

---

## Development Setup

### Prerequisites

- **Bun** - JavaScript runtime and package manager ([install](https://bun.sh))
- **Git** - Version control
- **Modern browser** - Chrome, Firefox, Safari, or Edge (latest version)

### Installation

```bash
git clone https://github.com/ahmadghoniem/Hypermark.git
cd Hypermark
bun install
```

### Project Structure

The project structure:

- **`src/cli/`** - `hypermark` CLI implementation
- **`src/server/`** - Server implementation (annotate/review servers)
- **`src/shared/`** - Shared code and types
- **`src/ui/`** - Reusable React components, hooks, utilities
- **`src/annotate/`** - Annotate application logic
- **`src/review/`** - Code review application logic
- **`plugin/`** - Claude Code plugin
- **`skills/`** - Agent skills (Claude launchers, core, extra)

### First Build Test

Verify your setup works:

```bash
bun run build:annotate
```

If successful, you'll see `dist/annotate/index.html` created.

---

## Development Workflow

### Making UI Changes

**Shared components** (used by both annotate and review UIs):

- Location: `src/ui/components/`
- Examples: `TableOfContents.tsx`, `AnnotationToolbar.tsx`, `Viewer.tsx`

**Annotate editor** (markdown/HTML annotation UI):

- Location: `src/annotate/App.tsx`
- Main application logic for annotate sessions

**Code review editor** (code review UI):

- Location: `src/review/App.tsx`
- Main application logic for code review

**Utilities and hooks**:

- Location: `src/ui/utils/`, `src/ui/hooks/`
- Examples: `parser.ts`, `useActiveSection.ts`, `annotationHelpers.ts`

### Development Servers (Hot Reload)

For rapid iteration, use development servers with hot reload:

```bash
# Annotate UI (most common)
bun run dev:annotate
# Opens http://localhost:5173

# Code review UI
bun run dev:review
# Opens http://localhost:5174
```

**Note:** Development servers run standalone without plugin integration. Changes appear instantly without rebuild.

### Building for Testing

When you're ready to test with actual plugin integration:

```bash
# Build annotate UI
bun run build:annotate
# Output: dist/annotate/index.html

# Build code review UI
bun run build:review
# Output: dist/review/index.html

# Build everything
bun run build
# Runs build:review && build:annotate
```

---

## Quick Testing Guide

### Running a Real Session

After a build, run the CLI from source against a fixture or a repo:

```bash
# Annotate UI
bun run src/cli/index.ts annotate tests/test-fixtures/<fixture>.md

# Code review UI (inside any git repo)
bun run src/cli/index.ts review
```

### Manual Testing Workflow

1. **Make your changes** in `src/ui/` or `src/annotate/`

2. **Choose testing method:**
   - **Option A:** Dev server (fast iteration)
     ```bash
     bun run dev:annotate
     ```
   - **Option B:** Build and run a real session (integration test)
     ```bash
     bun run build:annotate && bun run src/cli/index.ts annotate tests/test-fixtures/<fixture>.md
     ```

3. **Verify your changes** work correctly

4. **Check browser console** for errors:
   - Open DevTools (F12)
   - Console tab
   - Look for red errors

6. **Test on multiple browsers** (Chrome, Firefox, Safari, Edge)

---

## Debugging Common Issues

### Browser DevTools

Open DevTools to inspect and debug:

- **Mac:** Cmd+Option+I
- **Windows/Linux:** F12 or Ctrl+Shift+I

**Useful tabs:**

- **Console:** JavaScript errors and logs
- **Network:** Failed requests, slow resources
- **Elements:** Inspect DOM and CSS
- **Performance:** Profile rendering performance
- **Memory:** Check for memory leaks

**Recommended extensions:**

- React DevTools - Inspect component tree and props
- Redux DevTools - If using Redux (not currently)

### Common Issues & Solutions

#### Port Already in Use

**Error:**

```
Error: listen EADDRINUSE: address already in use :::5173
```

**Solution:** Kill the process using that port

**macOS/Linux:**

```bash
lsof -ti:5173 | xargs kill -9
```

**Windows:**

```powershell
netstat -ano | findstr :5173
taskkill /PID <pid> /F
```

#### Hot Reload Not Working

**Symptom:** Changes don't appear in browser after saving file

**Solutions:**

1. Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
2. Restart dev server: Ctrl+C then `bun run dev:annotate`
3. Clear browser cache
4. Check terminal for errors

#### CSS Not Applying

**Symptom:** Tailwind classes not working or styles look wrong

**Solutions:**

1. Check for typos in class names (Tailwind is strict)
2. Verify Tailwind config includes your file paths
3. Try rebuilding: `bun run build:annotate`
4. Check if another CSS rule is overriding (use DevTools Elements tab)
5. Ensure you're using correct responsive prefixes (`sm:`, `md:`, `lg:`)

#### TypeScript/LSP Errors

**Symptom:** Editor shows red squiggles, but code works

**Important:** Many LSP errors in this codebase are warnings, not blockers.

**Solutions:**

1. Focus on fixing errors in files YOU changed
2. Run `bun run build` to see actual compilation errors
3. Existing files may have warnings - that's okay
4. If new errors appear in your files, fix them

**Common LSP warnings you can ignore:**

- "Alternative text title element cannot be empty" (SVG icons)
- "This hook does not specify its dependency" (known)
- "Provide an explicit type prop for button" (existing code)

#### Build Fails

**Error:**

```
Build failed with X errors
```

**Solutions:**

1. Read the error message carefully (shows file and line)
2. Check for syntax errors in your changes
3. Verify imports are correct
4. Run `bun install` to ensure dependencies are up to date
5. Check that file paths are correct (case-sensitive on Linux/macOS)

### Viewing Logs

**Server logs:**

- Check terminal where `bun` is running
- Server prints requests and errors
- Hook output shows approve/deny decisions

**Browser logs:**

- DevTools → Console tab
- Network tab shows request/response details
- Preserve log checkbox keeps logs across page loads

**Test script output:**

- Test scripts print to terminal
- Shows build output, server startup, and hook decisions
- Use `echo` statements to add debug output to scripts

---

## Decision Control Manual Checklist

Not CI. Every annotate surface and the review header share one adaptive split control
(`DecisionControl`): a positive primary (`All good` / `Approve` / `Send Feedback · n`) plus a caret
menu with the alternate decisions and the in-place note composer. Run each flow in both states —
zero annotations and n annotations — on desktop.

1. **Annotate, single file** (`hypermark annotate notes.md`). At zero the primary reads `All good`;
   clicking it submits the "no feedback" record and the terminal prints it. Caret →
   `Done with a note…` opens the composer in place: `Enter` inserts a newline, `Mod+Enter`
   submits, `Escape` steps back to the menu keeping the draft. Add an annotation: the primary
   flips to `Send Feedback · 1`.
2. **Annotate, gate mode** (`hypermark annotate notes.md --gate --json`). The zero-state
   primary is `Approve` and posts `/api/approve` (stdout records `"approved"`; with
   `--require-approval` only approval exits `0`); `Request changes…` records an annotated
   decision. `Approve with a note…` / `Approve with notes` appear only when the session
   advertises approval-notes support.
3. **Annotate last message** (`hypermark last`). Same control, same states.
4. **HTML annotate** (`hypermark annotate page.html`). Open the caret menu, then click the framed page: the popover
   dismisses (iframe focus is the dismissal signal — there is no parent pointerdown).
5. **Review, agent mode** (`hypermark review`). `Approve` at zero, `Send Feedback · n` after
   annotating. With the composer open, `Escape` returns to the menu
   and does NOT collapse the file tree or close the sidebar; a second `Escape` closes the menu;
   a third runs the app's own ladder.
6. **Sidebar general comment** (review). "+ General comment" is reachable at zero annotations
   (empty state) and from the General section header; creating one flips the header control to
   `Send Feedback · 1`.

## Need Help?

If you're stuck:

1. Check this guide again
2. Review existing code for patterns
3. Look at `CLAUDE.md` for architecture details
4. Check `tests/README.md` for test script details
5. Open an issue on GitHub with:
   - What you're trying to do
   - What you've tried
   - Error messages (full text)
   - Browser and OS version
