import { describe, expect, it } from 'vitest';
import {
  cloneProtectedTokens,
  createTranslationPlan,
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

  it('plans translation from visible DOM emoji nodes', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const messageText = document.createElement('span');
    messageText.id = 'message';
    messageText.append(
      createEmojiImage(':wave:'),
      ' ',
      createEmojiImage(':sparkles:'),
      ' hello @ExampleUser!',
      createEmojiImage('custom-heart'),
      ' ',
      createEmojiImage(':second:')
    );
    message.append(messageText);

    const plan = createTranslationPlan(message, ':wave: :sparkles: hello @ExampleUser!custom-heart :second:');

    expect(plan.text).toBe('§0§ hello §1§!§2§');
    expect(plan.protectedTokens.map((token) => token.fallbackText)).toEqual([
      ':wave: :sparkles:',
      '@ExampleUser',
      'custom-heart :second:'
    ]);
  });

  it('restores DOM emoji nodes when message text contains only emoji images', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const messageText = document.createElement('span');
    messageText.id = 'message';
    const emoji = document.createElement('img');
    emoji.alt = ':wave:';
    messageText.append(emoji);
    messageText.append(' hello');
    message.append(messageText);

    const plan = createTranslationPlan(message, ':wave: hello');
    const restored = createNodesWithPlaceholders(plan.text, plan.protectedTokens);

    expect(plan.text).toBe('§0§ hello');
    expect(restored[0]).toBeInstanceOf(HTMLImageElement);
  });

  it('keeps pending whitespace as text when an emoji run ends before normal content', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = `
      <span id="message"><img alt=":wave:">   <span></span>hello</span>
    `;

    const plan = createTranslationPlan(message, ':wave:   hello');

    expect(plan.text).toBe('§0§ hello');
    expect(plan.protectedTokens[0].fallbackText).toBe(':wave:');
  });

  it('keeps DOM whitespace outside emoji runs when the run is interrupted', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.innerHTML = `
      <span id="message"><img alt=":wave:">   <span></span><img alt=":sparkles:"></span>
    `;

    const plan = createTranslationPlan(message, ':wave:   :sparkles:');

    expect(plan.text).toBe('§0§ §1§');
    expect(plan.protectedTokens.map((token) => token.fallbackText)).toEqual([':wave:', ':sparkles:']);
  });

  it('falls back to original text when no DOM nodes are available', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');

    const plan = createTranslationPlan(message, 'hello @ExampleUser 😀');

    expect(plan.text).toBe('hello §0§ §1§');
    expect(plan.protectedTokens.map((token) => token.fallbackText)).toEqual(['@ExampleUser', '😀']);
  });

  it('falls back to original text for empty node lists', () => {
    const plan = createTranslationPlanFromNodes([], 'hello @ExampleUser');

    expect(plan.text).toBe('hello §0§');
    expect(plan.protectedTokens[0].fallbackText).toBe('@ExampleUser');
  });

  it('protects emoji-like elements by id or class and ignores non-element nodes', () => {
    const classEmoji = document.createElement('span');
    classEmoji.className = 'custom-emoji-sprite';
    classEmoji.textContent = 'plain-custom-emoji';
    const idEmoji = document.createElement('span');
    idEmoji.id = 'emoji-renderer';
    idEmoji.textContent = 'plain-id-emoji';
    const comment = document.createComment('ignored comment');

    const plan = createTranslationPlanFromNodes([
      document.createTextNode('hello '),
      comment,
      classEmoji,
      idEmoji
    ], '');

    expect(plan.text).toBe('hello §0§');
    expect(plan.protectedTokens[0].fallbackText).toBe('plain-custom-emojiplain-id-emoji');
  });

  it('protects emoji-like DOM leaves and ignores replacement icons and menu text', () => {
    const roleEmoji = document.createElement('span');
    roleEmoji.setAttribute('role', 'img');
    roleEmoji.setAttribute('aria-label', ':party:');
    const classEmoji = document.createElement('span');
    classEmoji.className = 'yt-emoji';
    classEmoji.title = ':class-emoji:';
    const wrappedEmoji = document.createElement('span');
    const image = document.createElement('img');
    image.alt = ':wrapped:';
    wrappedEmoji.append(image);
    const shortcodeLeaf = document.createElement('span');
    shortcodeLeaf.textContent = ':shortcode:';
    const replacementIcon = document.createElement('span');
    replacementIcon.className = 'ytcq-replaced-translation-icon';
    replacementIcon.textContent = 'translate icon';
    const menuItem = document.createElement('span');
    menuItem.setAttribute('role', 'menuitem');
    menuItem.textContent = 'menu text';

    const plan = createTranslationPlanFromNodes([
      document.createTextNode('hello '),
      roleEmoji,
      classEmoji,
      wrappedEmoji,
      shortcodeLeaf,
      replacementIcon,
      menuItem
    ], '');

    expect(plan.text).toBe('hello §0§');
    expect(plan.protectedTokens.map((token) => token.fallbackText)).toEqual([
      ':party::class-emoji::wrapped::shortcode:'
    ]);
  });

  it('handles emoji-like ids, child-image wrappers with empty text, and title fallbacks', () => {
    const idEmoji = document.createElement('span');
    idEmoji.id = 'emoji-sprite';
    idEmoji.setAttribute('aria-label', ':id-emoji:');
    const childImageWrapper = document.createElement('span');
    const image = document.createElement('img');
    image.setAttribute('aria-label', ':child-image:');
    childImageWrapper.append(image);
    const titleOnly = document.createElement('img');
    titleOnly.title = ':title-only:';

    const plan = createTranslationPlanFromNodes([idEmoji, childImageWrapper, titleOnly], '');

    expect(plan.text).toBe('§0§');
    expect(plan.protectedTokens[0].fallbackText).toBe(':id-emoji::child-image::title-only:');
  });

  it('uses child-image wrapper detection when wrapper text is empty', () => {
    const wrapper = document.createElement('span');
    const image = document.createElement('img');
    image.alt = ':wrapped-only:';
    wrapper.append(image);

    const plan = createTranslationPlanFromNodes([wrapper], '');

    expect(plan.text).toBe('§0§');
    expect(plan.protectedTokens[0].fallbackText).toBe(':wrapped-only:');
  });

  it('does not treat child-image wrappers with visible text as one emoji', () => {
    const wrapper = document.createElement('span');
    const image = document.createElement('img');
    image.alt = 'wrapped image';
    wrapper.append(image, ' visible label');

    const plan = createTranslationPlanFromNodes([wrapper], '');

    expect(plan.text).toBe('§0§ visible label');
    expect(plan.protectedTokens[0].fallbackText).toBe('wrapped image');
  });

  it('protects nested emoji leaves through the single-node token path', () => {
    const wrapper = document.createElement('span');
    const nested = document.createElement('span');
    nested.setAttribute('role', 'img');
    nested.setAttribute('aria-label', ':nested:');
    wrapper.append('hello ', nested);

    const plan = createTranslationPlanFromNodes([wrapper], '');
    const restored = createNodesWithPlaceholders(plan.text, plan.protectedTokens);

    expect(plan.text).toBe('hello §0§');
    expect(restored.at(-1)).toBeInstanceOf(HTMLSpanElement);
  });

  it('allows blank emoji fallback text without throwing', () => {
    const blankEmoji = document.createElement('span');
    blankEmoji.setAttribute('role', 'img');

    const plan = createTranslationPlanFromNodes([blankEmoji], '');

    expect(plan.text).toBe('§0§');
    expect(plan.protectedTokens[0].fallbackText).toBe('');
    expect(restorePlaceholdersToText(plan.text, plan.protectedTokens)).toBe('');
  });

  it('ignores connected elements hidden by CSS while preserving visible siblings', () => {
    const visible = document.createElement('span');
    visible.textContent = 'visible';
    const displayNone = document.createElement('span');
    displayNone.style.display = 'none';
    displayNone.textContent = 'display none';
    const invisible = document.createElement('span');
    invisible.style.visibility = 'hidden';
    invisible.textContent = 'invisible';
    const root = document.createElement('span');
    root.append(visible, displayNone, invisible);
    document.body.append(root);

    const plan = createTranslationPlanFromNodes(Array.from(root.childNodes), root.textContent || '');

    expect(plan.text).toBe('visible');
  });

  it('restores spaced placeholders and can clone protected token nodes safely', () => {
    const emoji = document.createElement('img');
    emoji.alt = ':wave:';
    const plan = createTranslationPlanFromNodes([emoji], '');
    const clones = cloneProtectedTokens(plan.protectedTokens);

    expect(clones[0].node).not.toBe(plan.protectedTokens[0].node);
    expect(restorePlaceholdersToText('hello § 0 §', clones)).toBe('hello :wave:');
  });

  it('restores protected DOM nodes in placeholder positions', () => {
    const emoji = document.createElement('img');
    emoji.alt = ':wave:';
    const plan = createTranslationPlanFromNodes([emoji], '');

    const restoredNodes = createNodesWithPlaceholders('Hola §0§', plan.protectedTokens);

    expect(restoredNodes.at(-1)).toBeInstanceOf(HTMLImageElement);
    expect(restoredNodes.at(-1)).not.toBe(emoji);
    expect(getPlainTextFromMessageNodes(restoredNodes)).toBe('Hola :wave:');
  });

  it('returns plain text nodes when there are no placeholder matches', () => {
    const nodes = createNodesWithPlaceholders('plain text', []);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toBe('plain text');
    expect(hasTextOutsidePlaceholders('§ 0 §')).toBe(false);
  });

  it('handles nullish and empty placeholder restore inputs', () => {
    const emptyNodes = createNodesWithPlaceholders('', []);
    const nullOriginal = createTranslationPlanFromNodes([], null as unknown as string);

    expect(emptyNodes).toHaveLength(1);
    expect(emptyNodes[0].textContent).toBe('');
    expect(nullOriginal.text).toBe('');
    expect(hasTextOutsidePlaceholders(null as unknown as string)).toBe(false);
    expect(restorePlaceholdersToText(null as unknown as string, [])).toBe('');
  });

  it('restores missing tokens with spacing and fallback nodes', () => {
    const node = document.createElement('span');
    node.textContent = '@NodeUser';
    const restoredWithNode = createNodesWithPlaceholders('Hola', [{
      fallbackText: '@NodeUser',
      node,
      nodes: [],
      placeholder: '§0§'
    }]);
    const restoredWithFallback = createNodesWithPlaceholders('Hola ', [{
      fallbackText: '@FallbackUser',
      node: null,
      nodes: [],
      placeholder: '§0§'
    }]);
    const restoredMissingToken = createNodesWithPlaceholders('Hola §3§', []);
    const restoredUndefinedToken = createNodesWithPlaceholders('Hola', [undefined as never]);
    const restoredAfterElement = createNodesWithPlaceholders('Hola §0§', [
      {
        fallbackText: '@FirstUser',
        node,
        nodes: [],
        placeholder: '§0§'
      },
      {
        fallbackText: '@SecondUser',
        node: null,
        nodes: [],
        placeholder: '§1§'
      }
    ]);

    expect(getPlainTextFromMessageNodes(restoredWithNode)).toBe('Hola @NodeUser');
    expect(getPlainTextFromMessageNodes(restoredWithFallback)).toBe('Hola @FallbackUser');
    expect(getPlainTextFromMessageNodes(restoredMissingToken)).toBe('Hola ');
    expect(getPlainTextFromMessageNodes(restoredUndefinedToken)).toBe('Hola');
    expect(getPlainTextFromMessageNodes(restoredAfterElement)).toBe('Hola @NodeUser@SecondUser');
  });
});

function createEmojiImage(alt: string): HTMLImageElement {
  const image = document.createElement('img');
  image.alt = alt;
  return image;
}
