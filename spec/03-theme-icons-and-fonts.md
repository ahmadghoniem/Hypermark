# 03 — Theme, icons, and fonts

**Status:** IMPLEMENTED (steps 1-6). `localFontPickerPolicy` remains an open user decision.

**Objective:** Give Hypermark a coherent, recoverable visual system without
changing retained review behavior or treating deferred visual choices as approval.

## Authority, start here, and boundaries

Read `spec/01-foundation-and-scope.md` first: its approval register, safety
rules, baseline recording, and test rule govern this slice. Then read these
verified paths before editing:

- `packages/ui/utils/themeRegistry.ts`, `packages/ui/utils/syntaxTheme.ts`,
  `packages/ui/theme.css`, and `packages/ui/themes/`
- `packages/review-editor/hooks/usePierreTheme.ts`,
  `packages/review-editor/index.css`, and `packages/review-editor/components/DiffViewer.tsx`
- `packages/ui/utils/diffFonts.ts`, `packages/ui/components/Settings.tsx`,
  `packages/core/favicon.ts`, and `packages/ui/components/ThemeTab.tsx`

This slice owns palette metadata/tokens, the synchronous Pierre theme bridge,
icon migration for Hypermark-owned controls, UI/code-font policy, and favicon
selection. It does **not** redesign comments or attachments (spec 05), remove
features/apps (spec 02), rename/release/install/storage (spec 06), or edit the
the fork prototype.

**After every numbered implementation step:** run `bun test`; record unrelated
baseline failures rather than weakening, deleting, or skipping their tests.
Before handoff, also run maintained typechecks and, for review UI changes,
`bun run --cwd apps/review build` **before** `bun run build:hook`.

## Locked scope and approvals

The original planned retained palette inventory is below. It is a migration
contract, **not final visual approval** (D7 remains deferred).

| ID | Planned mode support | Recovery/implementation note |
| --- | --- | --- |
| `pierre` | light + dark | New default/recovery palette. |
| `plannotator` | light + dark | One of the six retained palettes; preserve valid choices. It is not a temporary fallback to delete. |
| `catppuccin` | light + dark | Explicit tokens per half. |
| `ayu-dark` | dark only | Never invent light support; light resolves to Pierre Light. |
| `github` | light + dark | Explicit tokens per half. |
| `tokyo-night` | dark initially | Add light only after its full light tokens and syntax mapping exist. |
| `one-dark-pro` | dark only | Never invent light support; light resolves to Pierre Light. |

For every supported palette/mode, define these seven semantic groups explicitly:
**chrome/tree**, **diff bridge**, **syntax**, **terminal/ANSI**, **focus**,
**selection**, and **status/annotation** (including success, warning, and
destructive). They are palette data, not a generic fallback lookup. Preserve
corrupt/removed saved-value recovery **per light/dark half** to Pierre without
resetting unrelated preferences; missing installed fonts/glyphs retain CSS
fallbacks. A mode-restricted saved pair recovers the unsupported half only.

The Classic favicon is the sole offered/default favicon. Resolve legacy
`totman` cookie and server-config values to Classic before first paint, while
keeping old settings readable; do not add a one-choice picker or mutate old
installation data during this work.

Phosphor is selected for **Hypermark-owned app controls**: use direct named
imports, one documented default weight, and labels/tooltips for icon-only
controls. Pierre remains responsible for internal Diffs/Trees icons; do not
globally replace them. Do not reopen a Hugeicons choice. Specialized file-name
and file-type glyphs belong to spec 04's tree adapter decision.

No font CDN/network request may remain. Remove `loadDiffFont`'s remote-link
behavior and theme-specific font declarations, but retain shadow-DOM structural
font rules, edit/session font behavior, sizing, selection, and accessibility.
`localFontPickerPolicy` is **OPEN**: do not silently choose bundled fonts or a
manual-name entry UX. The bundled-fonts versus manual-family-name recommendation
is not approved. The safe interim behavior is a remembered existing family name
plus generic `sans-serif`/`monospace` fallback; local enumeration is explicit,
permission-gated, never launch-time, and may need re-consent on a new localhost
origin.

## Dependencies and implementation sequence

1. **Inventory and upgrade Diffs independently.** Re-read the actual manifests
   and `bun.lock` (baseline currently pins Diffs `1.3.2`); inspect published
   tarballs, types, integrity, licenses, peer dependencies, worker/edit adapter,
   split/unified rendering, scroll anchoring, and add-only/delete-only fixtures.
   The prior target is Diffs `1.4.1`, Trees `1.0.0-beta.6`, with compatible
   theme/theming packages, but verify availability/compatibility at execution;
   do not force overrides and do not describe a target as already installed.
   Acceptance: a dedicated, self-verifying Diffs-only change passes its focused
   regressions and preserves current review rendering before any redesign.

