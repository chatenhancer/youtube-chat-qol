/**
 * Rich chat text rendering helpers.
 *
 * Cards can reuse cloned YouTube message nodes for custom emoji while falling
 * back to plain text for records restored from extension storage.
 */
export function appendRichMessageText(container: HTMLElement, text: string, nodes: Node[] = []): void {
  const richNodes = nodes.map(cloneSafeMessageNode).filter((node): node is Node => Boolean(node));
  if (richNodes.length) {
    container.append(...richNodes);
    return;
  }

  container.textContent = text;
}

function cloneSafeMessageNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
  if (!(node instanceof Element)) return null;

  const clone = node.cloneNode(true) as Element;
  stripDuplicateIds(clone);
  return clone;
}

function stripDuplicateIds(element: Element): void {
  element.removeAttribute('id');
  element.querySelectorAll('[id]').forEach((child) => child.removeAttribute('id'));
}
