/**
 * Clickable profile mentions.
 *
 * Wraps visible @handles without replacing surrounding YouTube message nodes,
 * so profile-card coordination can open recent history for the mentioned user.
 */
import { t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import { findMentionTokens, PRESERVED_MENTION_TOKEN_CLASS } from '../../shared/mention-tokens';
import { CHAT_MESSAGE_SELECTOR, CHAT_TOOLTIP_SELECTOR } from '../../youtube/selectors';
import { getUserMessagesForIdentity, type UserIdentity } from '../user-message-history';

export const PROFILE_MENTION_CLASS = 'ytcq-profile-mention';

const PROFILE_MENTION_SELECTOR = `.${PROFILE_MENTION_CLASS}`;
const PROFILE_MENTION_CREATED_ATTRIBUTE = 'data-ytcq-profile-mention-created';
const PRESERVED_MENTION_TOKEN_SELECTOR = `.${PRESERVED_MENTION_TOKEN_CLASS}`;
const CHAT_MESSAGE_TEXT_SELECTOR = '[id="message"], .ytcq-translation';
const VISIBLE_MESSAGE_TEXT_SELECTOR = [
  `:is(${CHAT_MESSAGE_SELECTOR}) [id="message"]`,
  `:is(${CHAT_MESSAGE_SELECTOR}) .ytcq-translation`,
  '.ytcq-profile-card-message-text',
  '.ytcq-focus-bubble'
].join(',');

export type ProfileMentionResolver = (identity: UserIdentity) => UserIdentity | null;

export function decorateProfileMentions(
  root: HTMLElement | null,
  resolveMention: ProfileMentionResolver = resolveProfileMentionIdentity
): void {
  if (!root) return;

  refreshExistingProfileMentions(root, resolveMention);
  decoratePreservedProfileMentionTokens(root, resolveMention);

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && shouldDecorateTextNode(current)) textNodes.push(current);
    current = walker.nextNode();
  }

  textNodes.forEach((node) => decorateProfileMentionTextNode(node, resolveMention));
}

export function decorateChatMessageProfileMentions(message: HTMLElement): void {
  message
    .querySelectorAll<HTMLElement>(CHAT_MESSAGE_TEXT_SELECTOR)
    .forEach((root) => decorateProfileMentions(root));
}

export function refreshVisibleProfileMentions(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches(VISIBLE_MESSAGE_TEXT_SELECTOR)) {
    decorateProfileMentions(root);
  }
  root
    .querySelectorAll<HTMLElement>(VISIBLE_MESSAGE_TEXT_SELECTOR)
    .forEach((messageText) => decorateProfileMentions(messageText));
}

export function clearProfileMentions(root: ParentNode = document): void {
  const parents = new Set<Node>();
  root.querySelectorAll<HTMLElement>(PROFILE_MENTION_SELECTOR).forEach((mention) => {
    if (mention.classList.contains(PRESERVED_MENTION_TOKEN_CLASS)) {
      clearProfileMentionAttributes(mention);
      return;
    }
    if (!mention.hasAttribute(PROFILE_MENTION_CREATED_ATTRIBUTE)) {
      clearProfileMentionAttributes(mention);
      return;
    }
    if (mention.parentNode) parents.add(mention.parentNode);
    mention.replaceWith(...Array.from(mention.childNodes));
  });
  parents.forEach((parent) => parent.normalize());
}

export function getProfileMentionTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(PROFILE_MENTION_SELECTOR) : null;
}

export function getProfileMentionAuthorName(mention: HTMLElement): string {
  return mention.dataset.ytcqProfileMention || '';
}

export function getProfileMentionChannelId(mention: HTMLElement): string | undefined {
  return mention.dataset.ytcqProfileMentionChannelId || getLinkedChannelId(mention);
}

export function resolveProfileMentionIdentity(identity: UserIdentity): UserIdentity | null {
  const userMessages = getUserMessagesForIdentity(identity);
  const latestMessage = userMessages[userMessages.length - 1];
  if (!latestMessage?.authorName) return null;

  return {
    authorName: latestMessage.authorName,
    channelId: identity.channelId || latestMessage.channelId
  };
}

function refreshExistingProfileMentions(
  root: HTMLElement,
  resolveMention: ProfileMentionResolver
): void {
  const parents = new Set<Node>();
  root.querySelectorAll<HTMLElement>(PROFILE_MENTION_SELECTOR).forEach((mention) => {
    const authorName = mention.textContent?.trim() || getProfileMentionAuthorName(mention);
    const identity = authorName
      ? resolveMention({
          authorName,
          channelId: getProfileMentionChannelId(mention)
        })
      : null;
    if (identity) {
      applyProfileMentionIdentity(mention, authorName, identity);
      return;
    }

    if (mention.classList.contains(PRESERVED_MENTION_TOKEN_CLASS)) {
      clearProfileMentionAttributes(mention);
      return;
    }
    if (!mention.hasAttribute(PROFILE_MENTION_CREATED_ATTRIBUTE)) {
      clearProfileMentionAttributes(mention);
      return;
    }
    if (mention.parentNode) parents.add(mention.parentNode);
    mention.replaceWith(...Array.from(mention.childNodes));
  });
  parents.forEach((parent) => parent.normalize());
}

