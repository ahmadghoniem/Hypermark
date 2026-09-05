const copy = comment => comment ? { ...comment, images: comment.images.map(image => ({ ...image })) } : null;

export function createCommentStore(initial) {
  const saved = new Map(initial.map(comment => [comment.id, copy(comment)]));
  const drafts = new Map();
  return {
    getSaved: id => copy(saved.get(id)),
    getDraft: id => copy(drafts.get(id)),
    begin(id, location) {
      if (!drafts.has(id)) drafts.set(id, copy(saved.get(id)) ?? { id, location, text: '', images: [] });
      return copy(drafts.get(id));
    },
    update(id, changes) {
      const draft = drafts.get(id);
      if (!draft) throw new Error('No open draft');
      drafts.set(id, copy({ ...draft, ...changes, id }));
    },
    save(id) {
      const draft = drafts.get(id);
      if (!draft || (!draft.text.trim() && draft.images.length === 0)) return false;
      saved.set(id, copy(draft));
      drafts.delete(id);
      return true;
    },
    cancel(id) { drafts.delete(id); },
  };
}
