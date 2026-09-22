import type { Page } from '@playwright/test';
import { fixtureLoggedInLiveChatUrl } from './live-chat-fixture';
import type { ChatSurface } from './chat-surface';

/** Native nested input and Participants paint rules observed in Firefox, September 2026.
 * The general mock's single contenteditable cannot expose these inheritance/layout bugs. */
export async function installNativeThemeSurfaces(chat: ChatSurface): Promise<void> {
  await chat.locator('yt-live-chat-message-input-renderer').evaluate(composer => {
    const input = composer.querySelector<HTMLElement>('#input[contenteditable]')!;
    const emoji = composer.querySelector('#emoji-picker-button')!;
    const field = document.createElement('yt-live-chat-text-input-field-renderer');
    field.id = 'input';
    field.setAttribute('is-chat-message-input', '');
    const label = document.createElement('label');
    label.id = 'label';
    label.textContent = 'Chat…';
    const container = document.createElement('div');
    container.id = 'input-container';
    field.append(label, input);
    container.append(field, emoji);
    composer.insertBefore(container, composer.querySelector('#send-button'));
    input.addEventListener('input', () => {
      field.toggleAttribute('input-expanded', !!input.textContent);
      label.hidden = !!input.textContent;
    });
    const participants = document.createElement('yt-live-chat-participant-list-renderer');
    participants.innerHTML = '<div id="header"><div id="back-button"><button aria-label="Back">←</button></div><span>Participants</span></div>';
    composer.parentElement!.append(participants);
    const styles = document.createElement('style');
    styles.textContent = `
      yt-live-chat-message-input-renderer { --yt-live-chat-text-input-field-placeholder-color: var(--yt-live-chat-secondary-text-color); }
      yt-live-chat-message-input-renderer #input-container { display:flex; align-items:center; min-height:36px; flex:1; padding-left:12px; background:#272727; }
      yt-live-chat-message-input-renderer #input-container:has([input-expanded]) { min-height:40px; }
      yt-live-chat-message-input-renderer yt-live-chat-text-input-field-renderer#input { display:flex; flex:1; position:relative; min-width:0; min-height:0; padding:0; background:transparent; }
      yt-live-chat-text-input-field-renderer #input[contenteditable] { box-sizing:content-box; min-width:0; min-height:18px; max-height:36px; flex:1; padding:2px 0; background:transparent; border:0; border-radius:0; font:14px/18px Roboto, Arial, sans-serif; }
      yt-live-chat-text-input-field-renderer[input-expanded] #input[contenteditable] { padding:8px 0; }
      yt-live-chat-text-input-field-renderer #label { position:absolute; top:0; padding:2px 0; font:14px/18px Roboto, Arial, sans-serif; color:var(--yt-live-chat-text-input-field-placeholder-color); }
      #emoji-picker-button { margin:auto 0 0 6px; min-height:0; }
      #emoji { display:block; width:36px; height:36px; }
      #emoji button { width:36px; height:36px; border:0; padding:6px; }
      yt-live-chat-participant-list-renderer { display:block; }
      yt-live-chat-participant-list-renderer #header { display:flex; align-items:center; height:48px; background:#0f0f0f; }
      yt-live-chat-participant-list-renderer button { color:#f1f1f1; }
    `;
    document.head.append(styles);
  });
}

/** Embed the native mock chat with YouTube's outer border and narrow frame. */
export async function installThemeWatchFixture(page: Page): Promise<string> {
  const watchUrl = 'https://www.youtube.com/watch?v=ytcq-themes';
  await page.route(watchUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<html><head><style>ytd-live-chat-frame { display:block; width:380px; border:1px solid #b0b0b0; border-radius:12px; overflow:hidden; } iframe#chatframe { border-radius:12px 12px 0 0; }</style></head><body style="margin:0"><ytd-live-chat-frame><iframe id="chatframe" src="${fixtureLoggedInLiveChatUrl}" style="display:block;width:100%;height:700px;border:0"></iframe></ytd-live-chat-frame></body></html>`
  }));
  return watchUrl;
}
