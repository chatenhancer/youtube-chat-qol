import { describe, expect, it } from 'vitest';
import {
  cloneSafeMessageNode,
  getElementImageSource,
  getElementTextFallback,
  getPlainTextFromMessageNode,
  getPlainTextFromMessageNodes,
  isEmojiLikeElement
} from './message-content';

describe('YouTube message content helpers', () => {
  it('extracts visible text and emoji alt text while ignoring tooltips', () => {
    const container = document.createElement('span');
    container.append('Hi ');
    const emoji = document.createElement('img');
    emoji.alt = ':smile:';
    container.append(emoji);
    container.append(document.createElement('br'), 'next');
    const tooltip = document.createElement('tp-yt-paper-tooltip');
    tooltip.textContent = 'hidden tooltip';
    container.append(tooltip);

    expect(getPlainTextFromMessageNodes(container.childNodes)).toBe('Hi :smile:\nnext');
  });

  it('uses tooltip-style emoji attributes as text fallback', () => {
    const emoji = document.createElement('span');
    emoji.setAttribute('role', 'img');
    emoji.setAttribute('shared-tooltip-text', ':custom-emoji:');

    expect(getElementTextFallback(emoji)).toBe(':custom-emoji:');
  });

  it('detects emoji-like elements from ids, classes, data attributes, and child images', () => {
    const byId = document.createElement('span');
    byId.id = 'emoji-1';
    const byData = document.createElement('span');
    byData.setAttribute('data-emoji-id', 'emoji-id');
    const plain = document.createElement('span');
    plain.textContent = 'not emoji';

    expect(isEmojiLikeElement(byId)).toBe(true);
    expect(isEmojiLikeElement(byData)).toBe(true);
    expect(isEmojiLikeElement(plain)).toBe(false);
  });

  it('reads image sources and fallback labels from nested image attributes', () => {
    const wrapper = document.createElement('span');
    const image = document.createElement('img');
    image.setAttribute('data-src', 'https://example.test/fallback.png');
    image.setAttribute('aria-label', ':nested:');
    wrapper.append(image);
    const sourceOnly = document.createElement('span');
    sourceOnly.setAttribute('data-src', 'https://example.test/source-only.png');

    expect(getElementImageSource(wrapper)).toBe('https://example.test/fallback.png');
    expect(getElementImageSource(sourceOnly)).toBe('https://example.test/source-only.png');
    expect(getElementTextFallback(wrapper)).toBe(':nested:');
  });

  it('returns blank text for comments and ignored tooltip nodes', () => {
    const tooltip = document.createElement('yt-tooltip');
    tooltip.textContent = 'hidden';

    expect(getPlainTextFromMessageNode(document.createComment('comment'))).toBe('');
    expect(getPlainTextFromMessageNode(tooltip)).toBe('');
    expect(cloneSafeMessageNode(document.createComment('comment'))).toBeNull();
    expect(cloneSafeMessageNode(tooltip)).toBeNull();
  });

  it('clones message nodes without duplicate ids or tooltip attributes', () => {
    const node = document.createElement('span');
    node.id = 'message';
    node.title = 'tooltip';
    node.innerHTML = '<span id="child" shared-tooltip-text=":wave:">visible</span><tp-yt-paper-tooltip>ignored</tp-yt-paper-tooltip>';

    const clone = cloneSafeMessageNode(node);

    expect(clone).toBeInstanceOf(Element);
    const element = clone as Element;
    expect(element.id).toBe('');
    expect(element.getAttribute('title')).toBeNull();
    expect(element.querySelector('[id]')).toBeNull();
    expect(element.querySelector('[shared-tooltip-text]')).toBeNull();
    expect(element.querySelector('tp-yt-paper-tooltip')).toBeNull();
    expect(element.textContent).toBe('visible');
  });
});
