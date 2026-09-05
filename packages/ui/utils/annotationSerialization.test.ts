/**
 * Read-side contract for the compact annotation serialization.
 *
 * These decoders are the only thing standing between a legacy on-disk draft
 * and losing a reviewer's work, so the accepted shapes are pinned here rather
 * than in the sharing transport that used to host them: the tuple `a` forms
 * ('C' / 'D' / 'G' with the trailing quick-label flag and the parallel `d`/`s`
 * arrays), and both image encodings — `[path, name]` tuples and the oldest
 * bare path strings, whose name is derived from the filename.
 *
 * Spec 05 owns the top-level/global image conversion. Until then the decoders
 * must keep every image they are handed: the "images survive" cases below are
 * the handoff contract, not incidental coverage.
 */
import { describe, expect, test } from 'bun:test';
import { AnnotationType } from '../types';
import {
  fromShareable,
  parseShareableImages,
  type ShareableAnnotation,
  type ShareableImage,
} from './annotationSerialization';

describe('parseShareableImages — legacy and modern image encodings', () => {
  test('nothing to decode stays undefined (no empty arrays leak into the UI)', () => {
    expect(parseShareableImages(undefined)).toBeUndefined();
    expect(parseShareableImages([])).toBeUndefined();
  });

  test('[path, name] tuples decode verbatim', () => {
    expect(parseShareableImages([['/data/img-1.png', 'Screenshot']])).toEqual([
      { path: '/data/img-1.png', name: 'Screenshot' },
    ]);
  });

  test('bare path strings (oldest format) derive the name from the filename', () => {
    expect(parseShareableImages(['/data/nested/diagram.png'])).toEqual([
      { path: '/data/nested/diagram.png', name: 'diagram' },
    ]);
    // No extension to strip.
    expect(parseShareableImages(['screenshot'])).toEqual([
      { path: 'screenshot', name: 'screenshot' },
    ]);
    // Dotfile-shaped name strips to empty — fall back rather than render blank.
    expect(parseShareableImages(['.png'])).toEqual([{ path: '.png', name: 'image' }]);
  });

  test('mixed old/new entries decode together, in order', () => {
    const raw: ShareableImage[] = ['/data/one.jpg', ['/data/two.png', 'Two']];
    expect(parseShareableImages(raw)).toEqual([
      { path: '/data/one.jpg', name: 'one' },
      { path: '/data/two.png', name: 'Two' },
    ]);
  });
});

describe('fromShareable — legacy tuple annotations', () => {
  test('empty input decodes to an empty list', () => {
    expect(fromShareable([])).toEqual([]);
  });

  test("'C' comments restore text, quote, author and ordering", () => {
    const restored = fromShareable([
      ['C', 'first quote', 'first comment', 'ramos'],
      ['C', 'second quote', 'second comment', null],
    ]);

    expect(restored).toHaveLength(2);
    expect(restored[0]!.id).toMatch(/^shared-0-\d+$/);
    expect(restored[0]!.type).toBe(AnnotationType.COMMENT);
    expect(restored[0]!.originalText).toBe('first quote');
    expect(restored[0]!.text).toBe('first comment');
    expect(restored[0]!.author).toBe('ramos');
    expect(restored[0]!.blockId).toBe('');
    expect(restored[0]!.startOffset).toBe(0);
    expect(restored[0]!.endOffset).toBe(0);
    // A null author is absent, not the string "null".
    expect(restored[1]!.author).toBeUndefined();
    // createdA preserves the stored order for the panel.
    expect(restored[1]!.createdA).toBeGreaterThan(restored[0]!.createdA);
  });

  test("an empty 'C' comment body decodes to undefined, not ''", () => {
    const [restored] = fromShareable([['C', 'quote', '', null]]);
    expect(restored!.text).toBeUndefined();
    expect(restored!.originalText).toBe('quote');
  });

  test("'D' deletions carry the author in slot 2 and no text", () => {
    const [restored] = fromShareable([['D', 'strike this', 'ramos']]);
    expect(restored!.type).toBe(AnnotationType.DELETION);
    expect(restored!.originalText).toBe('strike this');
    expect(restored!.text).toBeUndefined();
    expect(restored!.author).toBe('ramos');
  });

  test("'G' global comments restore with an empty quote", () => {
    const [restored] = fromShareable([['G', 'overall note', 'tater']]);
    expect(restored!.type).toBe(AnnotationType.GLOBAL_COMMENT);
    expect(restored!.text).toBe('overall note');
    expect(restored!.originalText).toBe('');
    expect(restored!.author).toBe('tater');
  });

  test('the trailing 1 flag restores a quick label; its absence sets no key', () => {
    const [quick] = fromShareable([['C', 'quote', 'Nit', null, undefined, 1]]);
    expect(quick!.isQuickLabel).toBe(true);

    const [plain] = fromShareable([['C', 'quote', 'Nit', null]]);
    expect('isQuickLabel' in plain!).toBe(false);
  });

  test('images decode on every tuple form, in both encodings', () => {
    const [comment, deletion, global] = fromShareable([
      ['C', 'quote', 'see this', null, [['/data/a.png', 'A']]],
      ['D', 'strike this', null, ['/data/b.png']],
      ['G', 'overall', null, [['/data/c.png', 'C'], '/data/d.png']],
    ]);

    expect(comment!.images).toEqual([{ path: '/data/a.png', name: 'A' }]);
    expect(deletion!.images).toEqual([{ path: '/data/b.png', name: 'b' }]);
    // Global comment attachments survive intact — spec 05 converts them later.
    expect(global!.images).toEqual([
      { path: '/data/c.png', name: 'C' },
      { path: '/data/d.png', name: 'd' },
    ]);
  });

  test('the parallel d/s arrays attach diffContext and source by index', () => {
    const data: ShareableAnnotation[] = [
      ['C', 'quote a', 'comment a', null],
      ['C', 'quote b', 'comment b', null],
    ];
    const restored = fromShareable(data, ['added', null], [undefined, 'browser-agent']);

    expect(restored[0]!.diffContext).toBe('added');
    expect('source' in restored[0]!).toBe(false);
    expect('diffContext' in restored[1]!).toBe(false);
    expect(restored[1]!.source).toBe('browser-agent');
  });

  test('a global comment keeps its source (its provenance survives restore)', () => {
    const [restored] = fromShareable([['G', 'overall', null]], null, ['browser-agent']);
    expect(restored!.source).toBe('browser-agent');
  });

  test('omitted d/s arrays leave both keys off', () => {
    const [restored] = fromShareable([['C', 'quote', 'comment', null]]);
    expect('diffContext' in restored!).toBe(false);
    expect('source' in restored!).toBe(false);
  });

  test('the tuple format never carried anchors, targets or reply links, and restore does not invent them', () => {
    // A reply serialized as a plain comment on the same quote is the existing
    // text-restore contract; the decoder must not resurrect threading or
    // another viewer's DOM anchors from a payload that has neither.
    const restored = fromShareable([
      ['C', 'quote', 'Parent', 'ramos'],
      ['C', 'quote', 'Reply', 'tater'],
    ]);

    expect(restored[1]!.originalText).toBe('quote');
    expect(restored[1]!.text).toBe('Reply');
    expect(restored[1]!.inReplyTo).toBeUndefined();
    expect(restored[1]!.htmlAnchor).toBeUndefined();
    expect(restored[1]!.htmlAdditionalTargets).toBeUndefined();
  });
});
