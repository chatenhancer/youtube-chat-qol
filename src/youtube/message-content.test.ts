import { describe, expect, it } from 'vitest';
import {
  cloneSafeMessageNode,
  getElementTextFallback,
  getPlainTextFromMessageNodes
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
