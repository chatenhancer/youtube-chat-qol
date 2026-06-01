import { describe, expect, it } from 'vitest';
import {
  createNodesWithPlaceholders,
  createTranslationPlanFromNodes,
  hasTextOutsidePlaceholders,
  restorePlaceholdersToText
} from './protected-placeholders';
import { getPlainTextFromMessageNodes } from '../../youtube/message-content';

describe('translation protected placeholders', () => {
  it('protects mentions and emoji while keeping translatable text', () => {
    const message = document.createElement('span');
    message.append('Hello ');
    const emoji = document.createElement('img');
    emoji.alt = ':wave:';
    message.append(emoji, ' @ExampleUser');

    const plan = createTranslationPlanFromNodes(Array.from(message.childNodes), message.textContent || '');

    expect(plan.text).toMatch(/^Hello §0§ §1§$/);
    expect(plan.protectedTokens.map((token) => token.fallbackText)).toEqual([':wave:', '@ExampleUser']);
    expect(hasTextOutsidePlaceholders(plan.text)).toBe(true);
    expect(restorePlaceholdersToText('Hola §0§ §1§', plan.protectedTokens)).toBe('Hola :wave: @ExampleUser');
  });

  it('treats emoji-only messages as placeholder-only', () => {
    const message = document.createElement('span');
    const firstEmoji = document.createElement('img');
    firstEmoji.alt = ':first:';
    const secondEmoji = document.createElement('img');
    secondEmoji.alt = ':second:';
    message.append(firstEmoji, ' ', secondEmoji);

    const plan = createTranslationPlanFromNodes(Array.from(message.childNodes), '');

    expect(plan.text).toBe('§0§');
    expect(plan.protectedTokens).toHaveLength(1);
    expect(plan.protectedTokens[0].fallbackText).toBe(':first: :second:');
    expect(hasTextOutsidePlaceholders(plan.text)).toBe(false);
    expect(restorePlaceholdersToText(plan.text, plan.protectedTokens)).toBe(':first: :second:');
  });

  it('restores missing protected tokens when the translation drops placeholders', () => {
    const message = document.createElement('span');
    message.textContent = 'Hi @ExampleUser';
    const plan = createTranslationPlanFromNodes(Array.from(message.childNodes), message.textContent);
    const restoredNodes = createNodesWithPlaceholders('Hola', plan.protectedTokens);

    expect(getPlainTextFromMessageNodes(restoredNodes)).toBe('Hola @ExampleUser');
  });

  it('keeps punctuation outside protected mention placeholders', () => {
    const message = document.createElement('span');
    message.textContent = 'Hello (@ExampleUser).';

    const plan = createTranslationPlanFromNodes(Array.from(message.childNodes), message.textContent);

    expect(plan.text).toBe('Hello (§0§).');
    expect(plan.protectedTokens[0].fallbackText).toBe('@ExampleUser');
    expect(restorePlaceholdersToText('Hola (§0§).', plan.protectedTokens)).toBe('Hola (@ExampleUser).');
  });

  it('compresses adjacent unicode emoji with whitespace into one protected run', () => {
    const message = document.createElement('span');
    message.textContent = 'Before 😀 😃 after';

    const plan = createTranslationPlanFromNodes(Array.from(message.childNodes), message.textContent);

    expect(plan.text).toBe('Before §0§ after');
    expect(plan.protectedTokens).toHaveLength(1);
    expect(plan.protectedTokens[0].fallbackText).toBe('😀 😃');
  });

  it('ignores hidden and aria-hidden content while planning translation text', () => {
    const message = document.createElement('span');
    const hidden = document.createElement('span');
    const ariaHidden = document.createElement('span');
    hidden.hidden = true;
    hidden.textContent = 'hidden text';
    ariaHidden.setAttribute('aria-hidden', 'true');
    ariaHidden.textContent = 'aria text';
    message.append('Visible ', hidden, ariaHidden, 'text');
    document.body.append(message);

    const plan = createTranslationPlanFromNodes(Array.from(message.childNodes), message.textContent || '');

    expect(plan.text).toBe('Visible text');
  });

  it('removes leaked emoji shortcodes while restoring protected emoji nodes', () => {
    const emoji = document.createElement('img');
    emoji.alt = ':face-red-heart-shape:';
    const plan = createTranslationPlanFromNodes([emoji], '');

    const restoredNodes = createNodesWithPlaceholders('Hola :face-red-heart-shape: §0§', plan.protectedTokens);

    expect(getPlainTextFromMessageNodes(restoredNodes).replace(/\s+/g, ' '))
      .toBe('Hola :face-red-heart-shape:');
    expect(restoredNodes.some((node) => node instanceof HTMLImageElement)).toBe(true);
  });
});
