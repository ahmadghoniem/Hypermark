/**
 * Spec 05 §4.3 — how the virtualized all-files view projects code annotations
 * onto gutter anchors: every covered line of a range, never a line belonging to
 * another file, and one anchor per (file, side, line) holding every comment
 * that lands there.
 */
import { describe, expect, test } from 'bun:test';
import type { CodeAnnotation } from '@plannotator/ui/types';
import { projectFileAnnotations } from '../utils/lineAnnotationProjection';
import { groupAnchors } from './GutterAnnotations';

function annotation(overrides: Partial<CodeAnnotation> & { id: string }): CodeAnnotation {
  return {
    type: 'comment',
    filePath: 'src/app.ts',
    lineStart: 10,
    lineEnd: 10,
    side: 'new',
    text: 'note',
    ...overrides,
  } as CodeAnnotation;
}

describe('gutter anchor projection', () => {
  test('a multi-line comment covers every line in its range', () => {
    const projected = projectFileAnnotations(
      [annotation({ id: 'a1', lineStart: 10, lineEnd: 13 })],
      'src/app.ts',
      undefined,
      undefined,
    );

    expect(projected.map((entry) => entry.lineNumber)).toEqual([10, 11, 12, 13]);
    expect(new Set(projected.map((entry) => entry.metadata?.annotationId))).toEqual(
      new Set(['a1']),
    );
  });

  test('a single-line comment produces exactly one entry', () => {
    const projected = projectFileAnnotations(
      [annotation({ id: 'a1', lineStart: 7, lineEnd: 7 })],
      'src/app.ts',
      undefined,
      undefined,
    );
    expect(projected).toHaveLength(1);
    expect(projected[0].lineNumber).toBe(7);
  });

  test('an inverted or missing lineStart still anchors on the comment line', () => {
    const projected = projectFileAnnotations(
      [annotation({ id: 'a1', lineStart: 20, lineEnd: 12 })],
      'src/app.ts',
      undefined,
      undefined,
    );
    expect(projected.map((entry) => entry.lineNumber)).toEqual([12]);
  });

  test('another file’s comments never reach this file’s anchors', () => {
    const projected = projectFileAnnotations(
      [
        annotation({ id: 'a1', filePath: 'src/app.ts', lineStart: 3, lineEnd: 3 }),
        annotation({ id: 'a2', filePath: 'src/other.ts', lineStart: 3, lineEnd: 3 }),
      ],
      'src/app.ts',
      undefined,
      undefined,
    );

    expect(projected).toHaveLength(1);
    expect(projected[0].metadata?.annotationId).toBe('a1');
  });

  test('file-scoped comments stay out of the gutter', () => {
    const projected = projectFileAnnotations(
      [annotation({ id: 'a1', scope: 'file' } as Partial<CodeAnnotation> & { id: string })],
      'src/app.ts',
      undefined,
      undefined,
    );
    expect(projected).toEqual([]);
  });

  test('old and new sides anchor separately', () => {
    const projected = projectFileAnnotations(
      [
        annotation({ id: 'a1', side: 'new', lineStart: 5, lineEnd: 5 }),
        annotation({ id: 'a2', side: 'old', lineStart: 5, lineEnd: 5 }),
      ],
      'src/app.ts',
      undefined,
      undefined,
    );

    const anchors = groupAnchors(projected, 'src/app.ts:', 'src/app.ts');
    expect([...anchors.keys()]).toEqual([
      'src/app.ts:additions:5',
      'src/app.ts:deletions:5',
    ]);
  });

  test('overlapping ranges share one anchor per covered line', () => {
    const projected = projectFileAnnotations(
      [
        annotation({ id: 'a1', lineStart: 4, lineEnd: 6 }),
        annotation({ id: 'a2', lineStart: 5, lineEnd: 5 }),
      ],
      'src/app.ts',
      undefined,
      undefined,
    );

    const anchors = groupAnchors(projected, 'src/app.ts:', 'src/app.ts');
    expect(anchors.get('src/app.ts:additions:4')!.annotations.map((a) => a.annotationId)).toEqual([
      'a1',
    ]);
    expect(anchors.get('src/app.ts:additions:5')!.annotations.map((a) => a.annotationId)).toEqual([
      'a1',
      'a2',
    ]);
    expect(anchors.get('src/app.ts:additions:6')!.annotations.map((a) => a.annotationId)).toEqual([
      'a1',
    ]);
    expect(anchors.get('src/app.ts:additions:5')!.filePath).toBe('src/app.ts');
  });
});
