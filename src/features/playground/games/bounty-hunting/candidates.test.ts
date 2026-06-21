import { describe, expect, it } from 'vitest';
import {
  countBountyHuntingObservedCandidateTypes,
  createBountyHuntingBountiesFromMessages,
  findBountyHuntingMatchingBounty,
  getBountyHuntingObservedMessage
} from './candidates';
import type { BountyHuntingObservedMessage } from './types';

describe('Bounty Hunting bounty candidates', () => {
  it('chooses six bounties from observed chat signals', () => {
    const messages = [
      message('m1', { hasAllCaps: true }),
      message('m2', { hasQuestion: true }),
      message('m3', { emojiCount: 3, hasMention: true }),
      message('m4', { hasNumber: true }),
      message('m5', { isTopFanAuthor: true }),
      message('m6', { isVerifiedAuthor: true }),
      message('m7', { isVerifiedAuthor: true })
    ];
    const bounties = createBountyHuntingBountiesFromMessages(messages);

    expect(bounties).toHaveLength(6);
    expect(bounties.map((bounty) => bounty.id)).not.toContain('has-link');
    expect(bounties.map((bounty) => bounty.id)).toContain('top-chatters');
    expect(bounties.map((bounty) => bounty.id)).toContain('verified-author');
    expect(bounties.every((bounty) => bounty.description)).toBe(true);
    expect(bounties.every((bounty) => bounty.descriptionKey)).toBe(true);
    expect(countBountyHuntingObservedCandidateTypes(messages)).toBe(7);
  });

  it('adds YouTube-native privacy-safe bounties when those facts are observed', () => {
    const bounties = createBountyHuntingBountiesFromMessages([
      message('m1', { isChannelMemberAuthor: true }),
      message('m2', { isModeratorAuthor: true }),
      message('m3', { isChannelOwnerAuthor: true }),
      message('m4', { isSuperChat: true }),
      message('m5', { hasCustomEmoji: true }),
      message('m6', { hasOnlyEmojis: true })
    ]);

    expect(bounties.map((bounty) => bounty.id)).toEqual([
      'channel-owner',
      'super-chat',
      'channel-member',
      'moderator',
      'only-emojis',
      'custom-emoji'
    ]);
  });

  it('finds the highest value open bounty for a message', () => {
    const bounties = createBountyHuntingBountiesFromMessages([]);
    const match = findBountyHuntingMatchingBounty(bounties, message('m1', {
      hasMention: true,
      hasNumber: true,
      hasQuestion: true
    }));

    expect(match?.id).toBe('mention-user');
    expect(match?.amount).toBe(125);
  });

  it('detects YouTube Top fan rank badges on chat messages', () => {
    const chatMessage = document.createElement('yt-live-chat-text-message-renderer');
    chatMessage.setAttribute('data-message-id', 'message-ranked');
    chatMessage.innerHTML = `
      <span id="author-name">@RankedFan</span>
      <div id="before-content-buttons">
        <yt-button-view-model>
          <button-view-model>
            <button class="ytSpecButtonShapeNextHost" aria-label="#2">
              <div class="ytSpecButtonShapeNextButtonTextContent">#2</div>
            </button>
          </button-view-model>
        </yt-button-view-model>
      </div>
      <span id="message">thanks for the stream</span>
    `;

    const observed = getBountyHuntingObservedMessage(chatMessage);

    expect(observed).toMatchObject({
      isTopFanAuthor: true,
      messageId: 'message-ranked'
    });
  });

  it('does not treat typed rank text as a Top fan badge', () => {
    const chatMessage = document.createElement('yt-live-chat-text-message-renderer');
    chatMessage.setAttribute('data-message-id', 'message-rank-text');
    chatMessage.innerHTML = `
      <span id="author-name">@RegularFan</span>
      <span id="message">I am #2 today</span>
    `;

    const observed = getBountyHuntingObservedMessage(chatMessage);

    expect(observed).toMatchObject({
      isTopFanAuthor: false,
      messageId: 'message-rank-text'
    });
  });

  it('detects badges, Super Chats, custom emoji, and emoji-only messages locally', () => {
    const message = document.createElement('yt-live-chat-paid-message-renderer');
    message.setAttribute('data-message-id', 'message-2');
    message.innerHTML = `
      <yt-live-chat-author-badge-renderer type="member"></yt-live-chat-author-badge-renderer>
      <yt-live-chat-author-badge-renderer type="moderator"></yt-live-chat-author-badge-renderer>
      <yt-live-chat-author-badge-renderer aria-label="Channel owner"></yt-live-chat-author-badge-renderer>
      <span id="message">
        <img alt=":party_parrot:" data-emoji-id="custom-1">
        <img alt="🤠">
      </span>
    `;

    const observed = getBountyHuntingObservedMessage(message);

    expect(observed).toMatchObject({
      hasCustomEmoji: true,
      hasOnlyEmojis: true,
      isChannelMemberAuthor: true,
      isChannelOwnerAuthor: true,
      isModeratorAuthor: true,
      isSuperChat: true,
      messageId: 'message-2'
    });
  });
});

function message(
  messageId: string,
  overrides: Partial<BountyHuntingObservedMessage> = {}
): BountyHuntingObservedMessage {
  return {
    emojiCount: 0,
    hasAllCaps: false,
    hasCustomEmoji: false,
    hasMention: false,
    hasNumber: false,
    hasOnlyEmojis: false,
    hasQuestion: false,
    isChannelMemberAuthor: false,
    isChannelOwnerAuthor: false,
    isModeratorAuthor: false,
    isSuperChat: false,
    isTopFanAuthor: false,
    isVerifiedAuthor: false,
    messageId,
    ...overrides
  };
}
