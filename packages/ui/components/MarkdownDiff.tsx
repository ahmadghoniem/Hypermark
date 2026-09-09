import React from 'react';
import {
  MarkdownDiff as PackagedMarkdownDiff,
  type MarkdownDiffHandle,
  type MarkdownDiffProps as PackagedMarkdownDiffProps,
} from '@plannotator/markdown-editor';
import '@plannotator/markdown-editor/themes/plannotator.css';
import { useTheme } from './ThemeProvider';

export type { MarkdownDiffHandle };

/* @hypermark/ui is the single supported contract for hosts — do NOT import
   AtomicDiffEditor or @plannotator/atomic-editor directly (both are outside
   the import allowlist). Extension builders (wikiLinks, slashCommands,
   selectionToolbar) are re-exported from ./MarkdownEditor; build them there
   and pass the result through the `extensions` prop below — the frozen diff
   view composes them the same way the editor does. */

export interface MarkdownDiffProps
  extends Omit<PackagedMarkdownDiffProps, 'mode' | 'cardClassName'> {
  /** Theme color mode. Defaults to the ThemeProvider's resolved mode (Hypermark
      passes nothing); a host without ThemeProvider can supply it directly. */
  mode?: PackagedMarkdownDiffProps['mode'];
}

/* Theme-bridging shim around @plannotator/markdown-editor's MarkdownDiff — the
   frozen two-revision comparison surface (newer revision as the real document,
   deletions projected struck-through in place). Same pattern as the
   MarkdownEditor shim: resolve the color mode from ThemeProvider beneath the
   host's provider and pass it down as a prop.

   The byte contract lives on `editorHandleRef`: getMarkdown() returns the
   exact `modifiedMarkdown` supplied, getOriginalMarkdown() the exact
   `originalMarkdown` — both byte-identical to the inputs. The surface itself
   is frozen: document-changing transactions are rejected at the state and
   view boundaries, and the content DOM is contenteditable="false".

   `extensions` follows the editor's calling convention: CAPTURED ONCE per
   mounted comparison (keyed on `documentId` + both document strings) — pass a
   stable array and feed changing data through callbacks that close over live
   state. Build extensions against YOUR copy of the `@codemirror/*` packages;
   two live copies of `@codemirror/state` break the view. */
export const MarkdownDiff: React.FC<MarkdownDiffProps> = ({ mode, ...props }) => {
  const { resolvedMode } = useTheme();
  return (
    <PackagedMarkdownDiff
      {...props}
      mode={mode ?? resolvedMode}
    />
  );
};
