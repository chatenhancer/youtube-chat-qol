import { describe, expect, it } from 'vitest';
import {
  cleanAuthorNameText,
  getAuthorHandleForUrl,
  getAuthorNameFromElement,
  getAuthorNameFromRendererText
} from './authors';

describe('YouTube author helpers', () => {
  it('strips verified badge text from handles', () => {
    expect(cleanAuthorNameText('@ExampleCreator Verified Verified')).toBe('@ExampleCreator');
    expect(getAuthorHandleForUrl('@ExampleCreator Verified')).toBe('@ExampleCreator');
  });

  it('prefers renderer handle text before badge runs', () => {
    expect(getAuthorNameFromRendererText({
      runs: [
        { text: '@ExampleCreator' },
        { text: ' Verified' }
      ]
    })).toBe('@ExampleCreator');
  });

  it('prefers direct text from author elements over nested badge text', () => {
    const author = document.createElement('span');
    author.append('@ExampleCreator');
    const badge = document.createElement('span');
    badge.textContent = 'Verified';
    author.append(badge);

    expect(getAuthorNameFromElement(author)).toBe('@ExampleCreator');
  });
});