2. **Create one resolved theme descriptor.** Replace scattered palette/mode,
   syntax, chrome/tree, terminal, focus/selection/status resolution with one
   validated descriptor that commits atomically for light, dark, and system.
   Prove a supported dark/light pair before expanding the bridge. Seven explicit
   palette descriptors plus a small shared bridge are enough; do not build a
   general runtime theme framework.
   Distinguish actual dependencies: `@pierre/theme` supplies Pierre palette
   objects; `@pierre/theming` is the derivation library applied to an already
   Shiki-normalized theme. Keep Pierre's stock diff background/foreground,
   add/delete colors, and mix percentages; do not blanket-map `--diffs-*` to
   app chrome. Acceptance: cold first paint and rapid mode/palette changes
   cannot expose mixed old/new chrome, syntax, tree, terminal, or annotations.

3. **Bridge the descriptor before paint.** Replace the old asynchronous
   computed-style → rAF → React-state color mirror with inherited variables or
   a synchronous serialized bridge, isolated behind one version-sensitive
   adapter. Retain required shadow structural CSS, split sizing, editing,
   selection, and non-color layout measurements. Remove the universal theme
   color transition while preserving intentional hover/focus motion and reduced
   motion. Acceptance: single-file, all-files, hunk previews, and code fences
   show the same resolved theme with no stale winning async switch.

4. **Migrate palette/favicons safely.** Install complete tokens/assets and
   syntax mappings before exposing a palette; update registry, imports,
   pair migration, terminal presets, favicon handlers, and tests together.
   Remove unselected built-in palette entries and their unused imports/assets,
   not just their picker labels. Do not delete the six retained palettes or
   user-supplied themes as incidental cleanup. A smaller picker does not prove
   that the bundled Shiki grammar/theme payload became smaller.
   Use Classic as default and legacy Totman-to-Classic recovery. Acceptance:
   every supported half renders valid semantic colors; invalid IDs and
   unsupported halves recover only that half to Pierre; no initial invalid icon
   or palette flash occurs.

5. **Migrate app chrome icons and eliminate remote fonts.** Add the audited
   Phosphor dependency only where retained app controls need it, migrate direct
   Lucide imports after their owning surface is retained, and measure the built
   selected-icon output. Remove CDN stylesheet injection; preserve saved font
   values and safe generic fallback. Acceptance: network inspection finds no
   font-CDN request, app controls retain accessible names, Pierre internals are
   untouched, and unavailable saved fonts do not shift/break diff navigation.
   Keep existing bundled local fonts unless their removal is separately approved.
   Once font UX is approved, apply it to both UI and code families; enumeration
   is opt-in/cached/deduplicated, never uploaded, and only a selected family is
   persisted. Do not infer a monospace classification from `FontData`, which
   has no standardized monospace flag, or redistribute Windows font files.

6. **Obtain visual sign-off before cleanup.** Light/dark polish and final
   palette selection are deferred, so inventory every temporary legacy palette
   or compatibility path. At final visual approval, explicitly remind the user
   to review each retained palette/mode, syntax, terminal, tree, annotations,
   contrast, first paint, and rapid switching; **ask for confirmation before
   deleting** temporary paths. After confirmation only, delete them and rerun
   the supported-theme matrix—no temporary palette/runtime fallback path may
   remain permanently after that approved cleanup. Never delete
   corrupted-preference or unavailable-font recovery paths.

## Failure cases and evidence

- Test `light`, `dark`, and system changes; corrupted/removed IDs; a
  mode-restricted half; Tokyo Night before/after any future light support; and
  rapid changes that formerly let stale async colors win.
- Cover code fences, hunk previews, single/all-files virtualized diffs, tree,
  terminal ANSI, focus/selection, status/annotations, split/unified, and edit
  sessions. Inspect shadow-root rendering, console, and network errors.
- In real Windows Chrome/Edge, record local-font enumeration grant, deny,
  unsupported API, a changed localhost port, a removed remembered family, and
  font-metric/scroll stability. This environment cannot substitute for that
  gate; record any gap precisely.
- Capture safe before/after screenshots and a short mode-switch recording for
  material UI changes. A build or typecheck alone is not visual evidence.

## Completion handoff

Report changed paths, actual resolved Pierre package versions (or why the
prior target was unsafe), palette-mode matrix, temporary paths still awaiting
approval, icon bundle measurement, no-CDN network evidence, tests/typechecks,
ordered review→hook build, and the outstanding `localFontPickerPolicy` choice.
Do not claim final palette/light-dark approval, storage migration, or total
offline operation without their separate approvals.
