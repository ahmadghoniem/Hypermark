# Hypermark gutter-comment prototype

The chosen direction: gutter preview → **Edit** → the full composer in the same popover. There are no margin notes, duplicate right-side editor, author labels, timestamps, or comment ordinal counters. Unified/split stays selectable; red deletion and green addition fills always remain.

Hover previews; clicking pins the popover. Edit accepts text and multiple compact image tiles with remove controls. Save updates the in-memory comment; Cancel restores its previous text and images. Escape, outside dismissal, and switching anchors preserve unfinished drafts for reopening. The plus on line 34 exercises new and image-only comments. No double-click gesture is required.

This is a **synthetic design prototype**, not the product renderer, upload transport, or persistence implementation. Selected files stay in browser memory; reload resets everything. Light/dark remains a rough visual check, not seven-palette approval. The native `/btw` decision is unchanged and no Claude transport is represented here.

## Icons

- Hypermark controls: unmodified regular-weight SVGs from [`@phosphor-icons/core@2.1.1`](https://github.com/phosphor-icons/core), MIT. The downloaded archive was checked against its npm integrity hash. License: `assets/phosphor/LICENSE`. The production React implementation will use the selected Phosphor library, not this static fixture adapter.
- Diff/tree component controls retain selected [`@pierre/icons@0.7.1`](https://github.com/pierrecomputer/icons) SVGs, Apache-2.0. License: `assets/pierre-icons/LICENSE`.
- Dark/light base surface values reference `@pierre/theme@2.0.0`; other styling is authored for the prototype and is not evidence of renderer parity.

## Development and checks

Managed Preview uses `bun --hot adr/prototypes/hypermark-design/server.ts` from `.hoplite/settings.json`. No dependency installation is required. The dev server exposes only allowlisted synthetic assets/scripts; it does not expose repository files or an upload API.

Run the dependency-free prototype model tests with:

```sh
node --test adr/prototypes/hypermark-design/comment-model.test.mjs
bun build adr/prototypes/hypermark-design/server.ts --target=bun --outfile=/tmp/hypermark-design-server-check.js
```

These checks do not replace the product's Bun suite or integration tests. Browser checks cover edit/save/cancel, image selection/removal, image-only new comments, keyboard dismissal/reopening, hover persistence, split/unified rendering, and absence of the rejected UI.
