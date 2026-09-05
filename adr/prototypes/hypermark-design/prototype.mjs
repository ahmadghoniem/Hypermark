import { createCommentStore } from './comment-model.mjs';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const glyph = name => `<i class="icon" data-phosphor="${name}"></i>`;
function paintIcons() {
  document.querySelectorAll('[data-phosphor]').forEach(el => el.style.setProperty('--glyph', `url('/phosphor/${el.dataset.phosphor}.svg')`));
  document.querySelectorAll('[data-pierre]').forEach(el => el.style.setProperty('--glyph', `url('/icons/${el.dataset.pierre}.svg')`));
}

const store = createCommentStore([
  { id: 'upload', location: 'L38–40', text: 'Keep the selected image and draft if the upload fails. Let me retry without starting over.', images: [{ id: 'sample', src: '/sample.svg', name: 'composer-layout.svg' }] },
  { id: 'visible', location: 'L42', text: 'Show the attachment in the composer before submitting the comment.', images: [] },
]);
const anchors = { upload: 38, visible: 42, new: 34 };
let activeId = null, pinned = false, hideTimer, diffMode = 'unified', uploadFor = null;
const objectUrls = new Set();

function pinElement() { return activeId ? document.querySelector(`[data-comment="${activeId}"]`) : null; }
function placePopover() {
  const pin = pinElement(), popover = $('#popover');
  if (!pin || popover.hidden) return;
  const rect = pin.getBoundingClientRect();
  popover.style.left = `${Math.max(12, Math.min(rect.right + 12, innerWidth - popover.offsetWidth - 12))}px`;
  popover.style.top = `${Math.max(16, Math.min(rect.top + 15, innerHeight - popover.offsetHeight - 16))}px`;
}
function syncMarkers() {
  document.querySelectorAll('[data-comment]').forEach(pin => {
    pin.setAttribute('aria-expanded', String(pin.dataset.comment === activeId && !$('#popover').hidden));
    const present = store.getSaved(pin.dataset.comment) || store.getDraft(pin.dataset.comment);
    pin.classList.toggle('new', !present);
    pin.innerHTML = glyph(present ? 'chat-circle' : 'plus');
    pin.setAttribute('aria-label', `${present ? 'Open comment' : 'Add comment'} on line ${anchors[pin.dataset.comment]}`);
  });
  paintIcons();
}
function closePopover({ focus = false } = {}) {
  clearTimeout(hideTimer);
  const pin = pinElement();
  if (activeId && store.getDraft(activeId)) $('#status').textContent = 'Draft kept — reopen the gutter marker to continue.';
  $('#popover').hidden = true;
  pinned = false;
  activeId = null;
  syncMarkers();
  if (focus) pin?.focus();
}
function scheduleClose() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!pinned && !store.getDraft(activeId) && !$('#popover').contains(document.activeElement)) closePopover();
  }, 180);
}
function openComment(id, pin = false) {
  clearTimeout(hideTimer);
  activeId = id;
  pinned = pin;
  if (!store.getSaved(id)) store.begin(id, `L${anchors[id]}`);
  renderPopover();
  if (store.getDraft(id)) pinned = true;
}
function renderImages(comment, editing) {
  return comment.images.map(image => `<div class="image-tile" title="${escapeHtml(image.name)}"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.name)}">${editing ? `<button class="icon-button remove" data-remove="${escapeHtml(image.id)}" aria-label="Remove ${escapeHtml(image.name)}">${glyph('x')}</button>` : ''}</div>`).join('');
}
function renderPopover() {
  const draft = store.getDraft(activeId), comment = draft ?? store.getSaved(activeId);
  if (!comment) return closePopover();
  const popover = $('#popover');
  popover.hidden = false;
  popover.innerHTML = `<div class="popover-header"><span class="location">attachments.ts · ${escapeHtml(comment.location)}</span><button id="close" class="icon-button" aria-label="Close comment">${glyph('x')}</button></div>` + (draft
    ? `<div class="composer"><textarea id="comment-text" aria-label="Comment text" placeholder="Leave a comment…">${escapeHtml(comment.text)}</textarea><div id="images" class="images">${renderImages(comment, true)}</div><p id="error" class="error" role="alert" hidden></p><div class="composer-footer"><div class="composer-actions"><button id="attach" class="icon-button" aria-label="Attach images" title="Attach images">${glyph('paperclip')}</button><button id="sample" class="text-button" title="Add a synthetic image for this prototype">Try sample</button></div><div class="composer-actions"><button id="cancel" class="text-button">Cancel</button><button id="save" class="primary">${glyph('check')}Save</button></div></div></div>`
    : `<p class="preview-text">${escapeHtml(comment.text)}</p>${comment.images.length ? `<div class="images preview-images">${renderImages(comment, false)}</div>` : ''}<div class="preview-footer"><button id="edit" class="text-button">${glyph('pencil-simple')}Edit</button></div>`);
  $('#close').addEventListener('click', () => closePopover({ focus: true }));
  if (draft) {
    $('#comment-text').addEventListener('input', event => { store.update(activeId, { text: event.target.value }); updateSave(); });
    $('#save').addEventListener('click', () => {
      if (!store.save(activeId)) return;
      renderPopover(); $('#edit').focus();
      $('#status').textContent = 'Saved in this preview. Reload resets the example.';
    });
    $('#cancel').addEventListener('click', () => {
      store.cancel(activeId);
      if (store.getSaved(activeId)) { renderPopover(); $('#edit').focus(); } else closePopover({ focus: true });
    });
    $('#attach').addEventListener('click', () => { uploadFor = activeId; $('#file').click(); });
    $('#sample').addEventListener('click', () => addImages(activeId, [{ id: crypto.randomUUID(), src: '/sample.svg', name: 'layout-reference.svg' }]));
    wireRemoveButtons(); updateSave();
  } else {
    $('#edit').addEventListener('click', () => {
      pinned = true; store.begin(activeId); renderPopover(); $('#comment-text').focus();
    });
  }
  syncMarkers(); placePopover();
}
function updateSave() {
  const draft = store.getDraft(activeId);
  if ($('#save') && draft) $('#save').disabled = !draft.text.trim() && draft.images.length === 0;
}
function wireRemoveButtons() {
  document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    const draft = store.getDraft(activeId);
    store.update(activeId, { images: draft.images.filter(image => image.id !== button.dataset.remove) });
    refreshImages(); $('#attach').focus();
  }));
}
function refreshImages() {
  $('#images').innerHTML = renderImages(store.getDraft(activeId), true);
  wireRemoveButtons(); paintIcons(); updateSave(); placePopover();
}
function addImages(id, images) {
  const draft = store.getDraft(id);
  if (!draft) return;
  store.update(id, { images: [...draft.images, ...images] });
  if (id === activeId && !$('#popover').hidden) refreshImages();
}
$('#file').addEventListener('change', event => {
  const files = [...event.target.files];
  if (!store.getDraft(uploadFor)) return;
  const images = files.filter(file => file.type.startsWith('image/')).map(file => {
    const src = URL.createObjectURL(file); objectUrls.add(src);
    return { id: crypto.randomUUID(), src, name: file.name };
  });
  addImages(uploadFor, images);
  if (images.length !== files.length && uploadFor === activeId && $('#error')) {
    $('#error').textContent = 'Choose an image file. The comment and other images are unchanged.'; $('#error').hidden = false;
  }
  event.target.value = '';
});

