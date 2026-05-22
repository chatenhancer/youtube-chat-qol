/**
 * Rich chat text rendering helpers.
 *
 * Cards can reuse cloned YouTube message nodes for custom emoji while falling
 * back to plain text for records restored from extension storage.
 */
export type RichTextSegment =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'emoji';
      src: string;
      alt: string;
      emojiId: string;
      tooltip: string;
      className: string;
    };

const TOOLTIP_SELECTOR = [
  '[role="tooltip"]',
  'tp-yt-paper-tooltip',
  'yt-tooltip'
].join(',');

export function appendRichMessageText(
  container: HTMLElement,
  text: string,
  nodes: Node[] = [],
  segments: RichTextSegment[] = []
): void {
  const richNodes = nodes.map(cloneSafeMessageNode).filter((node): node is Node => Boolean(node));
  if (richNodes.length) {
    container.append(...richNodes);
    return;
  }

  const segmentNodes = createRichTextSegmentNodes(segments);
  if (segmentNodes.length) {
    container.append(...segmentNodes);
    return;
  }

  container.textContent = text;
}

export function serializeRichMessageNodes(nodes: Node[]): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  nodes.forEach((node) => appendSerializedNode(segments, node));
  return segments;
}

export function normalizeRichTextSegments(value: unknown): RichTextSegment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeRichTextSegment)
    .filter((segment): segment is RichTextSegment => Boolean(segment));
}

function cloneSafeMessageNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
  if (!(node instanceof Element)) return null;
  if (isTooltipElement(node)) return null;

  const clone = node.cloneNode(true) as Element;
  clone.querySelectorAll(TOOLTIP_SELECTOR).forEach((child) => child.remove());
  stripDuplicateIds(clone);
  return clone;
}

function stripDuplicateIds(element: Element): void {
  element.removeAttribute('id');
  element.querySelectorAll('[id]').forEach((child) => child.removeAttribute('id'));
}

function appendSerializedNode(segments: RichTextSegment[], node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    appendTextSegment(segments, node.textContent || '');
    return;
  }
  if (!(node instanceof Element)) return;
  if (isTooltipElement(node)) return;

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') {
    appendTextSegment(segments, '\n');
    return;
  }

  const emoji = getEmojiSegment(node);
  if (emoji) {
    segments.push(emoji);
    return;
  }

  node.childNodes.forEach((child) => appendSerializedNode(segments, child));
}

function appendTextSegment(segments: RichTextSegment[], text: string): void {
  if (!text) return;

  const previous = segments[segments.length - 1];
  if (previous?.type === 'text') {
    previous.text += text;
    return;
  }

  segments.push({
    type: 'text',
    text
  });
}

function getEmojiSegment(element: Element): RichTextSegment | null {
  if (!isEmojiLikeElement(element)) return null;

  const src = getElementImageSource(element);
  const alt = getCleanAttribute(element, 'alt') ||
    getCleanAttribute(element, 'aria-label') ||
    getCleanAttribute(element, 'title') ||
    element.textContent?.trim() ||
    '';
  if (!src || !alt) return null;

  return {
    type: 'emoji',
    src,
    alt,
    emojiId: getCleanAttribute(element, 'data-emoji-id') || getCleanAttribute(element, 'id'),
    tooltip: getCleanAttribute(element, 'shared-tooltip-text') || getCleanAttribute(element, 'title'),
    className: element.getAttribute('class') || ''
  };
}

function isEmojiLikeElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'img' || element.getAttribute('role') === 'img') return true;

  const marker = [
    element.id,
    element.getAttribute('class'),
    element.getAttribute('data-emoji-id'),
    element.getAttribute('shared-tooltip-text')
  ].join(' ');
  return /\bemoji\b/i.test(marker);
}

function getElementImageSource(element: Element): string {
  if (element instanceof HTMLImageElement) {
    return element.currentSrc ||
      element.src ||
      element.getAttribute('src') ||
      element.getAttribute('data-src') ||
      '';
  }

  return element.getAttribute('src') || element.getAttribute('data-src') || '';
}

function getCleanAttribute(element: Element, name: string): string {
  return (element.getAttribute(name) || '').replace(/\s+/g, ' ').trim();
}

function isTooltipElement(element: Element): boolean {
  return element.matches(TOOLTIP_SELECTOR);
}

function createRichTextSegmentNodes(segments: RichTextSegment[]): Node[] {
  return segments
    .map(createRichTextSegmentNode)
    .filter((node): node is Node => Boolean(node));
}

function createRichTextSegmentNode(segment: RichTextSegment): Node | null {
  if (segment.type === 'text') return document.createTextNode(segment.text);
  if (!segment.src || !segment.alt) return segment.alt ? document.createTextNode(segment.alt) : null;

  const image = document.createElement('img');
  image.className = segment.className || 'emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer';
  image.src = segment.src;
  image.alt = segment.alt;
  image.loading = 'lazy';

  if (segment.emojiId) image.setAttribute('data-emoji-id', segment.emojiId);
  if (segment.tooltip) image.setAttribute('shared-tooltip-text', segment.tooltip);

  return image;
}

function normalizeRichTextSegment(value: unknown): RichTextSegment | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RichTextSegment>;

  if (candidate.type === 'text') {
    const text = String(candidate.text || '');
    return text ? { type: 'text', text } : null;
  }

  if (candidate.type === 'emoji') {
    const src = String(candidate.src || '').trim();
    const alt = String(candidate.alt || '').trim();
    if (!src || !alt) return null;

    return {
      type: 'emoji',
      src,
      alt,
      emojiId: String(candidate.emojiId || '').trim(),
      tooltip: String(candidate.tooltip || '').trim(),
      className: String(candidate.className || '').trim()
    };
  }

  return null;
}
