import { describe, expect, it } from 'vitest';
import { isExtensionManagedElement } from '../../shared/managed-dom';
import { PRESERVED_MENTION_TOKEN_CLASS } from '../../shared/mention-tokens';
import {
  clearProfileMentions,
  decorateProfileMentions,
  PROFILE_MENTION_CLASS,
  type ProfileMentionResolver
} from './mentions';

const resolveEveryMention: ProfileMentionResolver = (identity) => identity;

describe('profile mention decoration', () => {
  it('turns handle tokens into accessible controls while preserving message text', () => {
    const root = document.createElement('span');
    root.innerHTML =
      'Email person@example.com; ask @Viewer.One, <strong>@友達_user</strong> and @x-y!';
    const originalText = root.textContent;

    decorateProfileMentions(root, resolveEveryMention);

    const mentions = Array.from(root.querySelectorAll<HTMLElement>(`.${PROFILE_MENTION_CLASS}`));
    expect(mentions.map((mention) => mention.textContent)).toEqual([
      '@Viewer.One',
      '@友達_user',
      '@x-y'
    ]);
    expect(root.textContent).toBe(originalText);
    expect(root.querySelector('.ytcq-profile-mention')?.parentElement).toBe(root);
    mentions.forEach((mention) => {
      expect(mention.dataset.ytcqProfileMention).toBe(mention.textContent);
      expect(mention.getAttribute('role')).toBe('button');
      expect(mention.tabIndex).toBe(0);
      expect(isExtensionManagedElement(mention)).toBe(true);
    });
  });

  it('is idempotent, skips tooltip text, and can restore the original DOM text', () => {
    const root = document.createElement('span');
    root.innerHTML = 'Hello @Viewer <span role="tooltip">@Hidden</span>';

    decorateProfileMentions(root, resolveEveryMention);
    const mention = root.querySelector<HTMLElement>(`.${PROFILE_MENTION_CLASS}`);
    decorateProfileMentions(root, resolveEveryMention);

    expect(root.querySelectorAll(`.${PROFILE_MENTION_CLASS}`)).toHaveLength(1);
    expect(root.querySelector(`.${PROFILE_MENTION_CLASS}`)).toBe(mention);

    clearProfileMentions(root);

    expect(root.querySelector(`.${PROFILE_MENTION_CLASS}`)).toBeNull();
    expect(root.textContent).toBe('Hello @Viewer @Hidden');
  });

  it('reuses and preserves a native linked mention instead of nesting a control inside it', () => {
    const root = document.createElement('span');
    root.innerHTML = '<a href="/channel/linked-channel">@LinkedViewer</a>';
    const link = root.querySelector<HTMLAnchorElement>('a')!;

    decorateProfileMentions(root, resolveEveryMention);

    expect(root.querySelector(`a.${PROFILE_MENTION_CLASS}`)).toBe(link);
    expect(link.dataset.ytcqProfileMention).toBe('@LinkedViewer');
    expect(link.querySelector(`.${PROFILE_MENTION_CLASS}`)).toBeNull();

    clearProfileMentions(root);

    expect(root.querySelector('a')).toBe(link);
    expect(link.getAttribute('href')).toBe('/channel/linked-channel');
    expect(link.classList.contains(PROFILE_MENTION_CLASS)).toBe(false);
    expect(link.dataset.ytcqProfileMention).toBeUndefined();
    expect(link.dataset.ytcqProfileMentionChannelId).toBeUndefined();
  });

  it('does not nest a mention control inside a link that contains other text', () => {
    const root = document.createElement('span');
    root.innerHTML = '<a href="https://example.com">See @LinkedViewer here</a>';

    decorateProfileMentions(root, resolveEveryMention);

    expect(root.querySelector('.ytcq-profile-mention')).toBeNull();
    expect(root.textContent).toBe('See @LinkedViewer here');
  });

  it('leaves handles as plain text when they do not resolve to recent user history', () => {
    const root = document.createElement('span');
    root.textContent = 'Ask @KnownViewer or @MissingViewer';

    decorateProfileMentions(root, ({ authorName }) =>
      authorName?.toLowerCase() === '@knownviewer'
        ? { authorName: '@KnownViewer', channelId: 'known-channel' }
        : null
    );

    const mention = root.querySelector<HTMLElement>(`.${PROFILE_MENTION_CLASS}`);
    expect(mention?.textContent).toBe('@KnownViewer');
    expect(mention?.dataset.ytcqProfileMentionChannelId).toBe('known-channel');
    expect(root.textContent).toBe('Ask @KnownViewer or @MissingViewer');
    expect(root.querySelectorAll(`.${PROFILE_MENTION_CLASS}`)).toHaveLength(1);
  });

  it('upgrades a preserved highlighted handle without replacing its keyword markup', () => {
    const root = document.createElement('span');
    root.innerHTML = `Ask <span class="${PRESERVED_MENTION_TOKEN_CLASS}">@Known<span class="ytcq-chat-keyword-highlight">Viewer</span></span>`;
    const preservedToken = root.querySelector<HTMLElement>(`.${PRESERVED_MENTION_TOKEN_CLASS}`)!;
    let hasMatch = false;
    const resolveMention: ProfileMentionResolver = (identity) => (hasMatch ? identity : null);

    decorateProfileMentions(root, resolveMention);
    expect(root.querySelector(`.${PROFILE_MENTION_CLASS}`)).toBeNull();

    hasMatch = true;
    decorateProfileMentions(root, resolveMention);

    expect(root.querySelector(`.${PROFILE_MENTION_CLASS}`)).toBe(preservedToken);
    expect(preservedToken.getAttribute('role')).toBe('button');
    expect(preservedToken.querySelector('.ytcq-chat-keyword-highlight')?.textContent).toBe(
      'Viewer'
    );
    expect(root.textContent).toBe('Ask @KnownViewer');
  });

  it('removes an existing mention control when its matching history disappears', () => {
    const root = document.createElement('span');
    root.textContent = 'Ask @Viewer';
    let hasMatch = true;
    const resolveMention: ProfileMentionResolver = (identity) => (hasMatch ? identity : null);

    decorateProfileMentions(root, resolveMention);
    expect(root.querySelector(`.${PROFILE_MENTION_CLASS}`)).not.toBeNull();

    hasMatch = false;
    decorateProfileMentions(root, resolveMention);

    expect(root.querySelector(`.${PROFILE_MENTION_CLASS}`)).toBeNull();
    expect(root.textContent).toBe('Ask @Viewer');
  });
});
