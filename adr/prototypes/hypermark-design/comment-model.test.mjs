import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentStore } from './comment-model.mjs';

const initial = () => [{ id: 'a', location: 'L38', text: 'Keep the draft.', images: [{ id: 'original', src: '/sample.svg', name: 'original.svg' }] }];

test('cancel restores saved text and attachments after both were edited', () => {
  const store = createCommentStore(initial());
  store.begin('a');
  store.update('a', { text: 'Unsaved edit', images: [] });
  store.cancel('a');
  assert.deepEqual(store.getSaved('a'), initial()[0]);
  assert.equal(store.getDraft('a'), null);
});

test('saving an attachment edit is visible on the next edit without mutating the old snapshot', () => {
  const store = createCommentStore(initial());
  const old = store.getSaved('a');
  store.begin('a');
  const images = [{ id: 'new', src: 'blob:sample', name: 'new.png' }];
  store.update('a', { text: 'Updated', images });
  assert.equal(store.save('a'), true);
  images[0].name = 'Changed outside the store';
  assert.deepEqual(store.begin('a').images, [{ id: 'new', src: 'blob:sample', name: 'new.png' }]);
  assert.equal(store.getSaved('a').text, 'Updated');
  assert.deepEqual(old, initial()[0]);
});

test('switching comments and reopening preserves separate unsaved drafts', () => {
  const store = createCommentStore(initial());
  store.begin('a');
  store.update('a', { text: 'Not saved yet' });
  store.begin('b', 'L42');
  store.update('b', { text: 'Another draft' });
  assert.equal(store.begin('a').text, 'Not saved yet');
  assert.equal(store.getSaved('a').text, 'Keep the draft.');
  assert.equal(store.begin('b').text, 'Another draft');
});

test('image-only comments save, but empty drafts do not create comments', () => {
  const store = createCommentStore([]);
  store.begin('new', 'L34');
  assert.equal(store.save('new'), false);
  assert.equal(store.getSaved('new'), null);
  store.update('new', { images: [{ id: 'image', name: 'sample.svg', src: '/sample.svg' }] });
  assert.equal(store.save('new'), true);
  assert.equal(store.getSaved('new').images.length, 1);
});
