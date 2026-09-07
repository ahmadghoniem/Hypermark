import { describe, expect, test } from 'bun:test';
import { AnnotationType, type Annotation, type CodeAnnotation, type ImageAttachment } from '../types';
import {
  normalizeAttachmentImage,
  normalizeAttachmentImages,
  buildGlobalAttachmentCommentId,
  normalizeDocumentAnnotations,
  normalizeDraftPayload,
} from './attachmentNormalization';
import { exportAnnotations, parseMarkdownToBlocks } from './parser';
import { exportReviewFeedback } from '../../review-editor/utils/exportFeedback';
import { applyCollectionMutation, type CollectionMutation } from './undoHistory';

describe('attachmentNormalization', () => {
  describe('normalizeAttachmentImage', () => {
    test('normalizes an ImageAttachment object', () => {
      const normalized = normalizeAttachmentImage({ path: '/images/screenshot.png', name: 'screenshot' });
      expect(normalized).toEqual({ path: '/images/screenshot.png', name: 'screenshot' });
    });

    test('derives name from filename if name is empty or absent on object', () => {
      const normalized = normalizeAttachmentImage({ path: '/uploads/architecture-diagram.png' });
      expect(normalized).toEqual({ path: '/uploads/architecture-diagram.png', name: 'architecture-diagram' });
    });

    test('normalizes [path, name] tuples from legacy shareable format', () => {
      const normalized = normalizeAttachmentImage(['/legacy/plan.png', 'Plan Diagram']);
      expect(normalized).toEqual({ path: '/legacy/plan.png', name: 'Plan Diagram' });
    });

    test('normalizes bare string paths from oldest legacy format', () => {
      const normalized = normalizeAttachmentImage('/old/mockup.png');
      expect(normalized).toEqual({ path: '/old/mockup.png', name: 'mockup' });
    });

    test('rejects malformed, empty, or non-string paths', () => {
      expect(normalizeAttachmentImage(null)).toBeNull();
      expect(normalizeAttachmentImage(undefined)).toBeNull();
      expect(normalizeAttachmentImage('')).toBeNull();
      expect(normalizeAttachmentImage('   ')).toBeNull();
      expect(normalizeAttachmentImage([])).toBeNull();
      expect(normalizeAttachmentImage({})).toBeNull();
      expect(normalizeAttachmentImage({ path: '' })).toBeNull();
      expect(normalizeAttachmentImage({ path: 123 })).toBeNull();
    });
  });

  describe('normalizeAttachmentImages', () => {
    test('deduplicates by path while preserving first appearance and order', () => {
      const inputs = [
        { path: '/a.png', name: 'First A' },
        '/b.png',
        ['/a.png', 'Duplicate A'],
        { path: '/c.png', name: 'C' },
      ];
      const result = normalizeAttachmentImages(inputs);
      expect(result).toEqual([
        { path: '/a.png', name: 'First A' },
        { path: '/b.png', name: 'b' },
        { path: '/c.png', name: 'C' },
      ]);
    });

    test('returns empty array on empty or non-array inputs', () => {
      expect(normalizeAttachmentImages([])).toEqual([]);
      expect(normalizeAttachmentImages(null)).toEqual([]);
      expect(normalizeAttachmentImages(undefined)).toEqual([]);
    });
  });

  describe('normalizeDocumentAnnotations — legacy shapes and migration', () => {
    test('converts legacy global attachments into one image-only GLOBAL_COMMENT', () => {
      const legacyGlobals: ImageAttachment[] = [
        { path: '/uploads/img1.png', name: 'Diagram 1' },
        { path: '/uploads/img2.png', name: 'Diagram 2' },
      ];

      const { annotations, globalAttachments } = normalizeDocumentAnnotations({
        annotations: [],
        globalAttachments: legacyGlobals,
        docKey: 'plan-overview',
      });

      expect(globalAttachments).toEqual([]);
      expect(annotations).toHaveLength(1);
      const [comment] = annotations;
      expect(comment.id).toBe('global-attachments-plan-overview');
      expect(comment.type).toBe(AnnotationType.GLOBAL_COMMENT);
      expect(comment.originalText).toBe('');
      expect(comment.blockId).toBe('');
      expect(comment.text).toBeUndefined();
      expect(comment.images).toEqual(legacyGlobals);
    });

    test('preserves existing line annotations alongside migrated global attachments', () => {
      const existingLineComment: Annotation = {
        id: 'ann-1',
        blockId: 'block-1',
        startOffset: 0,
        endOffset: 5,
        type: AnnotationType.COMMENT,
        originalText: 'Existing text',
        text: 'Needs refactoring',
        createdA: 1000,
      };

      const { annotations, globalAttachments } = normalizeDocumentAnnotations({
        annotations: [existingLineComment],
        globalAttachments: [{ path: '/img.png', name: 'img' }],
        docKey: 'doc-1',
      });

      expect(globalAttachments).toEqual([]);
      expect(annotations).toHaveLength(2);
      expect(annotations[0]).toEqual(existingLineComment);
      expect(annotations[1].id).toBe('global-attachments-doc-1');
      expect(annotations[1].type).toBe(AnnotationType.GLOBAL_COMMENT);
      expect(annotations[1].images).toEqual([{ path: '/img.png', name: 'img' }]);
    });
  });

  describe('idempotence', () => {
    test('normalizing already-normalized annotations is a strict no-op', () => {
      const initial = normalizeDocumentAnnotations({
        annotations: [],
        globalAttachments: [{ path: '/img.png', name: 'img' }],
        docKey: 'idempotent-doc',
      });

      const roundTrip = normalizeDocumentAnnotations({
        annotations: initial.annotations,
        globalAttachments: initial.globalAttachments,
        docKey: 'idempotent-doc',
      });

      expect(roundTrip.annotations).toEqual(initial.annotations);
      expect(roundTrip.globalAttachments).toEqual([]);
    });

    test('repeated calls with original globalAttachments do not duplicate comments or images', () => {
      const globals = [{ path: '/img1.png', name: 'Image 1' }];

      const firstPass = normalizeDocumentAnnotations({
        annotations: [],
        globalAttachments: globals,
        docKey: 'stable-doc',
      });
      expect(firstPass.annotations).toHaveLength(1);

      const secondPass = normalizeDocumentAnnotations({
        annotations: firstPass.annotations,
        globalAttachments: globals, // caller mistakenly re-passed the old global list
        docKey: 'stable-doc',
      });

      expect(secondPass.annotations).toHaveLength(1);
      expect(secondPass.annotations[0].images).toHaveLength(1);
      expect(secondPass.annotations[0].images).toEqual(globals);
    });
  });

  describe('explicit ambiguous handling', () => {
    test('unanchored global images are explicitly kept in document-level GLOBAL_COMMENT', () => {
      // Ambiguous: the images were attached at document level and have no line or block metadata.
      // Decision: we do NOT guess an arbitrary line comment to attach them to.
      // We explicitly store them in the document-level GLOBAL_COMMENT.
      const lineAnn: Annotation = {
        id: 'line-1',
        blockId: 'b-1',
        startOffset: 0,
        endOffset: 10,
        type: AnnotationType.COMMENT,
        originalText: 'line of code',
        text: 'some comment',
        createdA: 2000,
      };

      const result = normalizeDocumentAnnotations({
        annotations: [lineAnn],
        globalAttachments: [{ path: '/unanchored.png', name: 'unanchored' }],
        docKey: 'ambiguous-test',
      });

      // Line comment remains untouched
      expect(result.annotations[0].images).toBeUndefined();
      // Dedicated global comment created for unanchored images
      expect(result.annotations[1].id).toBe('global-attachments-ambiguous-test');
      expect(result.annotations[1].images).toEqual([{ path: '/unanchored.png', name: 'unanchored' }]);
    });

    test('images already owned by an existing comment are not duplicated into global comment', () => {
      const lineAnnWithImage: Annotation = {
        id: 'line-1',
        blockId: 'b-1',
        startOffset: 0,
        endOffset: 10,
        type: AnnotationType.COMMENT,
        originalText: 'line of code',
        text: 'some comment',
        createdA: 2000,
        images: [{ path: '/shared-img.png', name: 'shared' }],
      };

      const result = normalizeDocumentAnnotations({
        annotations: [lineAnnWithImage],
        globalAttachments: [{ path: '/shared-img.png', name: 'shared' }],
        docKey: 'no-dups',
      });

      // Since /shared-img.png is already owned by line-1, no new global comment is minted
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toEqual(lineAnnWithImage);
    });

    test('malformed global entries are skipped without corrupting valid entries', () => {
      const malformedGlobals = [
        null,
        '',
        { invalid: true },
        { path: '/valid.png', name: 'valid' },
        undefined,
      ];

      const result = normalizeDocumentAnnotations({
        annotations: [],
        globalAttachments: malformedGlobals,
        docKey: 'malformed-test',
      });

      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0].images).toEqual([{ path: '/valid.png', name: 'valid' }]);
    });
  });

  describe('draft generation and tombstone races', () => {
    test('empty draft remains strictly empty and does NOT create a ghost comment', () => {
      // CONTRACT: useAnnotationDraft checks if annotations.length === 0 && globalAttachments.length === 0.
      // If a normalizer mints an empty GLOBAL_COMMENT, annotations.length becomes 1, defeating
      // the tombstone delete and resurrecting discarded drafts.
      const result = normalizeDocumentAnnotations({
        annotations: [],
        globalAttachments: [],
        docKey: 'empty-test',
      });

      expect(result.annotations).toEqual([]);
      expect(result.globalAttachments).toEqual([]);
    });

    test('normalizeDraftPayload handles legacy tuple format', () => {
      const legacyPayload = {
        a: [['C', 'quoted text', 'comment text', 'ramos', [['/img.png', 'Img']]]],
        g: [['/global.png', 'Global Image']],
        ts: 123456789,
      };

      const normalized = normalizeDraftPayload(legacyPayload, 'my-draft');
      expect(normalized).not.toBeNull();
      expect(normalized!.globalAttachments).toEqual([]);
      expect(normalized!.annotations).toHaveLength(2);
      expect(normalized!.annotations[0].type).toBe(AnnotationType.COMMENT);
      expect(normalized!.annotations[0].images).toEqual([{ path: '/img.png', name: 'Img' }]);
      expect(normalized!.annotations[1].id).toBe('global-attachments-my-draft');
      expect(normalized!.annotations[1].images).toEqual([{ path: '/global.png', name: 'Global Image' }]);
      expect(normalized!.ts).toBe(123456789);
    });

    test('normalizeDraftPayload preserves draft generation across normalization', () => {
      const modernPayload = {
        annotations: [],
        globalAttachments: [{ path: '/global.png', name: 'Global' }],
        draftGeneration: 42,
        ts: 9999,
      };

      const normalized = normalizeDraftPayload(modernPayload, 'gen-test');
      expect(normalized!.draftGeneration).toBe(42);
      expect(normalized!.annotations).toHaveLength(1);
      expect(normalized!.globalAttachments).toEqual([]);
    });
  });

  describe('mutation history (undo/redo with comment-owned attachments)', () => {
    test('adding and undoing an annotation with images preserves image ownership without touching global state', () => {
      const initialAnns: Annotation[] = [];
      const newAnn: Annotation = {
        id: 'ann-with-img',
        blockId: 'b-1',
        startOffset: 0,
        endOffset: 5,
        type: AnnotationType.COMMENT,
        originalText: 'target text',
        text: 'comment with screenshot',
        createdA: Date.now(),
        images: [{ path: '/mutation.png', name: 'mutation' }],
      };

      const addMutation: CollectionMutation<Annotation> = {
        kind: 'add',
        item: newAnn,
        index: 0,
      };

      // Apply ADD
      const added = applyCollectionMutation(initialAnns, addMutation, 'redo', (a) => a.id);
      expect(added).toHaveLength(1);
      expect(added[0].images).toEqual([{ path: '/mutation.png', name: 'mutation' }]);

      // UNDO the ADD
      const undone = applyCollectionMutation(added, addMutation, 'undo', (a) => a.id);
      expect(undone).toHaveLength(0);

      // REDO the ADD
      const redone = applyCollectionMutation(undone, addMutation, 'redo', (a) => a.id);
      expect(redone).toEqual(added);
    });

    test('editing an annotation to add an image reverts to pre-image state on undo', () => {
      const before: Annotation = {
        id: 'ann-1',
        blockId: 'b-1',
        startOffset: 0,
        endOffset: 5,
        type: AnnotationType.COMMENT,
        originalText: 'target',
        text: 'initial text',
        createdA: 1000,
      };

      const after: Annotation = {
        ...before,
        images: [{ path: '/added-later.png', name: 'added-later' }],
      };

      const editMutation: CollectionMutation<Annotation> = {
        kind: 'edit',
        before,
        after,
      };

      const current = [before];
      const applied = applyCollectionMutation(current, editMutation, 'redo', (a) => a.id);
      expect(applied[0].images).toEqual([{ path: '/added-later.png', name: 'added-later' }]);

      const reverted = applyCollectionMutation(applied, editMutation, 'undo', (a) => a.id);
      expect(reverted[0].images).toBeUndefined();
    });
  });

  describe('comment-owned export and restore round-trip', () => {
    test('exportAnnotations formats attached images under comments and image-only GLOBAL_COMMENT', () => {
      const blocks = parseMarkdownToBlocks('# Plan Title\n\nSome paragraph text here.');
      const normalizedAnns: Annotation[] = [
        {
          id: 'global-attachments-doc',
          blockId: '',
          startOffset: 0,
          endOffset: 0,
          type: AnnotationType.GLOBAL_COMMENT,
          originalText: '',
          createdA: 1000,
          images: [{ path: '/uploads/plan-arch.png', name: 'Architecture' }],
        },
        {
          id: 'comment-1',
          blockId: blocks[1].id,
          startOffset: 0,
          endOffset: 14,
          type: AnnotationType.COMMENT,
          originalText: 'Some paragraph',
          text: 'Check this diagram',
          createdA: 2000,
          images: [{ path: '/uploads/detail.png', name: 'Detail' }],
        },
      ];

      const exported = exportAnnotations(blocks, normalizedAnns, []);

      // Image under GLOBAL_COMMENT
      expect(exported).toContain('General feedback about the plan');
      expect(exported).toContain('**Attached images:**\n- [Architecture] `/uploads/plan-arch.png`');
      // Crucial: image-only GLOBAL_COMMENT without text must not output `> undefined`
      expect(exported).not.toContain('> undefined');
      // Spec 05 §4.1: the standalone top-level section is gone — every image
      // now rides with its owning comment instead.
      expect(exported).not.toContain('Reference Images');

      // Image under line COMMENT
      expect(exported).toContain('Feedback on: "Some paragraph"');
      expect(exported).toContain('> Check this diagram');
      expect(exported).toContain('**Attached images:**\n- [Detail] `/uploads/detail.png`');
    });

    test('exportFeedback formats attached images across code review scopes', () => {
      const codeAnns: CodeAnnotation[] = [
        {
          id: 'code-ann-1',
          type: 'comment',
          scope: 'line',
          filePath: 'src/index.ts',
          lineStart: 10,
          lineEnd: 12,
          side: 'new',
          text: 'Refactor this section',
          createdAt: 1000,
          images: [{ path: '/review/line-img.png', name: 'Line Context' }],
        },
        {
          id: 'code-ann-2',
          type: 'comment',
          scope: 'file',
          filePath: 'src/index.ts',
          lineStart: 0,
          lineEnd: 0,
          side: 'new',
          text: 'Overall file structure feedback',
          createdAt: 2000,
          images: [{ path: '/review/file-img.png', name: 'File Structure' }],
        },
        {
          id: 'code-ann-3',
          type: 'comment',
          scope: 'general',
          filePath: '',
          lineStart: 0,
          lineEnd: 0,
          side: 'new',
          text: 'General review comment',
          createdAt: 3000,
          images: [{ path: '/review/general-img.png', name: 'Overview' }],
        },
      ];

      const feedback = exportReviewFeedback(codeAnns);

      // Line annotation
      expect(feedback).toContain('### Lines 10-12 (new)');
      expect(feedback).toContain('Refactor this section');
      expect(feedback).toContain('**Attached images:**\n- [Line Context] `/review/line-img.png`');

      // File annotation
      expect(feedback).toContain('### File Comment');
      expect(feedback).toContain('Overall file structure feedback');
      expect(feedback).toContain('**Attached images:**\n- [File Structure] `/review/file-img.png`');

      // General annotation
      expect(feedback).toContain('## General');
      expect(feedback).toContain('General review comment');
      expect(feedback).toContain('**Attached images:**\n- [Overview] `/review/general-img.png`');
    });
  });
});
