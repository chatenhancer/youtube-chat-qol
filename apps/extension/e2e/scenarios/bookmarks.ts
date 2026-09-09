/**
 * Browser scenario for saving chat message bookmarks.
 *
 * Covers Save beside YouTube's message menu, the rich message row in the popup,
 * and removing the bookmark again.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { AVATAR_RINGS_STORAGE_KEY } from '../../src/shared/avatar-rings';
import { BOOKMARKS_STORAGE_KEY } from '../../src/shared/bookmarks';
import { getExtensionId } from '../support/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { closeOpenMenus, openMessageMenu, type OpenedMessageMenu } from '../support/menu-openers';
import { isMockPageSurface } from '../support/mock-page';
import { getRichVisibleText } from '../support/text';
import { expectMessageMenuActionsInjected } from './menus';
import type { BrowserScenario } from './types';

interface StoredBookmarkRecord {
  authorName?: string;
  message?: {
    messageId?: string;
    text?: string;
    timestamp?: number;
    timestampText?: string;
  } | null;
  savedAt?: number;
  sourceTitle?: string;
  sourceUrl?: string;
}

const LONG_BOOKMARK_MESSAGE = [
  'This deliberately long saved message verifies that every line remains visible in the popup.',
  'It continues with enough text to wrap well beyond the previous three-line limit.',
  'The final portion must remain readable without clipping or truncation.'
].join(' ');

export const bookmarkMessageButtonScenario: BrowserScenario = async ({ chat, context, controlledChat }) => {
  await withExtensionStorageValues(
    context,
    'local',
    {
      [BOOKMARKS_STORAGE_KEY]: {}
    },
    async () => {
      await expectBookmarkCount(context, 0);
      await controlledChat?.injectMessage({
        author: '@BookmarkFixture',
        text: 'Save this longer chat message with enough text to wrap across several lines without covering the bookmark or menu icons.'.repeat(2)
      });

      const source = await saveBookmarkFromMessageButton(chat);
      await expectBookmarkStored(context, source.authorName);
      await expectBookmarkMenuClosed(source.menu);
      await expectBookmarkIconShowsAddedTime(chat, source);
      await expectBookmarkListedInPopupAndRemove(context, source.authorName);
      await expectBookmarkCount(context, 0);
    }
  );
};

export const bookmarkPopupRenderingScenario: BrowserScenario = async ({ context }) => {
  await withExtensionStorageValues(
    context,
    'local',
    {
      [AVATAR_RINGS_STORAGE_KEY]: {
        'author:@archiveviewer': {
          addedAt: 1_700_000_002_000,
          authorName: '@ArchiveViewer',
          sourceTitle: 'Long message stream',
          sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
        }
      },
      [BOOKMARKS_STORAGE_KEY]: {
        'message:long-message-stream:long-message-1': {
          authorName: '@ArchiveViewer',
          message: {
            contentParts: [{ text: LONG_BOOKMARK_MESSAGE, type: 'text' }],
            messageId: 'long-message-1',
            text: LONG_BOOKMARK_MESSAGE,
            timestamp: 1_700_000_000_000,
            timestampText: '10:13 PM'
          },
          savedAt: 1_700_000_001_000,
          sourceKey: 'long-message-stream',
          sourceTitle: 'Long message stream',
          sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
        }
      }
    },
    async () => {
      const popup = await openExtensionPopup(context);

      try {
        await test.step('Place the initial tab highlight without animating', async () => {
          const tabList = popup.locator('.popup-tabs');
          await expect(tabList).not.toHaveClass(/popup-tab-highlight-animated/);
          await expect
            .poll(() =>
              tabList.evaluate(
                (element) => getComputedStyle(element, '::before').transitionDuration
              )
            )
            .toBe('0s');

          await popup.locator('#bookmarksTab').hover();
          await expect(tabList).toHaveClass(/popup-tab-highlight-animated/);
          await expect
            .poll(() =>
              tabList.evaluate(
                (element) => getComputedStyle(element, '::before').transitionDuration
              )
            )
            .not.toBe('0s');
        });
        await popup.locator('#bookmarksTab').click();
        const message = popup.locator('.bookmark-message');
        await expect(message).toHaveText(LONG_BOOKMARK_MESSAGE);
        await expect(popup.locator('#bookmarksTab #bookmarksCount')).toHaveText('2');
        await test.step('Fit localized tab labels on one line without clipping', async () => {
          await popup.evaluate(() => {
            const settingsTab = document.querySelector('#settingsTab');
            const bookmarksLabel = document.querySelector('#bookmarksTab > span:first-child');
            const playgroundTab = document.querySelector('#playgroundTab');
            if (!settingsTab || !bookmarksLabel || !playgroundTab) {
              throw new Error('Expected every popup tab label');
            }
            settingsTab.textContent = 'Einstellungen';
            bookmarksLabel.textContent = 'Lesezeichen';
            playgroundTab.textContent = 'Playground';
            window.dispatchEvent(new Event('resize'));
          });
          const dimensions = await popup.locator('.popup-tabs').evaluate((element) => {
            const bookmarksLabel = element.querySelector<HTMLElement>(
              '#bookmarksTab > span:first-child'
            );
            if (!bookmarksLabel) throw new Error('Expected the Bookmarks tab label');
            const styles = getComputedStyle(bookmarksLabel);
            return {
              clientWidth: element.clientWidth,
              labelClientWidth: bookmarksLabel.clientWidth,
              labelHeight: bookmarksLabel.getBoundingClientRect().height,
              labelScrollWidth: bookmarksLabel.scrollWidth,
              lineHeight: Number.parseFloat(styles.lineHeight),
              scrollWidth: element.scrollWidth,
              tabHeight: element.querySelector('#settingsTab')?.getBoundingClientRect().height,
              tabListHeight: element.getBoundingClientRect().height
            };
          });
          expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
          expect(dimensions.labelScrollWidth).toBe(dimensions.labelClientWidth);
          expect(dimensions.labelHeight).toBeLessThanOrEqual(dimensions.lineHeight);
          expect(dimensions.tabHeight).toBe(24);
          expect(dimensions.tabListHeight).toBe(30);
        });
        await test.step('Render bookmark scroll fades above the list content', async () => {
          const shell = popup.locator('.bookmarks-list-shell');
          const list = popup.locator('#bookmarksList');
          const scrollbar = popup.locator('.bookmarks-list-shell > .popup-scrollbar');
          const scrollbarThumb = scrollbar.locator('.popup-scrollbar-thumb');
          await list.evaluate((element) => {
            element.style.maxHeight = '60px';
            element.dispatchEvent(new Event('scroll'));
          });
          await expect(shell).toHaveClass(/popup-scroll-fade-bottom/);
          await expect(scrollbar).toBeVisible();
          await expect(list).toHaveCSS('scrollbar-width', 'none');
          const scrollMetrics = await list.evaluate((element) => {
            const listElement = element as HTMLElement;
            const listBounds = listElement.getBoundingClientRect();
            const scrollbar = listElement.parentElement?.querySelector<HTMLElement>(
              '.popup-scrollbar'
            );
            const scrollbarBounds = scrollbar?.getBoundingClientRect();
            const thumb = listElement.parentElement?.querySelector<HTMLElement>(
              '.popup-scrollbar-thumb'
            );
            return {
              listRight: listBounds.right,
              popupRight: document.body.getBoundingClientRect().right,
              scrollbarLeft: scrollbarBounds?.left || 0,
              scrollbarRight: scrollbarBounds?.right || 0,
              thumbHeight: thumb?.getBoundingClientRect().height || 0,
              thumbWidth: thumb?.getBoundingClientRect().width || 0,
              nativeScrollbarWidth: listElement.offsetWidth - listElement.clientWidth
            };
          });
          expect(scrollMetrics.scrollbarLeft).toBeGreaterThanOrEqual(scrollMetrics.listRight);
          expect(scrollMetrics.scrollbarRight).toBeLessThanOrEqual(scrollMetrics.popupRight);
          expect(scrollMetrics.thumbHeight).toBeGreaterThan(0);
          expect(scrollMetrics.thumbWidth).toBe(5);
          expect(scrollMetrics.nativeScrollbarWidth).toBe(0);
          await expect
            .poll(() => shell.evaluate((element) => getComputedStyle(element, '::after').opacity))
            .toBe('1');
          const thumbBox = await scrollbarThumb.boundingBox();
          if (!thumbBox) throw new Error('Expected the popup scrollbar thumb');
          await popup.mouse.move(20, 20);
          await expect
            .poll(() => scrollbar.evaluate((element) => getComputedStyle(element).opacity))
            .toBe('0');
          await popup.mouse.move(
            thumbBox.x + thumbBox.width / 2,
            thumbBox.y + thumbBox.height / 2
          );
          await expect
            .poll(() => scrollbar.evaluate((element) => getComputedStyle(element).opacity))
            .toBe('1');
          await popup.mouse.down();
          await popup.mouse.move(
            thumbBox.x + thumbBox.width / 2,
            thumbBox.y + thumbBox.height / 2 + 16
          );
          await popup.mouse.up();
          await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
          await popup.mouse.move(20, 20);
          await list.evaluate((element) => {
            element.scrollTop = 0;
            element.style.removeProperty('max-height');
            element.dispatchEvent(new Event('scroll'));
          });
        });
        await test.step('Filter bookmark rows live without covering visible results', async () => {
          const filter = popup.locator('#bookmarksFilter');
          const bookmarkRow = popup.locator('.bookmark-row:not(.avatar-ring-row)');
          const rememberedUserRow = popup.locator('.avatar-ring-row');
          const noMatches = popup.locator('.bookmarks-filter-empty');
          const filteredCount = popup.locator('#bookmarksCount');

          await filter.fill('DELIBERATELY LONG SAVED MESSAGE');
          await expect(bookmarkRow).toBeVisible();
          await expect(rememberedUserRow).toBeHidden();
          await expect(noMatches).toBeHidden();
          await expect(filteredCount).toHaveText('1');
          const highlights = bookmarkRow.locator('.bookmark-search-highlight');
          await expect(highlights).toHaveText(['deliberately long saved message']);
          await expect(highlights.first()).toHaveCSS(
            'background-color',
            'rgba(255, 183, 77, 0.24)'
          );

          await filter.fill('DELIBERATELY  LONG SAVED MESSAGE');
          await expect(bookmarkRow).toBeHidden();
          await expect(rememberedUserRow).toBeHidden();
          await expect(noMatches).toBeVisible();
          await expect(filteredCount).toHaveText('0');
          await expect(popup.locator('.bookmark-search-highlight')).toHaveCount(0);

          await filter.fill('archiveviewer deliberately');
          await expect(bookmarkRow).toBeHidden();
          await expect(rememberedUserRow).toBeHidden();
          await expect(noMatches).toBeVisible();
          await expect(filteredCount).toHaveText('0');
          await expect(popup.locator('.bookmark-search-highlight')).toHaveCount(0);

          await filter.clear();
          await expect(bookmarkRow).toBeVisible();
          await expect(rememberedUserRow).toBeVisible();
          await expect(noMatches).toBeHidden();
          await expect(filteredCount).toHaveText('2');
          await expect(popup.locator('.bookmark-search-highlight')).toHaveCount(0);
        });
        await test.step('Color remembered authors and animate their rings on and off', async () => {
          await expect(
            popup.locator('.bookmark-row:not(.avatar-ring-row) .bookmark-name')
          ).toHaveClass(/bookmark-name-remembered/);
          await expect(
            popup.locator('.avatar-ring-row:not(.avatar-ring-row-removed) .bookmark-name')
          ).toHaveClass(/bookmark-name-remembered/);
          const rememberedLabelColor = await popup
            .locator('.avatar-ring-row:not(.avatar-ring-row-removed) .avatar-ring-label')
            .evaluate((element) => getComputedStyle(element).color);
          await expect(
            popup.locator('.bookmark-row:not(.avatar-ring-row) .bookmark-name')
          ).toHaveCSS('color', rememberedLabelColor);
          await expect(
            popup.locator('.avatar-ring-row:not(.avatar-ring-row-removed) .bookmark-name')
          ).toHaveCSS('color', rememberedLabelColor);
          const avatar = popup.locator(
            '.bookmark-row:not(.avatar-ring-row) .avatar-ring-avatar'
          );
          await expect(avatar).toHaveCSS('animation-name', 'ytcq-popup-avatar-ring-in');
          await expect(avatar).toHaveCSS('animation-duration', '0.16s');

          await popup.addStyleTag({
            content: '.avatar-ring-avatar-out { animation-play-state: paused !important; }'
          });
          await popup
            .locator('.avatar-ring-row:not(.avatar-ring-row-removed) .avatar-ring-action-button')
            .click();
          const departingRememberedUserAvatar = popup.locator(
            '.avatar-ring-row-removed .avatar-ring-avatar-out'
          );
          await expect(departingRememberedUserAvatar).toHaveCSS(
            'animation-name',
            'ytcq-popup-avatar-ring-out'
          );
          await expect(departingRememberedUserAvatar).toHaveCSS(
            'animation-duration',
            '0.16s'
          );
          const departingAvatar = popup.locator(
            '.bookmark-row:not(.avatar-ring-row) .avatar-ring-avatar-out'
          );
          await expect(departingAvatar).toHaveCSS(
            'animation-name',
            'ytcq-popup-avatar-ring-out'
          );
          await expect(departingAvatar).toHaveCSS('animation-duration', '0.16s');
          await expect(
            popup.locator('.bookmark-row:not(.avatar-ring-row) .bookmark-name')
          ).not.toHaveClass(/bookmark-name-remembered/);
          await expect(
            popup.locator('.avatar-ring-row-removed .bookmark-name')
          ).not.toHaveClass(/bookmark-name-remembered/);
          const bookmarksList = popup.locator('#bookmarksList');
          await bookmarksList.evaluate((list) => {
            const captureArrivalAnimation = (event: Event): void => {
              const animationEvent = event as AnimationEvent;
              if (animationEvent.animationName !== 'ytcq-popup-bookmark-row-added') return;
              list.dataset.savedItemArrivalAnimation = animationEvent.animationName;
              list.dataset.savedItemArrivalAnimationDuration = getComputedStyle(
                event.target as Element
              ).animationDuration;
              list.removeEventListener('animationstart', captureArrivalAnimation);
            };
            list.addEventListener('animationstart', captureArrivalAnimation);
          });
          await popup.locator('.avatar-ring-row-removed .avatar-ring-action-button').click();
          const restoredRow = popup.locator(
            '.avatar-ring-row:not(.avatar-ring-row-removed)'
          );
          await expect(restoredRow).toBeVisible();
          await expect(bookmarksList).toHaveAttribute(
            'data-saved-item-arrival-animation',
            'ytcq-popup-bookmark-row-added'
          );
          await expect(bookmarksList).toHaveAttribute(
            'data-saved-item-arrival-animation-duration',
            '0.72s'
          );
        });
        await test.step('Select, remove, and restore mixed saved items as one batch', async () => {
          const browseControls = popup.locator('#bookmarksBrowseControls');
          const selectionControls = popup.locator('#bookmarksSelectionControls');
          const selectionCount = popup.locator('#bookmarksSelectionCount');
          const checkboxes = popup.locator('.bookmark-selection-checkbox');
          const selectableRows = popup.locator(
            '.bookmark-row[data-saved-item-active="true"]'
          );

          await expect(popup.locator('#bookmarksSelect .bookmarks-button-icon')).toBeVisible();
          await popup.locator('#bookmarksSelect').click();
          await expect(browseControls).toBeHidden();
          await expect(selectionControls).toBeVisible();
          await expect(popup.locator('#bookmarksSelectAll .bookmarks-button-icon')).toBeVisible();
          await expect(
            popup.locator('#bookmarksRemoveSelected .bookmarks-button-icon')
          ).toBeVisible();
          await expect(popup.locator('#bookmarksSelectAll')).toHaveText('Select all');
          await expect(checkboxes).toHaveCount(2);
          await expect
            .poll(() =>
              checkboxes.first().evaluate((checkbox) => {
                const style = getComputedStyle(checkbox);
                return {
                  borderWidth: style.borderWidth,
                  hasFill: style.backgroundColor !== 'rgba(0, 0, 0, 0)',
                  hasSoftRing: style.boxShadow !== 'none'
                };
              })
            )
            .toEqual({ borderWidth: '0px', hasFill: false, hasSoftRing: true });
          await selectableRows.first().locator('.bookmark-copy').click();
          await expect(selectableRows.first()).toHaveClass(/bookmark-row-selected/);
          await expect
            .poll(() =>
              selectableRows.first().evaluate((row) => getComputedStyle(row).boxShadow)
            )
            .toBe('none');
          await selectableRows.last().locator('.bookmark-copy').click();
          await expect
            .poll(() =>
              checkboxes.evaluateAll((elements) =>
                elements.every((element) => (element as HTMLInputElement).checked)
              )
            )
            .toBe(true);
          await expect(selectionCount).toHaveText('2 selected');
          await expect(popup.locator('#bookmarksSelectAll')).toBeDisabled();
          await expect
            .poll(() =>
              popup.locator('#bookmarksRemoveSelected').evaluate((button) => {
                const modalButton = document.createElement('button');
                modalButton.className = 'popup-reset-dialog-button';
                document.body.append(modalButton);
                const buttonStyle = getComputedStyle(button);
                const modalButtonStyle = getComputedStyle(modalButton);
                const result = {
                  cornerShapeMatches:
                    buttonStyle.getPropertyValue('corner-shape') ===
                    modalButtonStyle.getPropertyValue('corner-shape'),
                  radiusMatches: buttonStyle.borderRadius === modalButtonStyle.borderRadius
                };
                modalButton.remove();
                return result;
              })
            )
            .toEqual({ cornerShapeMatches: true, radiusMatches: true });
          await expect
            .poll(() =>
              popup.locator('#bookmarksRemoveSelected').evaluate((button) => {
                const probe = document.createElement('span');
                probe.style.background = 'var(--ytcq-popup-logo-red)';
                document.body.append(probe);
                const destructiveRed = getComputedStyle(probe).backgroundColor;
                probe.remove();
                return getComputedStyle(button).backgroundColor === destructiveRed;
              })
            )
            .toBe(true);

          const listShell = popup.locator('.bookmarks-list-shell');
          const listShellBoundsBeforeUndo = await listShell.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              height: Math.round(bounds.height),
              top: Math.round(bounds.top)
            };
          });

          await popup.locator('#bookmarksRemoveSelected').click();
          await expect
            .poll(async () => {
              const values = await getExtensionStorageValues(context, 'local', [
                AVATAR_RINGS_STORAGE_KEY,
                BOOKMARKS_STORAGE_KEY
              ]);
              return [
                Object.keys(values[AVATAR_RINGS_STORAGE_KEY] || {}).length,
                Object.keys(values[BOOKMARKS_STORAGE_KEY] || {}).length
              ];
            })
            .toEqual([0, 0]);
          await expect(popup.locator('#bookmarksCount')).toHaveText('0');
          await expect(popup.locator('.bookmark-row')).toHaveCount(0);
          await expect(popup.locator('#bookmarksUndo')).toBeVisible();
          await expect(popup.locator('#bookmarksUndoCount')).toHaveText('2 removed');
          await expect(popup.locator('#bookmarksUndoButton svg')).toBeVisible();
          await expect
            .poll(() =>
              listShell.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return {
                  height: Math.round(bounds.height),
                  top: Math.round(bounds.top)
                };
              })
            )
            .toEqual(listShellBoundsBeforeUndo);
          await expect
            .poll(() =>
              popup.locator('#bookmarksUndo').evaluate((undo) => {
                const shell = undo.parentElement;
                const header = shell?.previousElementSibling;
                const list = shell?.querySelector('#bookmarksList');
                const undoStyle = getComputedStyle(undo);
                const headerStyle = header ? getComputedStyle(header) : null;
                const listStyle = list ? getComputedStyle(list) : null;
                const undoBounds = undo.getBoundingClientRect();
                const shellBounds = shell?.getBoundingClientRect();
                const isRtl = getComputedStyle(undo).direction === 'rtl';
                return {
                  bottomInset: shellBounds
                    ? Math.round(shellBounds.bottom - undoBounds.bottom)
                    : null,
                  cornerShapeMatches:
                    undoStyle.getPropertyValue('corner-shape') ===
                    headerStyle?.getPropertyValue('corner-shape'),
                  hasElevation: undoStyle.boxShadow !== 'none',
                  inlineInset: shellBounds
                    ? Math.round(
                        isRtl
                          ? shellBounds.right - undoBounds.right
                          : undoBounds.left - shellBounds.left
                      )
                    : null,
                  isInsideListShell: shell?.classList.contains('bookmarks-list-shell') === true,
                  isOverlay: undoStyle.position === 'absolute',
                  listBottomPadding: listStyle?.paddingBottom,
                  radiusMatches: undoStyle.borderRadius === headerStyle?.borderRadius
                };
              })
            )
            .toEqual({
              bottomInset: 8,
              cornerShapeMatches: true,
              hasElevation: true,
              inlineInset: 8,
              isInsideListShell: true,
              isOverlay: true,
              listBottomPadding: '46px',
              radiusMatches: true
            });

          await popup.locator('#bookmarksUndoButton').click();
          await expect
            .poll(async () => {
              const values = await getExtensionStorageValues(context, 'local', [
                AVATAR_RINGS_STORAGE_KEY,
                BOOKMARKS_STORAGE_KEY
              ]);
              return [
                Object.keys(values[AVATAR_RINGS_STORAGE_KEY] || {}).length,
                Object.keys(values[BOOKMARKS_STORAGE_KEY] || {}).length
              ];
            })
            .toEqual([1, 1]);
          await expect(popup.locator('.bookmark-row-removed')).toHaveCount(0);
          await expect(popup.locator('#bookmarksUndo')).toBeHidden();
          await expect
            .poll(() =>
              popup
                .locator('#bookmarksList')
                .evaluate((list) => getComputedStyle(list).paddingBottom)
            )
            .toBe('0px');
          await expect(popup.locator('#bookmarksCount')).toHaveText('2');
        });

        const dimensions = await message.evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight
        }));
        expect(dimensions.clientHeight).toBeGreaterThan(48);
        expect(dimensions.scrollHeight).toBe(dimensions.clientHeight);
      } finally {
        await popup.close().catch(() => undefined);
      }
    }
  );
};

async function expectBookmarkIconShowsAddedTime(
  chat: Parameters<BrowserScenario>[0]['chat'],
  source: OpenedMessageMenu
): Promise<void> {
  if (!isMockPageSurface(chat)) return;

  await test.step('Show when the bookmark was added on its saved row icon', async () => {
    await source.message.locator('#author-photo').first().click();
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard).toBeVisible();

    const bookmarkAction = profileCard
      .locator('.ytcq-profile-card-message-origin .ytcq-bookmark-toggle')
      .first();
    await expect(bookmarkAction).toHaveAttribute('aria-pressed', 'true');
    await expect(bookmarkAction).toHaveAttribute(
      'title',
      /Remove bookmark\nAdded .+/
    );

    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
}

async function saveBookmarkFromMessageButton(
  chat: Parameters<BrowserScenario>[0]['chat']
): Promise<OpenedMessageMenu> {
  const source = await openMessageMenu(chat);
  await expectMessageMenuActionsInjected(source.menu);
  await closeOpenMenus(chat);

  await test.step('Save directly beside the dots with the keyboard', async () => {
    const saveAction = source.message.locator('#menu > .ytcq-chat-bookmark-toggle');
    await source.message.hover();
    await expect(saveAction).toBeVisible();
    await expect(saveAction).toHaveAttribute('aria-label', 'Bookmark');
    await expectFeedBookmarkLayout(source.message);
    await saveAction.press('Enter');
    await expect(saveAction).toHaveAttribute('aria-pressed', 'true');
    await expectBookmarkToastAtBottom(chat);
    await expect(source.message).toHaveClass(/ytcq-bookmark-saved/);
    await expect
      .poll(() => source.message.evaluate((row) => getComputedStyle(row, '::after').opacity))
      .not.toBe('0');
    expect(
      await source.message.evaluate((row) => getComputedStyle(row, '::after').pointerEvents)
    ).toBe('none');
    await expect(source.message).not.toHaveClass(/ytcq-bookmark-saved/);
  });

  return source;
}

export async function expectBookmarkToastAtBottom(
  chat: Parameters<BrowserScenario>[0]['chat']
): Promise<void> {
  const toast = chat.locator('.ytcq-toast');
  await expect(toast).toHaveText('Saved to Bookmarks');
  expect(await toast.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2) < 1 &&
      Math.abs(window.innerHeight - bounds.bottom - 48) < 1;
  })).toBe(true);
}

export async function expectFeedBookmarkLayout(message: Locator): Promise<void> {
  await expect.poll(() => message.evaluate((row) => {
    const save = row.querySelector('.ytcq-chat-bookmark-toggle');
    const dots = row.querySelector('#menu button:not(.ytcq-bookmark-toggle)');
    const content = row.querySelector('#content');
    if (!save || !dots || !content) return false;
    const saveBounds = save.getBoundingClientRect();
    const dotsBounds = dots.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(content);
    return saveBounds.width > 0 &&
      saveBounds.right <= dotsBounds.left + 1 &&
      Array.from(text.getClientRects()).every((rect) => rect.right <= saveBounds.left - 2);
  }), { message: 'Message text must wrap before the Save and menu buttons.' }).toBe(true);
}

async function expectBookmarkMenuClosed(menu: Locator): Promise<void> {
  await test.step('Verify saving does not open the message context menu', async () => {
    await expect(menu).toBeHidden({ timeout: 5_000 });
  });
}

async function expectBookmarkStored(context: BrowserContext, authorName: string): Promise<void> {
  await test.step('Verify the message bookmark is saved with its author and stream', async () => {
    await expect
      .poll(
        async () => {
          const records = await getStoredBookmarks(context);
          return records.some((record) => {
            return (
              record.authorName === authorName &&
              Boolean(record.message?.messageId && record.message.text) &&
              Number.isFinite(record.message?.timestamp) &&
              Boolean(record.message?.timestampText) &&
              Number.isFinite(record.savedAt) &&
              Boolean(record.sourceTitle || record.sourceUrl)
            );
          });
        },
        {
          message:
            'Bookmark should include the message, author, posted time, save time, and stream context.',
          timeout: 10_000
        }
      )
      .toBe(true);
  });
}

async function expectBookmarkCount(context: BrowserContext, count: number): Promise<void> {
  await test.step(`Verify bookmark storage contains ${count} record${count === 1 ? '' : 's'}`, async () => {
    await expect
      .poll(async () => (await getStoredBookmarks(context)).length, {
        timeout: 10_000
      })
      .toBe(count);
  });
}

async function expectBookmarkListedInPopupAndRemove(
  context: BrowserContext,
  authorName: string
): Promise<void> {
  await test.step('Open popup Bookmarks and remove the saved message', async () => {
    const initialPopup = await openExtensionPopup(context);
    await initialPopup.locator('#bookmarksTab').click();
    await expect(initialPopup.locator('#bookmarksTab')).toHaveAttribute('aria-selected', 'true');
    await initialPopup.close();

    const popup = await openExtensionPopup(context);

    try {
      await expect(popup.locator('#bookmarksTab')).toHaveAttribute('aria-selected', 'true');
      const row = popup.locator('.bookmark-row').filter({ hasText: authorName }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect.poll(
        async () => getRichVisibleText(row.locator('.bookmark-message')),
        { timeout: 15_000 }
      ).not.toBe('');
      const postedTime = row.locator('.bookmark-message-header .bookmark-message-time');
      await expect(postedTime).toBeVisible();
      await expect(postedTime).not.toHaveText('');
      await expect(postedTime).toHaveAttribute('title', /Message posted .+/);
      await expect(row.locator('.bookmark-metadata .bookmark-source')).not.toHaveText('');

      const action = row.locator('.bookmark-action-button').first();
      await expect(action).toHaveAttribute('aria-label', 'Remove bookmark');
      await action.click();
      await expect(row).toHaveClass(/bookmark-row-removed/);
      await expect(action).toHaveAttribute('aria-label', 'Restore bookmark');
    } finally {
      await popup.close().catch(() => undefined);
    }
  });
}

async function openExtensionPopup(context: BrowserContext): Promise<Page> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#bookmarksTab')).toBeVisible({ timeout: 10_000 });
  return popup;
}

async function getStoredBookmarks(context: BrowserContext): Promise<StoredBookmarkRecord[]> {
  const values = await getExtensionStorageValues(context, 'local', [BOOKMARKS_STORAGE_KEY]);
  const stored = values[BOOKMARKS_STORAGE_KEY];
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];

  return Object.values(stored).filter((record): record is StoredBookmarkRecord => {
    return Boolean(record && typeof record === 'object');
  });
}
