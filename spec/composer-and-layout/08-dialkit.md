# 08 — DialKit: live design controls in dev

Wave 0 — runs alone and merges before wave 1 is cut, because 01 imports
`useDialKit`.

[DialKit](https://github.com/joshpuckett/dialkit) (`dialkit@2.0.2`) renders a
floating panel of sliders and selects bound to values in components. Specs
that expose values call `useDialKit(panelName, config)`; this spec only
installs the library and mounts its panel.

- `useDialKit` returns the default values when no panel is mounted.
- Every registered panel appears as its own section in the one root, so each
  spec gets its own section instead of one shared list of controls.
- `<DialRoot />` renders nothing in production builds (it checks
  `NODE_ENV` / Vite `MODE`), so users never see the panel.
- The panel's **Copy** button puts the current values on the clipboard. Paste
  them to Claude to bake them back into constants and remove DialKit
  (a later spec, once the values are settled).

## Owned files

- `packages/ui/package.json`
- `bun.lock`
- `apps/hook/index.tsx`
- `apps/review/index.tsx`

## Edits

1. Install, from the repo root:
   ```
   bun add --cwd packages/ui dialkit@2.0.2 motion@^12
   ```
   `motion` is an optional peer of DialKit, but its React build imports it.
2. `apps/hook/index.tsx`:
   - Add after the `'@hypermark/editor/styles'` import:
     ```ts
     import { DialRoot } from 'dialkit';
     import 'dialkit/styles.css';
     ```
   - In `root.render`, render the panel next to the app:
     ```tsx
     <React.StrictMode>
       <App />
       <DialRoot position="bottom-left" />
     </React.StrictMode>
     ```
3. `apps/review/index.tsx`: the same two imports after
   `'@hypermark/review-editor/styles'`, and `<DialRoot position="bottom-left" />`
   as the last child of `<React.StrictMode>` (after `</ReviewWorkerPoolProvider>`).

`bottom-left` keeps the panel away from the annotation panel and the message
rail, which sit on the right.

## The convention the other specs follow

One panel per spec, named after the spec, with a stable id and its values kept
across reloads:

```tsx
const dials = useDialKit('01 · Composer chrome', {
  /* controls */
}, { id: 'cl-01', persist: true });
```

- The name is the section heading in the panel, so it says which spec's
  values are being changed.
- `id` is `cl-<spec number>`. It keeps a panel's values when its component
  unmounts, and is the `localStorage` key (`dialkit:cl-01`).
- A spec whose controls live in more than one component registers one panel
  per component and adds the component to the name
  (`02 · Attachments — stack`).

## Do not

- Do not add any `useDialKit` calls; the component specs own those.
- Do not pass `productionEnabled`.

## Completion

- `bun run typecheck && bun run typecheck:editors` green.
- `bun run build:hook` succeeds.
- `bun run dev:hook`: the app loads with no console errors. The DialKit panel
  is empty or hidden until a component registers a panel (spec 01).