const shared = [
  [30, '<span class="kw">export async function</span> <span class="fn">uploadAttachment</span>(file: File) {'],
  [31, '  <span class="kw">const</span> body = <span class="kw">new</span> FormData();'],
  [32, '  body.<span class="fn">append</span>(<span class="str">"file"</span>, file);'], [33, ''],
  [34, '  <span class="kw">const</span> response = <span class="kw">await</span> <span class="fn">fetch</span>(<span class="str">"/api/upload"</span>, {'],
  [35, '    method: <span class="str">"POST"</span>, body,'], [36, '  });'],
];
const added = [
  [38, '  <span class="kw">if</span> (!response.ok) {'],
  [39, '    <span class="kw">throw new</span> Error(<span class="str">"Couldn’t attach image"</span>);'], [40, '  }'],
  [41, '  <span class="kw">const</span> attachment = <span class="kw">await</span> response.<span class="fn">json</span>();'], [42, '  <span class="kw">return</span> attachment;'],
];
function line([number, text], kind = '', side = 'new') {
  const id = side === 'new' ? Object.keys(anchors).find(id => anchors[id] === number) : null;
  return `<div class="line ${kind}"><span>${id ? `<button class="pin" data-comment="${id}" aria-controls="popover"></button>` : ''}</span><span class="num">${number}</span><span class="sign">${kind === 'add' ? '+' : kind === 'del' ? '−' : ''}</span><code>${text || ' '}</code></div>`;
}
function renderDiff() {
  const head = '<div class="hunk">@@ uploadAttachment · synthetic example</div>';
  const before = line([37, '  <span class="kw">return</span> response.<span class="fn">json</span>();'], 'del', 'old');
  $('#columns').classList.toggle('split', diffMode === 'split');
  $('#columns').innerHTML = diffMode === 'unified'
    ? `<div class="codepane">${head}${shared.map(row => line(row)).join('')}${before}${added.map(row => line(row, 'add')).join('')}${line([43, '}'])}</div>`
    : `<div class="codepane"><div class="columnlabel">BEFORE</div>${head}${shared.map(row => line(row, '', 'old')).join('')}${before}${'<div class="line empty"></div>'.repeat(4)}${line([38, '}'], '', 'old')}</div><div class="codepane"><div class="columnlabel">AFTER</div>${head}${shared.map(row => line(row)).join('')}${added.map(row => line(row, 'add')).join('')}${line([43, '}'])}</div>`;
  document.querySelectorAll('[data-comment]').forEach(pin => {
    pin.addEventListener('click', () => openComment(pin.dataset.comment, true));
    pin.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      if (!pinned && !store.getDraft(activeId) && store.getSaved(pin.dataset.comment)) openComment(pin.dataset.comment);
    });
    pin.addEventListener('mouseleave', scheduleClose);
  });
  syncMarkers(); placePopover();
}
document.querySelectorAll('[data-diff]').forEach(button => button.addEventListener('click', () => {
  diffMode = button.dataset.diff;
  document.querySelectorAll('[data-diff]').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
  renderDiff();
}));
$('#theme').addEventListener('click', () => {
  const light = document.documentElement.classList.toggle('light');
  $('#theme').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
  $('#theme [data-phosphor]').dataset.phosphor = light ? 'moon' : 'sun'; paintIcons();
});
$('#popover').addEventListener('mouseenter', () => clearTimeout(hideTimer));
$('#popover').addEventListener('mouseleave', scheduleClose);
$('#popover').addEventListener('focusin', () => { pinned = true; });
document.addEventListener('pointerdown', event => {
  if (!$('#popover').hidden && !$('#popover').contains(event.target) && !event.target.closest('[data-comment]') && !event.target.closest('.controls')) closePopover();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#popover').hidden) { event.preventDefault(); closePopover({ focus: true }); }
});
window.addEventListener('resize', placePopover);
document.addEventListener('scroll', placePopover, true);
window.addEventListener('beforeunload', () => objectUrls.forEach(src => URL.revokeObjectURL(src)));
renderDiff(); paintIcons();
