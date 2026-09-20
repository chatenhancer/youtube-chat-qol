import type { Page } from '@playwright/test';
import { fixtureLoggedInLiveChatUrl } from './live-chat-fixture';

/** Embed the native mock chat with YouTube's outer border and narrow frame. */
export async function installThemeWatchFixture(page: Page): Promise<string> {
  const watchUrl = 'https://www.youtube.com/watch?v=ytcq-themes';
  await page.route(watchUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<html><head><style>ytd-live-chat-frame { display:block; width:380px; border:1px solid #b0b0b0; border-radius:12px; overflow:hidden; } iframe#chatframe { border-radius:12px 12px 0 0; }</style></head><body style="margin:0"><ytd-live-chat-frame><iframe id="chatframe" src="${fixtureLoggedInLiveChatUrl}" style="display:block;width:100%;height:700px;border:0"></iframe></ytd-live-chat-frame></body></html>`
  }));
  return watchUrl;
}
