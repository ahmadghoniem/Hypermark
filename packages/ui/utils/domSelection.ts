/** Elements whose text must not become part of a document annotation range. */
const NON_ANNOTATABLE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'script',
  'style',
  '[contenteditable]:not([contenteditable="false"])',
  '[data-pinpoint-ignore]',
  '.select-none',
  '.annotation-toolbar',
  '.katex',
].join(',');

/**
 * Return the annotatable text nodes under an element in document order.
 * Existing highlight wrappers remain eligible so selections can overlap
 * existing annotations.
 */
export function getAnnotatableTextNodes(element: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(NON_ANNOTATABLE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.length
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

/**
 * Create a text-node-anchored range spanning an element's annotatable text.
 * Web-highlighter cannot paint element-node endpoints, so callers share this
 * conversion instead of synthesizing subtly different ranges.
 */
export function createTextRange(element: HTMLElement): Range | null {
  const nodes = getAnnotatableTextNodes(element);
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];

  if (!firstNode || !lastNode) return null;

  const range = document.createRange();
  range.setStart(firstNode, 0);
  range.setEnd(lastNode, lastNode.length);
  return range;
}
