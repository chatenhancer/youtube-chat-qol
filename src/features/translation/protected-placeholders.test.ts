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
});