function decoratePreservedProfileMentionTokens(
  root: HTMLElement,
  resolveMention: ProfileMentionResolver
): void {
  root.querySelectorAll<HTMLElement>(PRESERVED_MENTION_TOKEN_SELECTOR).forEach((token) => {
    const authorName = token.textContent?.trim() || '';
    const [parsedToken] = findMentionTokens(authorName);
    if (!parsedToken || parsedToken.index !== 0 || parsedToken.text.length !== authorName.length) {
      return;
    }

    const link = token.closest<HTMLAnchorElement>('a[href]');
    if (link && link.textContent?.trim() !== authorName) return;
    const mention = link || token;
    const identity = resolveMention({
      authorName,
      channelId: link ? getLinkedChannelId(link) : undefined
    });
    if (!identity) return;

    mention.classList.add(PROFILE_MENTION_CLASS);
    if (mention === token) {
      mention.setAttribute('role', 'button');
      mention.tabIndex = 0;
      mention.title = t('showRecentMessages');
      mention.setAttribute(PROFILE_MENTION_CREATED_ATTRIBUTE, 'true');
    }
    applyProfileMentionIdentity(mention, authorName, identity);
  });
}

function shouldDecorateTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent || parent.closest(PROFILE_MENTION_SELECTOR)) return false;
  if (parent.closest(PRESERVED_MENTION_TOKEN_SELECTOR)) return false;
  if (parent.closest(CHAT_TOOLTIP_SELECTOR)) return false;
  if (parent.closest('.ytcq-replaced-translation-icon')) return false;
  return findMentionTokens(node.nodeValue || '').length > 0;
}

function decorateProfileMentionTextNode(node: Text, resolveMention: ProfileMentionResolver): void {
  const text = node.nodeValue || '';
  const linkedMention = getLinkedMention(node, text);
  if (linkedMention) {
    const identity = resolveMention({
      authorName: linkedMention.authorName,
      channelId: getLinkedChannelId(linkedMention.link)
    });
    if (!identity) return;
    linkedMention.link.classList.add(PROFILE_MENTION_CLASS);
    applyProfileMentionIdentity(linkedMention.link, linkedMention.authorName, identity);
    return;
  }
  if (node.parentElement?.closest('a[href]')) return;

  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const token of findMentionTokens(text)) {
    const authorName = token.text;
    const authorStart = token.index;
    const identity = resolveMention({ authorName });
    if (!identity) continue;
    if (authorStart > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, authorStart)));
    }

    const mention = el<HTMLSpanElement>(
      <span
        class={PROFILE_MENTION_CLASS}
        role="button"
        tabIndex={0}
        title={t('showRecentMessages')}
      >
        {authorName}
      </span>
    );
    applyProfileMentionIdentity(mention, authorName, identity);
    mention.setAttribute(PROFILE_MENTION_CREATED_ATTRIBUTE, 'true');
    fragment.append(mention);
    cursor = authorStart + authorName.length;
  }

  if (cursor === 0) return;
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  node.replaceWith(fragment);
}

function getLinkedMention(
  node: Text,
  text: string
): { authorName: string; link: HTMLAnchorElement } | null {
  const link = node.parentElement?.closest<HTMLAnchorElement>('a[href]');
  if (!link || link.textContent !== text) return null;

  const [token] = findMentionTokens(text);
  if (!token || token.index !== 0 || token.text.length !== text.length) return null;
  const authorName = token.text;
  return authorName ? { authorName, link } : null;
}

function applyProfileMentionIdentity(
  mention: HTMLElement,
  fallbackAuthorName: string,
  identity: UserIdentity
): void {
  mention.dataset.ytcqProfileMention = identity.authorName || fallbackAuthorName;
  if (identity.channelId) {
    mention.dataset.ytcqProfileMentionChannelId = identity.channelId;
  } else {
    delete mention.dataset.ytcqProfileMentionChannelId;
  }
}

function clearProfileMentionAttributes(mention: HTMLElement): void {
  const isPreservedToken = mention.classList.contains(PRESERVED_MENTION_TOKEN_CLASS);
  mention.classList.remove(PROFILE_MENTION_CLASS);
  delete mention.dataset.ytcqProfileMention;
  delete mention.dataset.ytcqProfileMentionChannelId;
  if (!isPreservedToken) return;
  mention.removeAttribute('role');
  mention.removeAttribute('tabindex');
  if (mention.title === t('showRecentMessages')) mention.removeAttribute('title');
}

function getLinkedChannelId(mention: HTMLElement): string | undefined {
  const href = mention.closest<HTMLAnchorElement>('a[href]')?.getAttribute('href') || '';
  if (!href) return undefined;

  try {
    const url = new URL(href, 'https://www.youtube.com');
    const [kind, channelId] = url.pathname.split('/').filter(Boolean);
    return kind === 'channel' && channelId ? channelId : undefined;
  } catch {
    return undefined;
  }
}
