/**
 * Sample data for the canvas.
 */
import { AnnotationType, type Annotation, type ImageAttachment } from '@/ui/types';
import type { PickerMessage } from '@/ui/components/MessageRail';
import type { AnnotationMessageGroup } from '@/ui/components/AnnotationPanel';
import type { VersionEntry, VersionInfo } from '@/ui/hooks/usePlanDiff';

const NOW = Date.now();
const ago = (minutes: number) => NOW - minutes * 60_000;

export const QUOTE = 'The session is still open and the link text runs into someCode() then wraps onto the next line';

/** The dev mock API draws a placeholder for any `/api/image` path. */
export const IMAGES: ImageAttachment[] = [
  { path: '/mock/memory-graph.png', name: 'memory-graph.png' },
  { path: '/mock/retry-timeline.png', name: 'retry-timeline.png' },
];

export const SAMPLE_MARKDOWN = [
  '# Retry the upload when the network drops',
  '',
  'Uploads fail for good after the first dropped connection. This plan adds retries with a backoff, and shows the user what is happening.',
  '',
  '## What changes',
  '',
  'The uploader keeps the file in memory until the server confirms it. On a network error it waits, then sends it again.',
  '',
  '- Three retries, waiting 1, 2 and 4 seconds.',
  '- A **Retrying** label with the attempt number.',
  '- A *Cancel* button that stops the next retry.',
  '',
  '1. Wrap the send in a retry loop.',
  '2. Add the label and the button.',
  '3. Log each failure with its attempt number.',
  '',
  '> [!NOTE]',
  '> Retries only cover network errors. A 4xx answer still fails at once.',
  '',
  '## The loop',
  '',
  '```ts',
  'for (let attempt = 1; attempt <= 3; attempt++) {',
  '  try {',
  '    return await send(file);',
  '  } catch (error) {',
  '    if (!isNetworkError(error)) throw error;',
  '    await wait(2 ** (attempt - 1) * 1000);',
  '  }',
  '}',
  '```',
  '',
  '| Attempt | Wait | Label |',
  '| --- | --- | --- |',
  '| 1 | 1s | Retrying (1 of 3) |',
  '| 2 | 2s | Retrying (2 of 3) |',
  '| 3 | 4s | Retrying (3 of 3) |',
  '',
  '## Open questions',
  '',
  '- [x] Keep the file in memory',
  '- [ ] Show a toast after the last failure',
  '',
  '---',
  '',
  'Inline `code`, a [link to the docs](https://example.com/docs), and ~~an old idea~~.',
].join('\n');

/** The blocks the panel and TOC samples point at, by `blockId`. Matches parseMarkdownToBlocks ids. */
export const annotation = (id: string, type: AnnotationType, originalText: string, text: string | undefined, minutesAgo: number, extra: Partial<Annotation> = {}): Annotation => ({
  id,
  blockId: '',
  startOffset: 0,
  endOffset: 0,
  type,
  text,
  originalText,
  createdA: ago(minutesAgo),
  ...extra,
});

export const PANEL_ANNOTATIONS: Annotation[] = [
  annotation('a-comment', AnnotationType.COMMENT, 'keeps the file in memory until the server confirms it', 'What about large files? Memory could get tight.', 9, { images: IMAGES.slice(0, 1) }),
  annotation('a-delete', AnnotationType.DELETION, 'and shows the user what is happening', undefined, 8),
  annotation('a-label', AnnotationType.COMMENT, 'Three retries, waiting 1, 2 and 4 seconds.', 'Needs a test', 7),
  annotation('a-reply', AnnotationType.COMMENT, 'keeps the file in memory until the server confirms it', 'Or stream it from disk again on retry.', 6, { inReplyTo: 'a-comment' }),
  annotation('a-global', AnnotationType.GLOBAL_COMMENT, '', 'Looks good overall. Keep the retry count in one place.', 5),
];

export const RAIL_GROUPS: AnnotationMessageGroup[] = [
  {
    messageId: 'm1',
    text: 'I added the retry loop and the label.',
    timestamp: new Date(ago(3)).toISOString(),
    isCurrent: true,
    annotations: PANEL_ANNOTATIONS.slice(0, 2),
  },
  {
    messageId: 'm2',
    text: 'Here is the plan for upload retries.',
    timestamp: new Date(ago(40)).toISOString(),
    annotations: PANEL_ANNOTATIONS.slice(4),
  },
];

const minutesIso = (m: number) => new Date(ago(m)).toISOString();

/** Newest first, as the server sends them. Four are short. */
export const RAIL_MESSAGES: PickerMessage[] = [
  { messageId: 'm1', text: 'The annotation session is still open. I\'ll respond to your notes when you submit.', timestamp: minutesIso(1) },
  { messageId: 'm2', text: 'I deleted the old pinpoint code.\n\nBefore I change Tab selection, please check that I\'ve understood what you mean.', timestamp: minutesIso(4) },
  { messageId: 'm3', text: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', timestamp: minutesIso(9) },
  { messageId: 'm4', text: 'I finished items 1-4 and built them.\n\n**1. Hover.** Hovering any part of an annotation now lights the whole annotation.', timestamp: minutesIso(20) },
  { messageId: 'm5', text: 'Approved.', timestamp: minutesIso(35) },
  { messageId: 'm6', text: 'The wait between wheel steps is now 100ms, down from 160ms.\n\nTests and the build pass.', timestamp: minutesIso(50) },
  { messageId: 'm7', text: 'I simplified the rail\'s wheel stepping the way you described.\n\n- Threshold: lowered from 50px to 20px.', timestamp: minutesIso(70) },
  { messageId: 'm8', text: 'Annotation session closed.', timestamp: minutesIso(90) },
  { messageId: 'm9', text: '## Remove the agent terminal\n\nThe terminal panel goes, and its toggle with it.', timestamp: minutesIso(120) },
];

export const RAIL_LONG_ONLY = RAIL_MESSAGES.filter((m) => ['m2', 'm4', 'm6', 'm7', 'm9'].includes(m.messageId));

export const PLAN_V1 = [
  '# Retry the upload when the network drops',
  '',
  'Uploads fail for good after the first dropped connection. This plan adds retries.',
  '',
  '## What changes',
  '',
  '- Five retries, one second apart.',
  '- A spinner while it retries.',
  '',
  'Errors go to the console.',
].join('\n');

export const PLAN_V2 = [
  '# Retry the upload when the network drops',
  '',
  'Uploads fail for good after the first dropped connection. This plan adds retries with a backoff, and shows the user what is happening.',
  '',
  '## What changes',
  '',
  '- Three retries, waiting 1, 2 and 4 seconds.',
  '- A spinner while it retries.',
  '- A Cancel button that stops the next retry.',
  '',
  '```ts',
  'await retry(() => send(file), { attempts: 3 });',
  '```',
].join('\n');

export const VERSION_INFO: VersionInfo = { version: 3, totalVersions: 3, project: 'uploads' };

export const VERSIONS: VersionEntry[] = [
  { version: 3, timestamp: new Date(ago(2)).toISOString() },
  { version: 2, timestamp: new Date(ago(55)).toISOString() },
  { version: 1, timestamp: new Date(ago(60 * 26)).toISOString() },
];

export const TAB_MARKDOWN = [
  'The uploader keeps the file in memory until the server confirms it.',
  '',
  'On a network error it waits, then sends it again.',
  '',
  '- Three retries.',
  '- A Retrying label.',
  '',
  '```ts',
  'await retry(() => send(file), { attempts: 3 });',
  '```',
].join('\n');
