import { describe, expect, it } from 'vitest';
import { parseLiteChatPayload } from './lite-chat-parser';

describe('Lite chat InnerTube parser', () => {
  it('normalizes a live text message, rich runs, author badges, and timeout without leaking transport data', () => {
    const result = parseLiteChatPayload({
      continuationContents: {
        liveChatContinuation: {
          actions: [{
            addChatItemAction: {
              item: {
                liveChatTextMessageRenderer: {
                  id: 'message-1',
                  timestampUsec: '1782000000000000',
                  timestampText: { simpleText: '10:30 PM' },
                  authorExternalChannelId: 'UC-example',
                  authorName: { simpleText: '@Example' },
                  authorPhoto: {
                    thumbnails: [{ url: 'https://yt3.ggpht.com/avatar-small' }, { url: '//yt3.ggpht.com/avatar-large' }]
                  },
                  authorBadges: [{
                    liveChatAuthorBadgeRenderer: {
                      tooltip: 'Moderator',
                      icon: { iconType: 'MODERATOR' },
                      customThumbnail: {
                        thumbnails: [{ url: 'https://yt3.ggpht.com/badge' }]
                      }
                    }
                  }],
                  message: {
                    runs: [
                      { text: 'Visit ' },
                      {
                        text: 'the site',
                        navigationEndpoint: {
                          urlEndpoint: { url: 'https://example.com/path' },
                          serviceEndpoint: { secret: 'must-not-cross' }
                        }
                      },
                      { text: ' ' },
                      {
                        emoji: {
                          emojiId: 'emoji-1',
                          shortcuts: [':wave:'],
                          image: {
                            thumbnails: [{ url: 'https://yt3.ggpht.com/emoji' }]
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }],
          continuations: [{
            invalidationContinuationData: {
              continuation: 'secret-continuation',
              timeoutMs: 10_000
            }
          }]
        }
      }
    });

    expect(result).toEqual({
      actions: [{
        type: 'upsert',
        record: {
          id: 'message-1',
          kind: 'text',
          author: {
            name: '@Example',
            channelId: 'UC-example',
            avatarUrl: 'https://yt3.ggpht.com/avatar-large',
            badges: [{
              label: 'Moderator',
              iconUrl: 'https://yt3.ggpht.com/badge',
              kind: 'moderator'
            }]
          },
          plainText: 'Visit the site :wave:',
          runs: [
            { text: 'Visit ', type: 'text' },
            { href: 'https://example.com/path', text: 'the site', type: 'text' },
            { text: ' ', type: 'text' },
            {
              alt: ':wave:',
              emojiId: 'emoji-1',
              imageUrl: 'https://yt3.ggpht.com/emoji',
              shortcuts: [':wave:'],
              type: 'emoji'
            }
          ],
          timestampText: '10:30 PM',
          timestampUsec: '1782000000000000'
        }
      }],
      compatibilityWarnings: [],
      continuationTimeoutMs: 10_000,
      fatalErrors: [],
      foundChat: true,
      unreadableFeed: false
    });
    expect(JSON.stringify(result)).not.toContain('secret-continuation');
    expect(JSON.stringify(result)).not.toContain('must-not-cross');
  });

  it('normalizes paid messages, stickers, memberships, and both gift announcements', () => {
    const result = parseLiteChatPayload({
      actions: [
        addItem('liveChatPaidMessageRenderer', {
          id: 'paid-1',
          authorName: { simpleText: '@Supporter' },
          purchaseAmountText: { simpleText: '$10.00' },
          message: { runs: [{ text: 'Great stream' }] },
          headerBackgroundColor: 0xff1565c0,
          bodyBackgroundColor: -1,
          bodyTextColor: 0xffffffff
        }),
        addItem('liveChatPaidStickerRenderer', {
          id: 'sticker-1',
          authorName: { simpleText: '@StickerFan' },
          purchaseAmountText: { simpleText: '€5.00' },
          sticker: {
            thumbnails: [{ url: 'https://yt3.ggpht.com/sticker' }],
            accessibility: { accessibilityData: { label: 'Thank you sticker' } }
          },
          moneyChipBackgroundColor: 0xff123456,
          moneyChipTextColor: 0xffabcdef
        }),
        addItem('liveChatMembershipItemRenderer', {
          id: 'member-1',
          authorName: { simpleText: '@Member' },
          headerSubtext: { simpleText: 'Member for 12 months' },
          message: { simpleText: 'Hello members!' }
        }),
        addItem('liveChatSponsorshipsGiftPurchaseAnnouncementRenderer', {
          id: 'gift-purchase-1',
          giftMembershipsCount: 5,
          header: {
            liveChatSponsorshipsHeaderRenderer: {
              authorName: { simpleText: '@Gifter' },
              primaryText: { simpleText: 'Gifted 5 memberships' },
              image: {
                thumbnails: [{ url: 'https://yt3.ggpht.com/gift' }],
                accessibility: { accessibilityData: { label: 'Gift box' } }
              }
            }
          }
        }),
        addItem('liveChatSponsorshipsGiftRedemptionAnnouncementRenderer', {
          id: 'gift-redemption-1',
          authorName: { simpleText: '@Recipient' },
          message: { simpleText: 'Received a gift membership' }
        })
      ]
    });

    expect(result.actions).toHaveLength(5);
    expect(getUpsert(result.actions, 'paid-1')).toMatchObject({
      colors: {
        bodyBackground: 0xffffffff,
        headerBackground: 0xff1565c0,
        text: 0xffffffff
      },
      kind: 'paid',
      paid: { amountText: '$10.00' },
      plainText: 'Great stream'
    });
    expect(getUpsert(result.actions, 'sticker-1')).toMatchObject({
      kind: 'sticker',
      sticker: {
        alt: 'Thank you sticker',
        amountText: '€5.00',
        imageUrl: 'https://yt3.ggpht.com/sticker'
      },
      colors: {
        bodyBackground: 0xff123456,
        text: 0xffabcdef
      }
    });
    expect(getUpsert(result.actions, 'member-1')).toMatchObject({
      kind: 'membership',
      membership: {
        headerText: 'Member for 12 months',
        subtext: 'Hello members!'
      }
    });
    expect(getUpsert(result.actions, 'gift-purchase-1')).toMatchObject({
      author: { name: '@Gifter' },
      gift: {
        alt: 'Gift box',
        count: 5,
        giftType: 'purchase',
        headerText: 'Gifted 5 memberships',
        imageUrl: 'https://yt3.ggpht.com/gift'
      },
      kind: 'gift'
    });
    expect(getUpsert(result.actions, 'gift-redemption-1')).toMatchObject({
      gift: {
        giftType: 'redemption',
        headerText: 'Received a gift membership'
      },
      kind: 'gift'
    });
  });

  it('marks channel owners and keeps verified status as a native-style badge', () => {
    const result = parseLiteChatPayload({
      actions: [addItem('liveChatTextMessageRenderer', {
        id: 'owner-message',
        authorName: { simpleText: '@Owner' },
        authorBadges: [
          {
            liveChatAuthorBadgeRenderer: {
              icon: { iconType: 'OWNER' },
              tooltip: 'Owner'
            }
          },
          {
            liveChatAuthorBadgeRenderer: {
              icon: { iconType: 'VERIFIED' },
              tooltip: 'Verified'
            }
          }
        ],
        message: { simpleText: 'Welcome' }
      })]
    });

    expect(getUpsert(result.actions, 'owner-message')?.author).toEqual({
      badges: [{ kind: 'verified', label: 'Verified' }],
      isOwner: true,
      name: '@Owner'
    });
  });

  it('normalizes current gift view models and ignores interactivity widget commands', () => {
    const result = parseLiteChatPayload({
      continuationContents: {
        liveChatContinuation: {
          actions: [
            {
              addChatItemAction: {
                item: {
                  giftMessageViewModel: {
                    id: 'gift-view-model-1',
                    authorName: { content: '@GiftSender ' },
                    authorAvatar: {
                      avatarViewModel: {
                        image: {
                          sources: [{ url: 'https://yt3.ggpht.com/gift-avatar', width: 64 }]
                        }
                      }
                    },
                    text: { content: 'sent France' },
                    giftImage: {
                      sources: [{ url: '//www.gstatic.com/youtube/img/pdg/gift/france.png' }]
                    },
                    giftImageA11yLabel: '@GiftSender sent a gift, France'
                  }
                }
              }
            },
            { addInteractivityWidgetAction: { widget: { widgetRenderer: {} } } },
            { updateOrAddInteractivityWidgetAction: { widget: { companionWidgetRenderer: {} } } }
          ]
        }
      }
    });

    expect(result.compatibilityWarnings).toEqual([]);
    expect(result.fatalErrors).toEqual([]);
    expect(result.unreadableFeed).toBe(false);
    expect(getUpsert(result.actions, 'gift-view-model-1')).toMatchObject({
      author: {
        avatarUrl: 'https://yt3.ggpht.com/gift-avatar',
        name: '@GiftSender'
      },
      gift: {
        alt: '@GiftSender sent a gift, France',
        giftType: 'purchase',
        headerText: 'sent France',
        imageUrl: 'https://www.gstatic.com/youtube/img/pdg/gift/france.png'
      },
      kind: 'gift',
      plainText: 'sent France'
    });
  });

  it('seeds initial renderer contents and handles replay, replace, remove, and author deletion actions', () => {
    const initial = parseLiteChatPayload({
      contents: {
        liveChatRenderer: {
          contents: {
            liveChatItemListRenderer: {
              contents: [textItem('initial-1', 'Initial message')]
            }
          }
        }
      }
    }, { initial: true });

    expect(initial.actions.map((action) => action.type)).toEqual(['reset', 'upsert']);
    expect(getUpsert(initial.actions, 'initial-1')?.plainText).toBe('Initial message');

    const replay = parseLiteChatPayload({
      continuationContents: {
        liveChatContinuation: {
          actions: [{
            replayChatItemAction: {
              videoOffsetTimeMsec: '5000',
              actions: [
                {
                  replaceChatItemAction: {
                    targetItemId: 'old-1',
                    replacementItem: textItem('new-1', 'Replacement')
                  }
                },
                { markChatItemAsDeletedAction: { targetItemId: 'deleted-1' } },
                { removeChatItemAction: { targetItemId: 'removed-1' } },
                { markChatItemsByAuthorAsDeletedAction: { externalChannelId: 'UC-deleted' } }
              ]
            }
          }]
        }
      }
    });

    expect(replay.actions).toEqual([
      { id: 'old-1', replayOffsetMs: 5000, type: 'remove' },
      {
        record: expect.objectContaining({ id: 'new-1', plainText: 'Replacement' }),
        replayOffsetMs: 5000,
        type: 'upsert'
      },
      { id: 'deleted-1', replayOffsetMs: 5000, type: 'remove' },
      { id: 'removed-1', replayOffsetMs: 5000, type: 'remove' },
      { channelId: 'UC-deleted', replayOffsetMs: 5000, type: 'remove-author' }
    ]);

    const refresh = parseLiteChatPayload({
      continuationContents: {
        liveChatContinuation: {
          clientMessages: [],
          actions: [addItem('liveChatTextMessageRenderer', {
            id: 'refresh-1',
            authorName: { simpleText: '@Example' },
            message: { simpleText: 'Refreshed chat' }
          })]
        }
      }
    });
    expect(refresh.actions.map((action) => action.type)).toEqual(['reset', 'upsert']);
  });

  it('skips unknown or malformed feed rows, ignores auxiliary actions, and rejects unsafe URLs', () => {
    const result = parseLiteChatPayload({
      actions: [
        {
          addChatItemAction: {
            item: { liveChatBrandNewRenderer: { id: 'unknown-1', text: 'private' } }
          }
        },
        {
          addLiveChatTickerItemAction: {
            item: { liveChatUnknownTickerRenderer: { id: 'ticker-1' } }
          }
        },
        {
          addChatItemAction: {
            item: { liveChatViewerEngagementMessageRenderer: { id: 'engagement-1' } }
          }
        },
        {
          addChatItemAction: {
            item: { liveChatModeChangeMessageRenderer: { id: 'mode-change-1' } }
          }
        },
        {
          mysteryAction: {
            item: { liveChatMysteryRenderer: { id: 'mystery-1', secret: 'private' } }
          }
        },
        {
          appendChatItemAction: {
            item: { liveChatTextMessageRenderer: { id: 'future-action', secret: 'private' } }
          }
        },
        { replayChatItemAction: {} },
        { addChatItemAction: { item: { metadata: { id: 'missing-renderer' } } } },
        { addChatItemAction: {} },
        { replaceChatItemAction: { replacementItem: textItem('replacement', 'Replacement') } },
        { removeChatItemAction: {} },
        { markChatItemsByAuthorAsDeletedAction: {} },
        {
          addChatItemAction: {
            item: { futureMessageViewModel: { id: 'future-1', secret: 'private' } }
          }
        },
        addItem('liveChatTextMessageRenderer', {
          id: 'safe-1',
          authorName: { simpleText: '@Safe' },
          message: {
            runs: [{
              text: 'unsafe link',
              navigationEndpoint: { urlEndpoint: { url: 'javascript:alert(1)' } }
            }]
          }
        })
      ]
    });

    expect(result.compatibilityWarnings).toEqual([
      'feed:liveChatBrandNewRenderer',
      'feed-action:appendChatItemAction',
      'replayChatItemAction:invalid',
      'feed:missing-renderer',
      'feed:invalid-item',
      'replaceChatItemAction:missing-target',
      'removeChatItemAction:missing-target',
      'markChatItemsByAuthorAsDeletedAction:missing-author',
      'feed:futureMessageViewModel'
    ]);
    expect(result.fatalErrors).toEqual([]);
    expect(result.unreadableFeed).toBe(true);
    expect(getUpsert(result.actions, 'safe-1')?.runs).toEqual([
      { text: 'unsafe link', type: 'text' }
    ]);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('javascript:');
  });

  it('does not mark malformed deletion metadata as an unreadable message feed', () => {
    const result = parseLiteChatPayload({
      actions: [
        { removeChatItemAction: {} },
        { markChatItemsByAuthorAsDeletedAction: {} }
      ]
    });

    expect(result.actions).toEqual([]);
    expect(result.compatibilityWarnings).toEqual([
      'removeChatItemAction:missing-target',
      'markChatItemsByAuthorAsDeletedAction:missing-author'
    ]);
    expect(result.fatalErrors).toEqual([]);
    expect(result.unreadableFeed).toBe(false);
  });

  it('treats malformed action entries as unreadable but non-fatal feed data', () => {
    const result = parseLiteChatPayload({ actions: [null, {}] });

    expect(result.actions).toEqual([]);
    expect(result.compatibilityWarnings).toEqual(['feed-action:invalid']);
    expect(result.fatalErrors).toEqual([]);
    expect(result.unreadableFeed).toBe(true);
  });

  it('accepts complete official action arrays and ignores unrelated nested actions', () => {
    const result = parseLiteChatPayload({
      actions: Array.from({ length: 550 }, (_, index) => (
        addItem('liveChatTextMessageRenderer', {
          id: `message-${index}`,
          authorName: { simpleText: '@Example' },
          message: { simpleText: `Message ${index}` }
        })
      )),
      unrelated: {
        actions: [{
          surprisingAction: {
            item: { unrelatedUiRenderer: { secret: true } }
          }
        }]
      }
    });

    expect(result.actions).toHaveLength(550);
    expect(result.fatalErrors).toEqual([]);
  });

  it('reserves room for reset while keeping the latest bounded initial backlog', () => {
    const result = parseLiteChatPayload({
      contents: {
        liveChatRenderer: {
          contents: {
            liveChatItemListRenderer: {
              contents: Array.from({ length: 500 }, (_value, index) => (
                textItem(`initial-${index}`, `Initial ${index}`)
              ))
            }
          }
        }
      }
    }, { initial: true });

    expect(result.actions).toHaveLength(500);
    expect(result.actions[0]).toEqual({ type: 'reset' });
    expect(getUpsert(result.actions, 'initial-0')).toBeUndefined();
    expect(getUpsert(result.actions, 'initial-499')?.plainText).toBe('Initial 499');
    expect(result.fatalErrors).toEqual([]);
  });
});

function addItem(rendererKey: string, renderer: Record<string, unknown>) {
  return {
    addChatItemAction: {
      item: { [rendererKey]: renderer }
    }
  };
}

function textItem(id: string, text: string) {
  return {
    liveChatTextMessageRenderer: {
      id,
      authorName: { simpleText: '@Example' },
      message: { simpleText: text }
    }
  };
}

function getUpsert(actions: ReturnType<typeof parseLiteChatPayload>['actions'], id: string) {
  const action = actions.find((candidate) => candidate.type === 'upsert' && candidate.record.id === id);
  return action?.type === 'upsert' ? action.record : undefined;
}
