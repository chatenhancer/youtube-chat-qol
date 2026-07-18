#!/usr/bin/env node
/* global chrome, document, window, CSS, MouseEvent, MutationObserver, PointerEvent, Element, HTMLElement, HTMLCanvasElement, HTMLDivElement, HTMLIFrameElement, HTMLImageElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, Node, SVGElement, getComputedStyle */

import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const extensionDir = path.join(repoRoot, 'dist', 'extension-chrome');
const demoCursorDir = path.join(repoRoot, 'assets', 'demo', 'cursors');
const demoAudioDir = path.join(repoRoot, 'assets', 'demo', 'audio');
const logoPath = path.join(repoRoot, 'src', 'assets', 'icons', 'icon.svg');
const avatarLogoPath = path.join(repoRoot, 'src', 'assets', 'icons', 'icon-128.png');
const docsFontDir = path.join(repoRoot, 'docs', 'public', 'assets', 'fonts');
const interFontPath = path.join(docsFontDir, 'InterVariable.woff2');
const interDisplayBoldFontPath = path.join(docsFontDir, 'InterDisplay-Bold.woff2');
const interDisplayExtraBoldFontPath = path.join(docsFontDir, 'InterDisplay-ExtraBold.woff2');
const pointerCursorPath = path.join(demoCursorDir, 'pointer.svg');
const handCursorPath = path.join(demoCursorDir, 'hand.svg');
const clickSoundPath = path.join(demoAudioDir, 'click.mp3');
const demoResultsDir = path.join(repoRoot, 'test-results', 'demos');
const finalVideoDir = path.join(repoRoot, 'docs', 'public', 'videos');
const diagnosticDir = path.join(demoResultsDir, 'diagnostics');
const chromeProfilesDir = path.resolve(process.env.YTCQ_CHROME_WORKING_PROFILES || path.join(repoRoot, '.chrome-test-profiles'));
const sourceProfileDir = path.resolve(process.env.YTCQ_CHROME_PROFILE || path.join(chromeProfilesDir, 'pristine'));
const profileDir = path.join(chromeProfilesDir, 'youtube-walkthrough-demo');
const defaultLiveUrl = 'https://www.youtube.com/@LofiGirl/live';
const liveUrl = process.env.YTCQ_LIVE_DEMO_URL || defaultLiveUrl;
const sourceUrl = getCanonicalWatchUrl(liveUrl);
const previewMode = process.argv.includes('--preview') || process.env.YTCQ_DEMO_PREVIEW === '1';
const finalVideoBaseName = 'chat-enhancer-walkthrough';
const videoOutputDir = previewMode ? demoResultsDir : finalVideoDir;
const defaultOutputFileName = previewMode
  ? `${finalVideoBaseName}-preview.mp4`
  : `${finalVideoBaseName}.mp4`;
let outputPath = path.resolve(process.env.YTCQ_DEMO_OUTPUT || path.join(videoOutputDir, defaultOutputFileName));
const shouldHashFinalOutput = !previewMode && !process.env.YTCQ_DEMO_OUTPUT;
const headless = shouldRunHeadlessDemo();
const demoFps = readPositiveInteger(process.env.YTCQ_DEMO_FPS, getDefaultDemoFps());
const estimatedDemoSeconds = readPositiveNumber(process.env.YTCQ_DEMO_ESTIMATED_SECONDS, 200);
const estimatedDemoFrames = Math.max(demoFps, Math.round(estimatedDemoSeconds * demoFps));
const progressUpdateMs = readPositiveInteger(process.env.YTCQ_DEMO_PROGRESS_MS, process.stdout.isTTY ? 1_000 : 5_000);
const deviceScaleFactor = readPositiveNumber(process.env.YTCQ_DEMO_SCALE, getDefaultDemoScale());
const frameFormat = readEnum(process.env.YTCQ_DEMO_FRAME_FORMAT, ['png', 'jpeg'], 'png');
const frameQuality = readBoundedInteger(process.env.YTCQ_DEMO_FRAME_QUALITY, previewMode ? 92 : 96, 1, 100);
const shouldLogFrameSize = process.env.YTCQ_DEMO_LOG_FRAME_SIZE === '1';
const pipedVideoPath = path.join(demoResultsDir, `${finalVideoBaseName}-${process.pid}-silent.mp4`);
const viewport = { width: 1280, height: 720 };
const extensionPopupSize = { width: 350, height: 465 };
const cursorHotspot = { x: 16, y: 12 };
const defaultDemoCursorPosition = { x: 28, y: 36 };
let demoCursorPosition = { ...defaultDemoCursorPosition };
let demoDocsFontFaceCssPromise = null;
const normalChatMessageSelector = 'yt-live-chat-text-message-renderer';
const demoChatMessageSelector = `${normalChatMessageSelector}.ytcq-demo-message`;
const menuPopupSelector = 'ytd-menu-popup-renderer';
const quickEmojiPopoverSelector = '.ytcq-quick-emoji-popover:not(.ytcq-quick-emoji-popover-closing)';
const markedUsersStorageKey = 'ytcqMarkedUsers';
const emojiUsageStorageKey = 'ytcqEmojiUsage';
const playgroundDisplayNameStorageKey = 'ytcqPlaygroundDisplayName:v1';
const playgroundIdentityStorageKey = 'ytcqPlaygroundIdentity:v1';
const demoLuciaAvatarUrl = 'https://ytcq-demo.invalid/avatar/lucia-live.svg';
const activeChromeProfileFileNames = new Set([
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket'
]);
const runtimeChromeProfileFileNames = new Set([
  ...activeChromeProfileFileNames,
  '.ytcq-playwright-profile.lock',
  'DevToolsActivePort'
]);
const headlessUserAgent = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/148.0.0.0 Safari/537.36'
].join(' ');
const consentButtonNames = [
  /Reject all/i,
  /Rechazar todo/i,
  /Rejeitar tudo/i,
  /Tout refuser/i,
  /Alle ablehnen/i,
  /Rifiuta tutto/i,
  /Accept all/i,
  /Aceptar todo/i,
  /Aceitar tudo/i,
  /Tout accepter/i,
  /Alle akzeptieren/i,
  /Accetta tutto/i,
  /모두 거부/,
  /모두 수락/,
  /すべて拒否/,
  /すべて承諾/,
  /拒绝全部/,
  /全部接受/,
  /全部拒絕/,
  /رفض الكل/,
  /قبول الكل/
];
const demoInboxRecord = {
  id: 'demo-inbox-keyword',
  authorName: '@LuciaLive',
  avatarSrc: demoLuciaAvatarUrl,
  channelId: 'UCChatEnhancerDemo',
  contentParts: [
    {
      type: 'text',
      text: 'Please save this encore moment for later.'
    }
  ],
  matchedKeywords: ['encore'],
  mention: false,
  mentionHandles: [],
  messageId: '',
  read: false,
  sourceUrl,
  text: 'Please save this encore moment for later.',
  timestamp: Date.now() - 90_000,
  timestampText: '1:30'
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(extensionDir)) {
    throw new Error('Missing dist/extension-chrome. Run npm run build:chrome first.');
  }

  await mkdir(videoOutputDir, { recursive: true });
  await mkdir(demoResultsDir, { recursive: true });
  await mkdir(diagnosticDir, { recursive: true });
  await rm(pipedVideoPath, { force: true });

  let chromeInstance = null;
  let closed = false;
  let recorder = null;

  try {
    await prepareSignedInWorkingProfile();

    console.log(
      `[walkthrough] Mode: ${getDemoModeLabel()} | ` +
        `${demoFps}fps | ${getCaptureSizeLabel()} | scale ${deviceScaleFactor} | ` +
        `${getFrameCaptureLogLabel()} | ${getVideoEncodeLogLabel()} | output ${getOutputLogLabel()}`
    );
    console.log('[walkthrough] Frame sink: ffmpeg pipe; frames are not written as individual files.');

    chromeInstance = await launchNormalChromeDemoContext({
      initialUrl: liveUrl,
      userAgent: headless ? process.env.YTCQ_DEMO_USER_AGENT || headlessUserAgent : undefined
    });
    const { context } = chromeInstance;
    const page = context.pages()[0] || await context.newPage();
    await setDemoViewport(page, viewport);
    await installDemoAssetRoutes(context);
    console.log('[walkthrough] Opening live YouTube chat...');
    let chat = await withTimeout(openWatchPageChatFrame(page, liveUrl), 140_000, 'open live chat');
    const activeSourceUrl = await resolveWalkthroughSourceUrl(page);
    console.log(`[walkthrough] Seeding deterministic extension state for: ${activeSourceUrl}`);
    await withTimeout(
      seedWalkthroughExtensionState(context, activeSourceUrl),
      20_000,
      'seed walkthrough extension state'
    );
    chat = await withTimeout(
      openWatchPageChatFrame(page, activeSourceUrl),
      140_000,
      'reload seeded live chat'
    );
    console.log('[walkthrough] Installing branding, privacy mask, and presentation overlays...');
    await withTimeout(installWatchPageBranding(page), 20_000, 'install watch page branding');
    await withTimeout(installLiveChatMask(chat), 20_000, 'install privacy mask');
    await withTimeout(stabilizeDemoChatFeed(chat), 10_000, 'stabilize demo chat feed');
    await getFirstVisibleLocator(chat.locator(demoChatMessageSelector), 20_000);
    await chat.locator(`${demoChatMessageSelector}[data-ytcq-context-wired="true"]`).first().waitFor({ state: 'attached', timeout: 20_000 });
    await withTimeout(installDemoPresentationLayer(page), 10_000, 'install presentation layer');
    await withTimeout(installDemoCursor(page), 10_000, 'install demo cursor');
    recorder = await createFrameRecorder(page);
    console.log('[walkthrough] Recording real extension walkthrough...');
    await withTimeout(recordWalkthrough(page, chat, context, recorder), 1_200_000, 'record walkthrough');
    const captureStats = await recorder.close();
    const clickCues = recorder.clickCues;
    recorder = null;
    await withTimeout(page.close(), 20_000, 'close demo page');
    await chromeInstance.close();
    closed = true;
    const encodeStartedAt = Date.now();
    await withTimeout(encodeCapturedVideo(captureStats.frameCount, {
      clickCues,
      pipedVideoPath: captureStats.videoPath
    }), 180_000, 'encode walkthrough video');
    writeTimingSummary({
      captureStats,
      encodeMs: Date.now() - encodeStartedAt
    });
    if (shouldHashFinalOutput) {
      outputPath = await withTimeout(applyContentHashToFinalOutput(outputPath), 20_000, 'hash walkthrough video output');
    }
  } finally {
    if (recorder) await recorder.abort().catch(() => undefined);
    if (chromeInstance && !closed) await chromeInstance.close().catch(() => undefined);
    await rm(pipedVideoPath, { force: true }).catch(() => undefined);
  }

  console.log(`Saved walkthrough demo video: ${outputPath}`);
}

async function recordWalkthrough(page, chat, context, recorder) {
  recorder.setStage('Intro');
  await page.waitForTimeout(800);
  await setDemoCaption(
    page,
    'Chat Enhancer works inside YouTube live chat',
    'Small tools appear where chat already happens, without replacing YouTube chat.'
  );
  await playDemoStartupEffect(page, recorder, 1_350);
  await recorder.holdStill(3_900);
  await fadeOutDemoCaption(page, recorder, 360);
  await recorder.holdStill(360);

  recorder.setStage('Translate chat');
  await sectionTranslateChat(page, chat, context, recorder);
  recorder.setStage('Translate draft');
  await sectionComposerTranslation(page, chat, recorder);
  recorder.setStage('Reply faster');
  await sectionReplyFaster(page, chat, recorder);
  recorder.setStage('Recent messages');
  await sectionRecentMessages(page, chat, recorder);
  recorder.setStage('Focus mode');
  await sectionFocusMode(page, chat, recorder);
  recorder.setStage('Inbox');
  await sectionInbox(page, chat, recorder);
  recorder.setStage('Playground');
  await sectionPlayground(page, chat, context, recorder);
  recorder.setStage('Marked users');
  await sectionMarkedUsers(page, chat, context, recorder);
  recorder.setStage('Emoji and commands');
  await sectionEmojiAndCommands(page, chat, recorder);
  recorder.setStage('Popup');
  await sectionPopupStatus(page, context, recorder);

  recorder.setStage('Outro');
  await setDemoCameraForBox(page, recorder, null);
  await scrollWatchPageToTop(page, recorder);
  await clearDemoFocus(page);
  await parkDemoCursorForOutro(page, recorder);
  await setDemoCaption(
    page,
    'Chat Enhancer Demo',
    'Translation, replies, context, Inbox, bookmarks, emojis, commands, Playground, and popup settings working together.'
  );
  await recorder.hold(360);
  await recorder.holdStill(4_640);
  await fadeOutDemoCaption(page, recorder, 420);
  await recorder.holdStill(480);
}

async function sectionTranslateChat(page, chat, context, recorder) {
  await focusChatHeader(page, chat, recorder, { showFocus: false });
  await positionDemoChatAtMessage(chat, 'translate-2');
  const settingsButton = chat.locator([
    'yt-live-chat-header-renderer #live-chat-header-context-menu button',
    'yt-live-chat-header-renderer #live-chat-header-context-menu yt-icon-button',
    'yt-live-chat-header-renderer #live-chat-header-context-menu'
  ].join(',')).first();
  const settingsMenu = await openChatSettingsMenu(page, chat, recorder, settingsButton, {
    caption: {
      title: 'Translate live chat',
      body: 'Enable it from chat settings, then choose language and display mode in the extension popup.'
    }
  });
  await keepMenuWithinFrameViewport(settingsMenu);
  const translateSetting = settingsMenu.locator('.ytcq-settings-item[data-ytcq-setting="targetLanguage"]').first();
  await highlightLocator(page, translateSetting, 8);
  await recorder.hold(240);
  await recorder.holdStill(760);
  if (await translateSetting.getAttribute('aria-checked').catch(() => '') !== 'true') {
    await clickWithCursor(page, translateSetting, recorder, 'Translate chat setting', {
      afterClickHoldMs: 0
    });
  }
  await setExtensionStorage(context, 'sync', {
    lastTranslationTarget: 'en',
    targetLanguage: 'en'
  });
  await closeNativeMenus(chat);
  await recorder.refreshCaptureSource();

  await waitForDemoMessageTranslation(chat, 'translate-2', {
    timeout: 900
  });
  await recorder.refreshCaptureSource();
  await recorder.hold(500);
  await showDemoCaptionFor(
    page,
    recorder,
    'Translations appear in chat',
    'Messages can stay readable below the original text.',
    { anchorLocator: chat.locator(`${demoChatMessageSelector}[data-ytcq-demo-key="translate-2"]`).first() }
  );

  await setExtensionStorage(context, 'sync', { translationDisplay: 'replace' });
  await waitForDemoMessageTranslation(chat, 'translate-2', {
    display: 'replace',
    timeout: 900
  });
  await recorder.refreshCaptureSource();
  await recorder.hold(800);
  await showDemoCaptionFor(
    page,
    recorder,
    'Or replace the message',
    'Choose the Replace translation display in the extension settings for a more compact view.',
    { anchorLocator: chat.locator(`${demoChatMessageSelector}[data-ytcq-demo-key="translate-2"]`).first() }
  );
  await closeNativeMenus(chat);
}

async function openChatSettingsMenu(page, chat, recorder, settingsButton, firstClickOptions) {
  const markerSelector = '.ytcq-settings-item[data-ytcq-setting="targetLanguage"]';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await closeNativeMenus(chat);
    await clickWithCursor(page, settingsButton, recorder, 'chat settings button', attempt === 0
      ? firstClickOptions
      : { afterClickHoldMs: 260, durationMs: 420 });

    await poll(async () => {
      return Boolean(await findVisibleMenu(chat, markerSelector).catch(() => null));
    }, {
      label: 'chat settings menu',
      timeout: 3_000
    }).catch(() => undefined);

    const menu = await findVisibleMenu(chat, markerSelector).catch(() => null);
    if (menu) {
      await keepMenuWithinFrameViewport(menu);
      return menu;
    }

    await clickChatSettingsButtonDirectly(settingsButton);
    const fallbackMenu = await findVisibleMenu(chat, markerSelector).catch(() => null);
    if (fallbackMenu) {
      await keepMenuWithinFrameViewport(fallbackMenu);
      return fallbackMenu;
    }
  }

  throw new Error('Timed out waiting for chat settings menu.');
}

async function clickChatSettingsButtonDirectly(settingsButton) {
  await settingsButton.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    const target = element.matches('button, yt-icon-button')
      ? element
      : element.querySelector('button, yt-icon-button') || element;
    if (!(target instanceof HTMLElement)) return;
    const eventOptions = {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse'
    };
    target.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
    target.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    target.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOptions, buttons: 0 }));
    target.click();
  }).catch(() => undefined);
}

async function sectionComposerTranslation(page, chat, recorder) {
  const button = chat.locator('.ytcq-composer-translate-button').first();
  const composer = chat.locator('yt-live-chat-message-input-renderer').first();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await focusComposerArea(page, chat, recorder, { showFocus: false });
  const composerBox = await getLocatorBox(composer, 'chat composer');
  await openComposerTranslationPanel(page, chat, recorder, button, {
    afterFocusHoldMs: 240,
    beforeFocusHoldMs: 560,
    caption: {
      title: 'Translate what you type',
      body: 'Pick a language, write normally, and the draft is translated before sending.',
      anchorBox: composerBox,
      options: {
        placement: 'above',
        verticalGap: 28
      }
    }
  });

  await selectComposerLanguage(chat, 'ja');
  await recorder.hold(520);
  await fadeOutDemoCaption(page, recorder, 280);
  await clearChatComposer(chat);
  await typeIntoComposerHuman(chat, recorder, 'Thanks for the stream @ChatDemo ✅');
  await waitForComposerTextToChange(chat, 'Thanks for the stream @ChatDemo ✅');
  await showDemoCaptionFor(
    page,
    recorder,
    'Mentions and emojis stay intact',
    'The draft translator protects the pieces YouTube chat needs to keep untouched.',
    { anchorLocator: composer }
  );
  await selectComposerLanguage(chat, '', { allowHidden: true });
  await recorder.hold(300);
  await chat.locator('body').press('Escape').catch(() => undefined);
  await clearChatComposer(chat);
}

async function openComposerTranslationPanel(page, chat, recorder, button, firstClickOptions) {
  const panel = chat.locator('.ytcq-composer-translate-panel').first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickWithCursor(page, button, recorder, 'composer translate button', attempt === 0
      ? firstClickOptions
      : { afterClickHoldMs: 260, durationMs: 420 });
    if (await panel.isVisible({ timeout: 1_500 }).catch(() => false)) return panel;
  }

  throw new Error('Timed out waiting for composer translation panel.');
}

async function sectionReplyFaster(page, chat, recorder) {
  await focusMessageArea(page, chat, recorder);
  await clearChatComposer(chat);
  await smoothScrollDemoChatToMessage(chat, 'reply', recorder);
  const mentionMenu = await openMessageMenuWithVisibleClick(page, chat, recorder, 'reply');
  const splitActions = mentionMenu.menu.locator('.ytcq-context-item[data-ytcq-action="reply-actions"]').first();
  await splitActions.waitFor({ state: 'visible', timeout: 10_000 });
  await recorder.hold(240);
  await highlightLocator(page, splitActions, 8);
  await showDemoCaptionFor(
    page,
    recorder,
    'Reply faster',
    'The message menu adds compact Mention and Quote actions without crowding the menu.',
    { anchorLocator: splitActions }
  );

  await clickWithCursor(
    page,
    splitActions.locator('.ytcq-context-split-button[data-ytcq-action="mention"]').first(),
    recorder,
    'Mention action'
  );
  await showComposerDraftResult(page, chat, recorder, 1_650);
  await clearChatComposer(chat);
  await closeFocusPromptIfPresent(chat);

  await focusReplyComposerOverview(page, recorder);
  const source = await getDemoMessageSource(chat, 'reply', { center: false });
  await waitForDemoMessageWiring(chat, 'reply', ['ytcqAuthorMentionWired']);
  await clickWithCursor(page, source.author, recorder, 'author name', {
    caption: {
      title: 'Click or Alt-click the author',
      body: 'Author names also support quick mention and quote drafts.'
    }
  });
  await showComposerDraftResult(page, chat, recorder, 1_250, { moveCamera: false });
  await clearChatComposer(chat);
  await closeFocusPromptIfPresent(chat);
  await clickWithCursor(page, source.author, recorder, 'Alt-click author name', {
    afterClickHoldMs: 180,
    modifiers: ['Alt']
  });
  await showComposerDraftResult(page, chat, recorder, 1_700, { moveCamera: false });
  await clearChatComposer(chat);
  await closeFocusPromptIfPresent(chat);
  await fadeOutDemoCaption(page, recorder, 240);
}

async function sectionRecentMessages(page, chat, recorder) {
  await focusMessageArea(page, chat, recorder);
  await smoothScrollDemoChatToMessage(chat, 'recent-2', recorder);
  const source = await getDemoMessageSource(chat, 'recent-2', { center: false });
  await waitForDemoMessageWiring(chat, 'recent-2', ['ytcqProfileWired']);
  await clickWithCursor(page, source.avatar, recorder, 'chat avatar', {
    caption: {
      title: 'See recent messages',
      body: 'Click an avatar to review that user’s recent messages and channel shortcut.'
    }
  });
  const card = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)').first();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  await showDemoCaptionFor(
    page,
    recorder,
    'Context without losing chat',
    'The profile card stays compact and can jump back to visible messages.',
    { anchorLocator: card }
  );
}

async function sectionFocusMode(page, chat, recorder) {
  await closeProfileCardIfPresent(chat);
  await openCollapsedFocusPromptFromRecentMessage(page, chat, recorder);
  const collapsed = chat.locator('.ytcq-focus-card-collapsed').first();
  await clickWithCursor(page, collapsed, recorder, 'collapsed focus panel');
  const expanded = chat.locator('.ytcq-focus-card-expanded').first();
  await expanded.waitFor({ state: 'visible', timeout: 10_000 });
  await showDemoCaptionFor(
    page,
    recorder,
    'The thread stays visible',
    'Focus mode keeps the selected conversation near the reply box.',
    { anchorLocator: expanded }
  );
}

async function openCollapsedFocusPromptFromRecentMessage(page, chat, recorder) {
  await smoothScrollDemoChatToMessage(chat, 'focus-1', recorder);
  const source = await getDemoMessageSource(chat, 'focus-1', { center: false });
  await waitForDemoMessageWiring(chat, 'focus-1', ['ytcqAuthorMentionWired']);
  await clickWithCursor(page, source.author, recorder, 'focus author handle', {
    caption: {
      title: 'Focus on one conversation',
      body: 'Click a handle to start Focus mode while the main chat keeps moving.'
    }
  });

  const collapsed = chat.locator('.ytcq-focus-card-collapsed').first();
  await collapsed.waitFor({ state: 'visible', timeout: 5_000 });
}

async function sectionInbox(page, chat, recorder) {
  await closeFocusPromptIfPresent(chat);
  await fadeOutDemoCaption(page, recorder, 280);
  await focusChatHeader(page, chat, recorder, { showFocus: false });
  const inboxButton = chat.locator('.ytcq-inbox-button').first();
  await clickWithCursor(page, inboxButton, recorder, 'Inbox button', {
    afterClickHoldMs: 0,
    caption: {
      title: 'Open your Inbox',
      body: 'Mentions and watched keywords are saved locally per stream.'
    }
  });
  const inbox = chat.locator('.ytcq-inbox-card').first();
  await inbox.waitFor({ state: 'visible', timeout: 10_000 });
  await ensureDemoInboxAvatar(chat);
  await fadeInDemoLocator(inbox, recorder, 360);
  await showDemoCaptionFor(
    page,
    recorder,
    'Find important messages',
    'Saved rows can be reviewed later and jumped back to while still visible.',
    { anchorLocator: inbox }
  );
  const keywordButton = inbox.locator('.ytcq-inbox-keyword-toggle').first();
  await clickWithCursor(page, keywordButton, recorder, 'Inbox keyword button', {
    caption: {
      title: 'Manage watched keywords',
      body: 'Add words or phrases here so matching chat messages go to your Inbox.'
    }
  });
  const keywordPanel = inbox.locator('.ytcq-inbox-keyword-panel').first();
  await keywordPanel.waitFor({ state: 'visible', timeout: 5_000 });
  await showDemoCaptionFor(
    page,
    recorder,
    'Selected keywords stay visible',
    'The current list is shown as chips you can remove whenever you want.',
    { anchorLocator: keywordPanel }
  );
}

async function ensureDemoInboxAvatar(chat) {
  await chat.locator('.ytcq-inbox-card').first().evaluate((card) => {
    if (!(card instanceof HTMLElement)) return;
    const row = card.querySelector('.ytcq-inbox-message');
    if (!(row instanceof HTMLElement)) return;

    let avatar = row.querySelector('.ytcq-inbox-avatar');
    if (!(avatar instanceof HTMLElement)) {
      avatar = document.createElement('span');
      avatar.className = 'ytcq-inbox-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      const timestamp = row.querySelector('.ytcq-profile-card-message-time');
      row.insertBefore(avatar, timestamp || row.firstChild);
      row.classList.add('ytcq-inbox-message-has-avatar');
    }

    avatar.classList.add('ytcq-demo-inbox-avatar-fallback');
    avatar.replaceChildren();
    const letter = document.createElement('span');
    letter.className = 'ytcq-demo-inbox-avatar-letter';
    letter.textContent = 'L';
    avatar.append(letter);
  });
}

async function sectionPlayground(page, chat, context, recorder) {
  await closeInboxPanelIfPresent(chat);

  const popup = await openExtensionPopupPage(context);
  await setDemoViewport(popup, viewport);
  await installPopupPresentationLayer(popup);
  await installDemoPlaygroundBackend(context);
  await recorder.usePage(popup);
  try {
    await fadeDemoPopupIn(popup, recorder);
    await clickWithCursor(popup, popup.locator('#playgroundTab'), recorder, 'Playground tab');
    const playgroundToggle = popup.locator('#playgroundEnabled');
    await playgroundToggle.waitFor({ state: 'visible', timeout: 10_000 });
    await clickWithCursor(popup, playgroundToggle, recorder, 'Join Playground toggle', {
      caption: {
        title: 'Games are opt-in',
        body: 'Turn it on if you want to play games with other users.',
        options: {
          placement: 'right'
        }
      }
    });
    await popup.locator('#playgroundGamesSection').waitFor({ state: 'visible', timeout: 5_000 });
    await recorder.settleThenHoldStill(2_200);
    await fadeDemoPopupOut(popup, recorder);
  } finally {
    await popup.close().catch(() => undefined);
  }

  await setDemoViewport(page, viewport);
  await recorder.usePage(page);
  const gamesButton = chat.locator('.ytcq-games-button').first();
  await gamesButton.waitFor({ state: 'visible', timeout: 15_000 });
  await focusChatHeader(page, chat, recorder, { showFocus: false });
  await clickWithCursor(page, gamesButton, recorder, 'Games button', {
    afterClickHoldMs: 800,
    caption: {
      title: 'Games stay inside live chat',
      body: 'After you opt in, the Playground button appears beside Inbox.'
    }
  });

  const gamesCard = chat.locator('.ytcq-games-card').first();
  await gamesCard.waitFor({ state: 'visible', timeout: 10_000 });
  try {
    await gamesCard.locator('.ytcq-games-grid').waitFor({
      state: 'visible',
      timeout: 30_000
    });
  } catch (error) {
    const panelText = await cleanLocatorText(gamesCard).catch(() => 'unavailable');
    const backendState = await readDemoPlaygroundBackendState(context).catch(() => null);
    throw new Error(
      `Playground game picker did not load. Panel: ${panelText}. ` +
      `Mock backend: ${JSON.stringify(backendState)}.`,
      { cause: error }
    );
  }
  await fadeOutDemoCaption(page, recorder, 320);
  await recorder.holdStill(600);
  await showDemoCaptionFor(
    page,
    recorder,
    'Browse before you play',
    'See the available games first. Nothing starts until you choose one and select someone to play with.',
    {
      anchorLocator: gamesCard,
      durationMs: 6_000
    }
  );
  await recorder.holdStill(1_200);
  const replayTriviaCard = gamesCard.locator('.ytcq-games-game-card')
    .filter({ hasText: 'HELP-A-FRIEND! Trivia' })
    .first();
  await replayTriviaCard.waitFor({ state: 'visible', timeout: 5_000 });
  await showDemoCaptionFor(
    page,
    recorder,
    'Games match the stream',
    'HELP-A-FRIEND! Trivia works on replays after a stream ends. The Wild Wild Chat and Stick Around! work during live chat; Chess works in either.',
    {
      anchorLocator: replayTriviaCard,
      durationMs: 8_000,
      padding: 6
    }
  );
  await recorder.holdStill(800);
  await closeGamesPanelIfPresent(chat);
}

async function sectionMarkedUsers(page, chat, context, recorder) {
  await closeInboxPanelIfPresent(chat);
  await stabilizeDemoChatFeed(chat);
  await recorder.hold(180);
  await smoothScrollDemoChatToMessage(chat, 'mark', recorder);
  const source = await openMessageMenuWithVisibleClick(page, chat, recorder, 'mark', {
    cameraDurationMs: 980,
    screenXRatio: 0.9
  });
  const markAction = source.menu.locator('.ytcq-context-item[data-ytcq-action="mark-user"]').first();
  const markActionBox = await getLocatorBox(markAction, 'Mark action');
  await setDemoCaption(
    page,
    'Add to bookmarks',
    'It adds an avatar ring so they are easier to spot later.',
    markActionBox,
    { gap: 48, placement: 'side' }
  );
  await recorder.settleThenHoldStill(2_700);
  await clickWithCursor(page, markAction, recorder, 'Mark action');
  await source.message.locator('#author-photo').first().waitFor({ state: 'visible', timeout: 10_000 });
  await recorder.settleThenHoldStill(1_000);
  await fadeOutDemoCaption(page, recorder, 320);
  await sectionPopupBookmarks(page, context, recorder);
}

async function sectionEmojiAndCommands(page, chat, recorder) {
  await focusComposerArea(page, chat, recorder, { showFocus: false });
  const emojiButton = chat.locator('#emoji-picker-button yt-live-chat-icon-toggle-button-renderer#emoji button').first();
  await emojiButton.waitFor({ state: 'visible', timeout: 10_000 });
  await prepareDemoEmojiPicker(chat);
  await hoverWithCursor(page, emojiButton, recorder, 'emoji picker button');
  const quickPopover = chat.locator(quickEmojiPopoverSelector).first();
  await quickPopover.waitFor({ state: 'visible', timeout: 5_000 });
  await showDemoCaptionFor(
    page,
    recorder,
    'Hover for your most-used emojis',
    'The quick popover keeps common reactions one move away.',
    { anchorLocator: quickPopover }
  );

  await clickWithCursor(page, emojiButton, recorder, 'emoji picker button', {
    afterClickHoldMs: 240,
    durationMs: 260
  });
  const picker = chat.locator('yt-emoji-picker-renderer').first();
  await picker.waitFor({ state: 'attached', timeout: 10_000 });
  await scrubDemoEmojiPicker(chat);
  await ensureDemoEmojiPickerVisible(chat, emojiButton);
  await showDemoCaptionFor(
    page,
    recorder,
    'Reuse them in the full picker',
    'Your most-used row also appears inside YouTube’s emoji picker.',
    { anchorLocator: chat.locator('.ytcq-frequent-emoji-row').first() }
  );

  await closeEmojiPickerIfPresent(chat, recorder);
  await clearChatComposer(chat);
  const composer = chat.locator('yt-live-chat-message-input-renderer').first();
  const composerBox = await getLocatorBox(composer, 'chat composer');
  await setDemoCaption(
    page,
    'Commands are available in chat',
    'Type a slash command in your draft, then press Tab to expand it before sending.',
    composerBox,
    { placement: 'side' }
  );
  await recorder.settleThenHoldStill(2_600);
  const whenTarget = getFutureDemoWhenTarget();
  await typeIntoComposerHuman(chat, recorder, `the event is in /when ${whenTarget}`);
  await fadeOutDemoCaption(page, recorder, 320);
  await recorder.holdStill(440);
  await getChatComposerInput(chat).press('Tab');
  await poll(async () => {
    const text = await getComposerText(chat);
    return text.includes('the event is in ') && !text.includes('/when');
  }, {
    label: '/when command expansion',
    timeout: 10_000
  });
  await waitForExtensionToastToClear(chat, recorder);
  await showDemoCaptionFor(
    page,
    recorder,
    'Time helpers expand inline',
    'Type /when with a time, press Tab, and the command becomes a countdown in your draft.',
    { anchorLocator: chat.locator('yt-live-chat-message-input-renderer').first() }
  );
  await clearChatComposer(chat);
  await closeEmojiPickerIfPresent(chat, recorder);
}

async function sectionPopupStatus(page, context, recorder) {
  const popup = await openExtensionPopupPage(context);
  await setDemoViewport(popup, viewport);
  await installPopupPresentationLayer(popup);
  await recorder.usePage(popup);
  try {
    await fadeDemoPopupIn(popup, recorder);
    await setDemoCaption(
      popup,
      'Advanced settings live in the extension popup',
      'Check connection status, manage less-frequent options, review bookmarks, and use the reset button here.'
    );
    await recorder.settleThenHoldStill(5_800);
    await clickWithCursor(popup, popup.locator('#bookmarksTab'), recorder, 'Bookmarks tab');
    await recorder.settleThenHoldStill(2_200);
    await clickWithCursor(popup, popup.locator('#settingsTab'), recorder, 'Settings tab');
    await recorder.settleThenHoldStill(1_600);
    await fadeDemoPopupOut(popup, recorder);
  } finally {
    await popup.close().catch(() => undefined);
  }

  await setDemoViewport(page, viewport);
  await recorder.usePage(page);
}

async function sectionPopupBookmarks(page, context, recorder) {
  const popup = await openExtensionPopupPage(context);
  await setDemoViewport(popup, viewport);
  await installPopupPresentationLayer(popup);
  await recorder.usePage(popup);
  try {
    await fadeDemoPopupIn(popup, recorder);
    await popup.locator('#bookmarksTab').click();
    await popup.locator('.bookmark-row').first().waitFor({ state: 'visible', timeout: 10_000 });
    await setDemoCaption(
      popup,
      'Bookmarks live in the popup',
      'Marked users are managed away from the crowded chat menu.'
    );
    await highlightLocator(popup, popup.locator('.bookmark-row').first(), 10);
    await recorder.settleThenHoldStill(4_300);
    await clearDemoFocus(popup);
    await fadeDemoPopupOut(popup, recorder);
  } finally {
    await popup.close().catch(() => undefined);
  }

  await setDemoViewport(page, viewport);
  await recorder.usePage(page);
}

async function seedWalkthroughExtensionState(context, activeSourceUrl) {
  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) {
    throw new Error('Could not find Chat Enhancer in the demo Chrome profile.');
  }

  const recordsKey = `ytcqInboxRecords:${getSourceStorageKey(activeSourceUrl)}`;
  const inboxRecord = {
    ...demoInboxRecord,
    sourceUrl: activeSourceUrl
  };
  const extensionPage = await context.newPage();
  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      timeout: 15_000,
      waitUntil: 'domcontentloaded'
    });
    await extensionPage.evaluate(([
      recordsKey,
      inboxRecord,
      emojiKey,
      markedKey,
      playgroundDisplayNameKey,
      playgroundIdentityKey
    ]) => {
      return Promise.all([
        new Promise((resolve) => chrome.storage.sync.set({
          composerTranslateLanguage: '',
          lastTranslationTarget: 'en',
          playgroundEnabled: false,
          playgroundGamesAvailable: false,
          sound: false,
          startupEffect: false,
          targetLanguage: '',
          translationDisplay: 'below'
        }, resolve)),
        new Promise((resolve) => chrome.storage.local.set({
          [recordsKey]: [inboxRecord],
          ytcqInboxKeywords: ['encore'],
          [emojiKey]: createDemoEmojiUsage(),
          [markedKey]: {}
        }, resolve)),
        new Promise((resolve) => chrome.storage.local.remove([
          playgroundDisplayNameKey,
          playgroundIdentityKey
        ], resolve))
      ]);

      function createDemoEmojiUsage() {
        const now = Date.now();
        return ['✅', '😂', '👏', '🔥', '💙', '🙌', '⭐', '🎉'].map((emoji, index) => ({
          alt: emoji,
          count: 12 - index,
          emojiId: '',
          key: `text:${emoji}`,
          label: emoji,
          lastUsed: now - index,
          shortcut: '',
          src: '',
          text: emoji
        }));
      }
    }, [
      recordsKey,
      inboxRecord,
      emojiUsageStorageKey,
      markedUsersStorageKey,
      playgroundDisplayNameStorageKey,
      playgroundIdentityStorageKey
    ]);
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
}

async function installDemoAssetRoutes(context) {
  await context.route(demoLuciaAvatarUrl, async (route) => {
    await route.fulfill({
      body: createDemoAvatarSvg('@LuciaLive'),
      contentType: 'image/svg+xml',
      status: 200
    });
  });
}

async function installDemoPlaygroundBackend(context) {
  // Keep the capture out of the production lobby while exercising the real
  // content-side client and Games UI with a deterministic empty snapshot.
  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) throw new Error('Could not find Chat Enhancer extension id.');
  const serviceWorkerUrl = `chrome-extension://${extensionId}/background.js`;
  const serviceWorker = context.serviceWorkers().find((worker) => worker.url() === serviceWorkerUrl) ||
    await context.waitForEvent('serviceworker', {
      predicate: (worker) => worker.url() === serviceWorkerUrl,
      timeout: 10_000
    });

  await serviceWorker.evaluate(() => {
    if (globalThis.__ytcqDemoPlaygroundBackendInstalled) return;
    const backendState = {
      clientMessages: [],
      connections: 0,
      portMessages: [],
      ports: []
    };
    const demoUserId = 'walkthrough-demo-user';
    const createDemoSnapshot = () => ({
      games: [],
      invites: [],
      users: [{
        availableGames: [],
        displayName: 'Player WALK',
        joinedAt: Date.now(),
        userId: demoUserId
      }]
    });
    chrome.runtime.onConnect.addListener((port) => {
      backendState.ports.push(port.name);
      port.onMessage.addListener((message) => {
        backendState.portMessages.push(message?.type || 'unknown');
        if (port.name !== 'ytcq:playground' || message?.type !== 'ytcq:playground:init') return;
        setTimeout(() => {
          try {
            port.postMessage({
              snapshot: createDemoSnapshot(),
              type: 'ytcq:playground:snapshot',
              userId: demoUserId
            });
          } catch {
            // The capture may close the popup or tab before the queued response runs.
          }
        }, 0);
      });
    });

    class DemoPlaygroundWebSocket extends EventTarget {
      static CLOSED = 3;
      static CLOSING = 2;
      static CONNECTING = 0;
      static OPEN = 1;

      readyState = DemoPlaygroundWebSocket.OPEN;

      constructor(url) {
        super();
        this.url = String(url);
        backendState.connections += 1;
        setTimeout(() => {
          this.dispatchServerMessage({
            challenge: 'walkthrough-demo-challenge',
            issuedAt: Date.now(),
            protocolVersion: 1,
            type: 'challenge'
          });
        }, 0);
      }

      close() {
        if (this.readyState === DemoPlaygroundWebSocket.CLOSED) return;
        this.readyState = DemoPlaygroundWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
      }

      send(data) {
        let message;
        try {
          message = JSON.parse(String(data));
        } catch {
          return;
        }
        backendState.clientMessages.push(message?.type || 'unknown');

        if (message?.type === 'hello') {
          setTimeout(() => {
            this.dispatchServerMessage({
              snapshot: createDemoSnapshot(),
              type: 'helloAccepted',
              userId: demoUserId
            });
          }, 0);
          return;
        }

        if (message?.type === 'ping') {
          setTimeout(() => {
            this.dispatchServerMessage({
              id: message.id,
              type: 'pong'
            });
          }, 0);
        }
      }

      dispatchServerMessage(message) {
        if (this.readyState !== DemoPlaygroundWebSocket.OPEN) return;
        this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify(message)
        }));
      }
    }

    globalThis.__ytcqDemoPlaygroundBackend = backendState;
    globalThis.__ytcqDemoPlaygroundBackendInstalled = true;
    globalThis.WebSocket = DemoPlaygroundWebSocket;
  });
}

async function readDemoPlaygroundBackendState(context) {
  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) return null;
  const serviceWorkerUrl = `chrome-extension://${extensionId}/background.js`;
  const serviceWorker = context.serviceWorkers().find((worker) => worker.url() === serviceWorkerUrl);
  if (!serviceWorker) return null;
  return serviceWorker.evaluate(() => globalThis.__ytcqDemoPlaygroundBackend || null);
}

async function openExtensionPopupPage(context) {
  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) throw new Error('Could not find Chat Enhancer extension id.');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    timeout: 15_000,
    waitUntil: 'domcontentloaded'
  });
  await popup.locator('[data-extension-status]').waitFor({ state: 'visible', timeout: 10_000 });
  return popup;
}

async function setExtensionStorage(context, area, values) {
  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) throw new Error('Could not find Chat Enhancer extension id.');
  const extensionPage = await context.newPage();
  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      timeout: 15_000,
      waitUntil: 'domcontentloaded'
    });
    await extensionPage.evaluate(([storageArea, nextValues]) => {
      return new Promise((resolve) => {
        chrome.storage[storageArea].set(nextValues, resolve);
      });
    }, [area, values]);
  } finally {
    await extensionPage.close().catch(() => undefined);
  }
}

async function playDemoStartupEffect(page, recorder, durationMs) {
  const frames = durationToFrames(durationMs);
  await installFrameSteppedStartupEffect(page);

  for (let frame = 0; frame < frames; frame += 1) {
    const progress = frames <= 1 ? 1 : frame / (frames - 1);
    await page.evaluate((nextProgress) => {
      window.__ytcqDemoDrawStartupEffect?.(nextProgress);
    }, progress);
    await recorder.captureFrame();
  }

  await page.evaluate(() => {
    window.__ytcqDemoClearStartupEffect?.();
  });
}

async function installFrameSteppedStartupEffect(page) {
  await page.evaluate(() => {
    if (window.__ytcqDemoDrawStartupEffect) return;

    const effectClass = 'ytcq-demo-startup-effect';
    const canvasScale = 0.7;
    const glowPadding = 18;

    const getOrCreateEffect = () => {
      let effect = document.querySelector(`.${effectClass}`);
      if (!(effect instanceof HTMLDivElement)) {
        effect = document.createElement('div');
        effect.className = effectClass;
        effect.setAttribute('aria-hidden', 'true');
        Object.assign(effect.style, {
          inset: '0',
          overflow: 'visible',
          pointerEvents: 'none',
          position: 'fixed',
          zIndex: '2147483647'
        });
      }

      let canvas = effect.querySelector('canvas');
      if (!(canvas instanceof HTMLCanvasElement)) {
        canvas = document.createElement('canvas');
        Object.assign(canvas.style, {
          display: 'block',
          filter: 'blur(6px) saturate(1.2) brightness(1.05)',
          height: '100%',
          inset: '0',
          opacity: '1',
          position: 'absolute',
          width: '100%'
        });
        effect.append(canvas);
      }

      if (!effect.isConnected) {
        (document.body || document.documentElement).append(effect);
      }

      return { canvas, effect };
    };

    const getChatFrameBox = () => {
      const frame = document.querySelector('iframe#chatframe');
      if (!(frame instanceof HTMLIFrameElement)) return null;
      const rect = frame.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null;
      return {
        height: rect.height,
        width: rect.width,
        x: rect.left,
        y: rect.top
      };
    };

    const getActivationOpacity = (progress) => {
      if (progress < 0.16) return progress / 0.16;
      if (progress > 0.76) return Math.max(0, (1 - progress) / 0.24);
      return 1;
    };

    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

    const strokeRoundedRect = (context, x, y, width, height, radius) => {
      const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
      context.beginPath();
      context.moveTo(x + safeRadius, y);
      context.lineTo(x + width - safeRadius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
      context.lineTo(x + width, y + height - safeRadius);
      context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
      context.lineTo(x + safeRadius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
      context.lineTo(x, y + safeRadius);
      context.quadraticCurveTo(x, y, x + safeRadius, y);
      context.closePath();
      context.stroke();
    };

    const drawPerimeterStroke = (context, box, strokeStyle, lineWidth) => {
      const inset = 2 + glowPadding;
      const width = box.width + glowPadding * 2;
      const height = box.height + glowPadding * 2;
      const radius = Math.min(18, width / 2 - inset, height / 2 - inset);

      context.save();
      context.strokeStyle = strokeStyle;
      context.lineWidth = lineWidth;
      strokeRoundedRect(context, box.x + inset - glowPadding, box.y + inset - glowPadding, width - inset * 2, height - inset * 2, radius);
      context.restore();
    };

    const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

    const getFiniteSize = (candidate, fallback) => {
      if (Number.isFinite(candidate) && candidate > 0) return candidate;
      if (Number.isFinite(fallback) && fallback > 0) return fallback;
      return 1;
    };

    const createShimmerGradient = (context, box, progress) => {
      const safeProgress = clamp01(progress);
      const safeWidth = getFiniteSize(box.width, window.innerWidth);
      const safeHeight = getFiniteSize(box.height, window.innerHeight);
      const gradient = context.createConicGradient(
        safeProgress * Math.PI * 2 - Math.PI * 0.8,
        box.x + safeWidth / 2,
        box.y + safeHeight / 2
      );
      gradient.addColorStop(0, 'rgba(62, 166, 255, 0)');
      gradient.addColorStop(0.08, 'rgba(62, 166, 255, 0)');
      gradient.addColorStop(0.12, 'rgba(62, 166, 255, 0.36)');
      gradient.addColorStop(0.155, 'rgba(125, 211, 252, 0.9)');
      gradient.addColorStop(0.175, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.195, 'rgba(125, 211, 252, 0.9)');
      gradient.addColorStop(0.25, 'rgba(126, 87, 255, 0.28)');
      gradient.addColorStop(0.34, 'rgba(62, 166, 255, 0)');
      gradient.addColorStop(1, 'rgba(62, 166, 255, 0)');
      return gradient;
    };

    window.__ytcqDemoDrawStartupEffect = (progress) => {
      const { canvas } = getOrCreateEffect();
      const box = getChatFrameBox();
      if (!box) return;
      const safeProgress = clamp01(progress);
      const width = getFiniteSize(window.innerWidth, document.documentElement.clientWidth);
      const height = getFiniteSize(window.innerHeight, document.documentElement.clientHeight);
      const pixelWidth = Math.ceil(width * canvasScale);
      const pixelHeight = Math.ceil(height * canvasScale);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.style.opacity = '1';
      canvas.style.transition = 'none';
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.save();
      context.scale(canvasScale, canvasScale);
      context.globalAlpha = getActivationOpacity(safeProgress);
      context.globalCompositeOperation = 'lighter';
      drawPerimeterStroke(context, box, 'rgba(62, 166, 255, 0.3)', 5);
      drawPerimeterStroke(context, box, createShimmerGradient(context, box, easeOutCubic(safeProgress)), 13);
      context.restore();
    };

    window.__ytcqDemoClearStartupEffect = () => {
      const effect = document.querySelector(`.${effectClass}`);
      const canvas = effect?.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.opacity = '';
        canvas.style.transition = '';
      }
      effect?.remove();
    };
  });
}

async function resolveWalkthroughSourceUrl(page) {
  const sourceCandidates = await page.evaluate(() => {
    const playerResponse = window.ytInitialPlayerResponse;
    return {
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || '',
      currentUrl: window.location.href,
      openGraphUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      videoId: playerResponse?.videoDetails?.videoId || ''
    };
  }).catch(() => ({
    canonicalUrl: '',
    currentUrl: page.url(),
    openGraphUrl: '',
    videoId: ''
  }));

  for (const candidate of [
    sourceCandidates.currentUrl,
    sourceCandidates.canonicalUrl,
    sourceCandidates.openGraphUrl
  ]) {
    const videoId = getVideoIdFromUrl(candidate);
    if (videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }
  if (sourceCandidates.videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(sourceCandidates.videoId)}`;
  }
  return sourceUrl;
}

async function openWatchPageChatFrame(page, url) {
  await setDemoViewport(page, viewport);
  await page.goto(url, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  await dismissConsentIfPresent(page);
  const frameLocator = page.locator('iframe#chatframe').first();
  try {
    await frameLocator.waitFor({ state: 'visible', timeout: 60_000 });
  } catch (error) {
    await writeDemoDiagnostics(page);
    throw error;
  }
  const chat = page.frameLocator('iframe#chatframe');
  await waitForLiveChatRenderer(page, chat);
  await chat.locator('.ytcq-inbox-button').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  return chat;
}

async function waitForLiveChatRenderer(page, chat) {
  try {
    await chat.locator('yt-live-chat-renderer').first().waitFor({ state: 'visible', timeout: 60_000 });
  } catch (error) {
    await writeDemoDiagnostics(page);
    throw error;
  }
}

async function focusChatHeader(page, chat, recorder, options = {}) {
  const chatFrame = page.locator('iframe#chatframe').first();
  const box = await getLocatorBox(chatFrame, 'chat frame');
  await setDemoCameraForBox(page, recorder, box, {
    focusYRatio: 0,
    preserveRightEdge: true,
    scale: 1.26,
    screenXRatio: 0.82,
    screenYRatio: 0.02
  });
  await recorder.hold(240);
  if (options.showFocus !== false) {
    await setDemoFocusOnLocator(page, chat.locator('yt-live-chat-header-renderer').first(), 10);
  }
}

async function focusMessageArea(page, chat, recorder, options = {}) {
  const box = await getLocatorBox(page.locator('iframe#chatframe').first(), 'chat frame');
  await setDemoCameraForBox(page, recorder, box, {
    focusXRatio: options.alignRight ? 1 : 0.5,
    preserveRightEdge: true,
    scale: 1.22,
    screenXRatio: options.screenXRatio ?? (options.alignRight ? 0.93 : 0.84),
    screenYRatio: 0.52,
    durationMs: options.durationMs
  });
  await recorder.hold(options.afterHoldMs ?? 240);
  await clearDemoFocus(page);
}

async function focusComposerArea(page, chat, recorder, options = {}) {
  const composer = chat.locator('yt-live-chat-message-input-renderer').first();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  const box = await getLocatorBox(composer, 'chat composer');
  await setDemoCameraForBox(page, recorder, box, {
    focusYRatio: 1,
    preserveRightEdge: true,
    scale: 1.28,
    screenXRatio: 0.84,
    screenYRatio: 0.88
  });
  await recorder.hold(options.afterHoldMs ?? 240);
  if (options.showFocus !== false) {
    await setDemoFocusOnLocator(page, composer, 10);
  }
}

async function focusReplyComposerOverview(page, recorder) {
  const box = await getLocatorBox(page.locator('iframe#chatframe').first(), 'chat frame');
  await setDemoCameraForBox(page, recorder, box, {
    focusXRatio: 0.72,
    focusYRatio: 0.58,
    preserveRightEdge: true,
    scale: 1.15,
    screenXRatio: 0.87,
    screenYRatio: 0.56,
    durationMs: 840
  });
  await recorder.hold(220);
  await clearDemoFocus(page);
}

async function showComposerDraftResult(page, chat, recorder, durationMs, options = {}) {
  const input = getChatComposerInput(chat);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.evaluate((element) => {
    if (element instanceof HTMLElement) element.focus();
  }).catch(() => undefined);
  if (options.moveCamera !== false) {
    await focusComposerArea(page, chat, recorder, {
      afterHoldMs: 180,
      showFocus: false
    });
  } else {
    await recorder.hold(180);
  }
  await setDemoFocusOnLocator(page, input, 8);
  await recorder.hold(220);
  await recorder.holdStill(durationMs);
  await clearDemoFocus(page);
  await recorder.hold(160);
}

async function waitForDemoMessageTranslation(chat, messageKey, { display = 'below', timeout = 8_000 } = {}) {
  const selector = display === 'replace'
    ? `${demoChatMessageSelector}[data-ytcq-demo-key="${messageKey}"].ytcq-translation-replaced[data-ytcq-translation-view="translated"] #message`
    : `${demoChatMessageSelector}[data-ytcq-demo-key="${messageKey}"] .ytcq-translation`;
  const locator = chat.locator(selector);
  try {
    await getFirstVisibleLocator(locator, timeout);
    return;
  } catch (error) {
    const rendered = await chat.locator('body').evaluate((body, [key, nextDisplay]) => {
      void body;
      return Boolean(window.__ytcqDemoRenderTranslation?.(key, nextDisplay));
    }, [messageKey, display]).catch(() => false);
    if (!rendered) throw error;
  }

  await getFirstVisibleLocator(locator, 5_000);
}

async function stabilizeDemoChatFeed(chat) {
  await chat.locator('body').evaluate((body) => {
    void body;
    window.__ytcqDemoManualScrollUntil = 0;
    window.__ytcqDemoStabilizeChat?.();
  }).catch(() => undefined);
}

async function positionDemoChatAtMessage(chat, messageKey) {
  await chat.locator('body').evaluate((body, key) => {
    void body;
    window.__ytcqDemoManualScrollUntil = Date.now() + 60_000;
    window.__ytcqDemoStabilizeChat?.();
    const scroller = document.querySelector('yt-live-chat-item-list-renderer #item-scroller');
    const message = document.querySelector(`.ytcq-demo-message[data-ytcq-demo-key="${CSS.escape(key)}"]`);
    const stage = document.querySelector('.ytcq-demo-message-stage');
    if (!(scroller instanceof HTMLElement) || !(message instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;

    const lastMessage = stage.querySelector('.ytcq-demo-message:last-child');
    const lastMessageBottom = lastMessage instanceof HTMLElement
      ? lastMessage.offsetTop + lastMessage.offsetHeight + 4
      : stage.scrollHeight;
    const targetTop = message.offsetTop - Math.max(0, (scroller.clientHeight - message.offsetHeight) / 2);
    const maxTop = Math.max(0, lastMessageBottom - scroller.clientHeight);
    window.__ytcqDemoSetChatScrollTop?.(Math.max(0, Math.min(maxTop, targetTop)));
  }, messageKey).catch(() => undefined);
}

async function smoothScrollDemoChatToMessage(chat, messageKey, recorder) {
  const positions = await chat.locator('body').evaluate((body, key) => {
    void body;
    window.__ytcqDemoManualScrollUntil = Date.now() + 60_000;
    window.__ytcqDemoStabilizeChat?.();
    const scroller = document.querySelector('yt-live-chat-item-list-renderer #item-scroller');
    const message = document.querySelector(`.ytcq-demo-message[data-ytcq-demo-key="${CSS.escape(key)}"]`);
    const stage = document.querySelector('.ytcq-demo-message-stage');
    if (!(scroller instanceof HTMLElement) || !(message instanceof HTMLElement) || !(stage instanceof HTMLElement)) return null;

    const lastMessage = stage.querySelector('.ytcq-demo-message:last-child');
    const lastMessageBottom = lastMessage instanceof HTMLElement
      ? lastMessage.offsetTop + lastMessage.offsetHeight + 4
      : stage.scrollHeight;
    const currentTop = window.__ytcqDemoChatScrollTop || 0;
    const targetTop = message.offsetTop - Math.max(0, (scroller.clientHeight - message.offsetHeight) / 2);
    const maxTop = Math.max(0, lastMessageBottom - scroller.clientHeight);
    return {
      end: Math.max(0, Math.min(maxTop, targetTop)),
      start: currentTop
    };
  }, messageKey).catch(() => null);

  if (!positions) return;
  const steps = durationToFrames(760);
  await chat.locator('body').evaluate(() => {
    window.__ytcqDemoManualScrollUntil = Date.now() + 60_000;
  }).catch(() => undefined);
  for (let step = 1; step <= steps; step += 1) {
    const progress = easeInOutCubic(step / steps);
    const scrollTop = positions.start + (positions.end - positions.start) * progress;
    await chat.locator('body').evaluate((body, nextScrollTop) => {
      void body;
      window.__ytcqDemoSetChatScrollTop?.(nextScrollTop);
    }, scrollTop).catch(() => undefined);
    await recorder.captureFrame();
  }
  await chat.locator('body').evaluate(() => {
    window.__ytcqDemoManualScrollUntil = Date.now() + 60_000;
  }).catch(() => undefined);
}

async function scrollWatchPageToTop(page, recorder) {
  await page.evaluate(() => {
    window.scrollTo({ behavior: 'smooth', top: 0 });
  }).catch(() => undefined);
  await recorder.hold(720);
}

async function selectComposerLanguage(chat, languageCode, { allowHidden = false } = {}) {
  const select = chat.locator('.ytcq-composer-translate-select').first();
  await select.waitFor({ state: allowHidden ? 'attached' : 'visible', timeout: 10_000 });
  if (!allowHidden) {
    await select.selectOption(languageCode);
    return;
  }
  await select.evaluate((element, nextValue) => {
    element.value = nextValue;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, languageCode);
}

async function clearChatComposer(chat) {
  const input = getChatComposerInput(chat);
  if (!await input.isVisible({ timeout: 1_000 }).catch(() => false)) return;
  await input.evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = '';
    } else {
      element.replaceChildren();
    }
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward'
    }));
  });
}

async function closeEmojiPickerIfPresent(chat, recorder) {
  const picker = chat.locator('yt-emoji-picker-renderer').first();
  const hadPicker = await picker.count() > 0;
  if (hadPicker && await picker.isVisible({ timeout: 500 }).catch(() => false)) {
    await chat.locator('body').press('Escape').catch(() => undefined);
    await recorder.hold(180);
    if (await picker.isVisible({ timeout: 500 }).catch(() => false)) {
      await chat.locator('#emoji-picker-button yt-live-chat-icon-toggle-button-renderer#emoji button').first()
        .click({ timeout: 2_000 })
        .catch(() => undefined);
      await recorder.hold(240);
    }
  }
  const removedCount = await removeDemoEmojiOverlays(chat);
  if (hadPicker || removedCount) await recorder.hold(120);
}

async function removeDemoEmojiOverlays(chat) {
  return chat.locator('body').evaluate(() => {
    let removedCount = 0;
    const persistentChatControlSelector = [
      'yt-live-chat-message-input-renderer',
      'yt-live-chat-viewer-engagement-message-input-renderer',
      'yt-reaction-control-panel-view-model',
      'yt-reaction-control-panel-renderer',
      'yt-live-chat-reaction-control-panel-renderer',
      'yt-live-chat-reaction-button-renderer',
      '#emoji-picker-button',
      '#input-buttons',
      '#button-panel'
    ].join(',');
    const removeElement = (element) => {
      if (!(element instanceof HTMLElement) || !element.isConnected) return;
      element.remove();
      removedCount += 1;
    };

    document.querySelectorAll('yt-emoji-picker-renderer').forEach(removeElement);
    document.querySelectorAll('*').forEach((element) => {
      if (!(element instanceof HTMLElement) || !element.isConnected) return;
      if (element.matches(persistentChatControlSelector) || element.closest(persistentChatControlSelector)) return;
      const identity = [
        element.localName,
        element.id,
        typeof element.className === 'string' ? element.className : ''
      ].join(' ');
      const text = (element.textContent || '').trim();
      const isFloatingReaction = /^(❤️|💙|😂|😁|🎉|😮|💯)+$/u.test(text);
      if (!/(emoji|reaction)/i.test(identity) && !isFloatingReaction) return;
      const style = getComputedStyle(element);
      if (!['absolute', 'fixed'].includes(style.position)) return;
      const rect = element.getBoundingClientRect();
      const isFloatingPanel = rect.width > 0 &&
        rect.height > 0 &&
        rect.right > window.innerWidth * 0.75 &&
        rect.bottom > window.innerHeight * 0.45;
      if (isFloatingPanel) removeElement(element);
    });
    return removedCount;
  }).catch(() => 0);
}

async function waitForExtensionToastToClear(chat, recorder) {
  const toast = chat.locator('.ytcq-toast').first();
  if (!await toast.isVisible({ timeout: 300 }).catch(() => false)) return;
  await recorder.hold(2_700);
  await toast.waitFor({ state: 'hidden', timeout: 1_500 }).catch(() => undefined);
  await recorder.hold(240);
}

async function prepareDemoEmojiPicker(chat) {
  await chat.locator('body').evaluate(() => {
    if (document.querySelector('style[data-ytcq-demo-emoji-guard]')) return;
    const style = document.createElement('style');
    style.dataset.ytcqDemoEmojiGuard = 'true';
    style.textContent = `
      yt-emoji-picker-renderer:not(.ytcq-demo-emoji-ready) {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.append(style);
  });
}

async function ensureDemoEmojiPickerVisible(chat, emojiButton) {
  const picker = chat.locator('yt-emoji-picker-renderer').first();
  if (await picker.isVisible({ timeout: 1_500 }).catch(() => false)) return;

  await emojiButton.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.click();
  }).catch(() => undefined);
  if (await picker.isVisible({ timeout: 1_500 }).catch(() => false)) return;

  await picker.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    let current = element;
    for (let depth = 0; current instanceof HTMLElement && depth < 4; depth += 1) {
      current.hidden = false;
      current.removeAttribute('hidden');
      current.style.opacity = '1';
      current.style.pointerEvents = 'auto';
      current.style.visibility = 'visible';
      if (current === element || getComputedStyle(current).display === 'none') {
        current.style.display = 'block';
      }
      current = current.parentElement;
    }
  });
  await picker.waitFor({ state: 'visible', timeout: 2_000 });
}

async function scrubDemoEmojiPicker(chat) {
  await chat.locator('body').evaluate(() => {
    const picker = document.querySelector('yt-emoji-picker-renderer');
    if (!(picker instanceof HTMLElement)) return;

    const removableSelector = [
      'yt-emoji-picker-category-renderer',
      'yt-emoji-picker-category-button-renderer',
      'yt-emoji-picker-category'
    ].join(',');

    const removeSection = (section) => {
      if (!(section instanceof HTMLElement)) return;
      if (section.querySelector('.ytcq-frequent-emoji-row')) return;
      section.remove();
    };

    picker.querySelectorAll(removableSelector).forEach((section) => {
      const text = section.textContent || '';
      const images = Array.from(section.querySelectorAll('img'));
      const imageText = images.map((image) => [
        image.alt,
        image.title,
        image.src
      ].join(' ')).join(' ');
      const hasCustomEmojiImages = images.some((image) => /yt3\.ggpht|googleusercontent|ytimg/i.test(image.src || ''));
      if (/lofi\s*girl/i.test(`${text} ${imageText}`) || hasCustomEmojiImages) removeSection(section);
    });

    picker.querySelectorAll([
      '[id*="title" i]',
      '[class*="title" i]',
      '[aria-label*="LOFI GIRL" i]',
      '[title*="LOFI GIRL" i]'
    ].join(',')).forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (!/lofi\s*girl/i.test(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`)) return;
      const section = element.closest(removableSelector);
      if (section) removeSection(section);
      else element.remove();
    });

    picker.querySelectorAll('img').forEach((image) => {
      if (!/yt3\.ggpht|googleusercontent|ytimg/i.test(image.src || '')) return;
      const section = image.closest(removableSelector);
      if (section) removeSection(section);
      else image.remove();
    });

    picker.classList.add('ytcq-demo-emoji-ready');
  });
}

async function typeIntoComposerHuman(chat, recorder, text, options = {}) {
  const input = getChatComposerInput(chat);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.click();
  const graphemes = splitDemoGraphemes(text);
  const pace = options.pace ?? 1.45;
  for (let index = 0; index < graphemes.length; index += 1) {
    const grapheme = graphemes[index];
    const keyDelayMs = getHumanKeyDelayMs(grapheme, index);
    await input.pressSequentially(grapheme, {
      delay: Math.max(4, Math.round(keyDelayMs * pace))
    });
    const recordedDelayMs = (keyDelayMs + getHumanTypingHoldMs(grapheme, index, graphemes)) * pace;
    await recorder.captureThenHoldStill(Math.max(32, Math.round(recordedDelayMs)));
  }
}

async function waitForComposerTextToChange(chat, originalText) {
  await poll(async () => {
    const text = await getComposerText(chat);
    return Boolean(text && text !== originalText);
  }, {
    label: 'composer draft to translate',
    timeout: 25_000
  });
}

function getChatComposerInput(chat) {
  return chat.locator([
    'yt-live-chat-message-input-renderer #input[contenteditable]',
    'yt-live-chat-message-input-renderer [contenteditable]',
    '#input[contenteditable]'
  ].join(',')).first();
}

async function getComposerText(chat) {
  return getChatComposerInput(chat).evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
    const getNodeText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (!(node instanceof Element)) return '';
      const tagName = node.tagName.toLowerCase();
      if (tagName === 'br') return '\n';
      if (tagName === 'img' || node.getAttribute('role') === 'img') {
        return node.getAttribute('alt') ||
          node.getAttribute('aria-label') ||
          node.getAttribute('title') ||
          node.textContent ||
          '';
      }
      return Array.from(node.childNodes).map(getNodeText).join('');
    };
    return Array.from(element.childNodes).map(getNodeText).join('');
  });
}

async function openMessageMenu(chat, messageKey = 'reply') {
  await closeNativeMenus(chat);
  const openedDemoMenu = await chat.locator('body').evaluate((body, key) => {
    void body;
    return Boolean(window.__ytcqDemoOpenMessageMenu?.(key));
  }, messageKey).catch(() => false);
  if (openedDemoMenu) {
    const markerSelector = '.ytcq-context-item[data-ytcq-action]';
    try {
      await poll(async () => Boolean(await findVisibleMenu(chat, markerSelector)), {
        label: 'demo message menu',
        timeout: 8_000
      });
    } catch (error) {
      const debug = await chat.locator('body').evaluate((body, key) => {
        void body;
        const message = document.querySelector(`.ytcq-demo-message[data-ytcq-demo-key="${CSS.escape(key)}"]`);
        const menu = document.querySelector('.ytcq-demo-menu-shell');
        return {
          contextItems: document.querySelectorAll('.ytcq-context-item[data-ytcq-action]').length,
          hasNativeMenuItem: Boolean(menu?.querySelector('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer')),
          menuHtml: menu?.outerHTML.slice(0, 1200) || '',
          menuVisible: menu instanceof HTMLElement ? getComputedStyle(menu).display !== 'none' : false,
          messageContextWired: message instanceof HTMLElement ? message.dataset.ytcqContextWired || '' : '',
          messageExists: Boolean(message),
          menuButtonContextWired: message instanceof HTMLElement ? message.querySelector('#menu')?.dataset.ytcqContextWired || '' : ''
        };
      }, messageKey).catch((debugError) => ({ debugError: String(debugError) }));
      throw new Error(`Timed out waiting for demo message menu. Debug: ${JSON.stringify(debug)}`, {
        cause: error
      });
    }
    const menu = await findVisibleMenu(chat, markerSelector);
    if (menu) {
      await ensureDemoNativeMenuRows(menu);
      const source = await getDemoMessageSource(chat, messageKey, { center: false });
      return {
        authorName: await cleanLocatorText(source.author).catch(() => ''),
        menu,
        message: source.message
      };
    }
  }

  const messages = chat.locator(normalChatMessageSelector).filter({
    has: chat.locator('#menu')
  });
  await messages.last().waitFor({ state: 'visible', timeout: 45_000 });
  const count = await messages.count();
  const firstCandidate = Math.max(0, count - 16);

  for (let index = count - 1; index >= firstCandidate; index -= 1) {
    const message = messages.nth(index);
    if (!await message.isVisible({ timeout: 500 }).catch(() => false)) continue;
    const authorName = await cleanLocatorText(message.locator('#author-name').first()).catch(() => '');
    if (!authorName) continue;
    await centerLocatorInViewport(message);
    await message.hover({ timeout: 2_000 }).catch(() => undefined);
    const menuTargets = [
      message.locator('#menu button').first(),
      message.locator('#menu yt-icon-button').first(),
      message.locator('#menu #button').first(),
      message.locator('#menu').first()
    ];

    for (const menuTarget of menuTargets) {
      if (!await hasUsableLocatorBox(menuTarget).catch(() => false)) continue;
      for (const activate of [
        () => menuTarget.click({ timeout: 1_500 }),
        () => menuTarget.click({ force: true, timeout: 1_500 }),
        () => menuTarget.press('Enter', { timeout: 1_000 })
      ]) {
        await activate().catch(() => undefined);
        const menu = await findVisibleMenu(chat, [
          'ytd-menu-service-item-renderer',
          'ytd-menu-navigation-item-renderer',
          '.ytcq-context-item[data-ytcq-action]'
        ].join(',')).catch(() => null);
        if (menu) return { authorName, menu, message };
        await closeNativeMenus(chat);
        await message.hover({ timeout: 1_000 }).catch(() => undefined);
      }
    }
  }

  throw new Error('Could not open a real YouTube message menu.');
}

async function openMessageMenuWithVisibleClick(page, chat, recorder, messageKey, options = {}) {
  await closeNativeMenus(chat);
  const source = await getDemoMessageSource(chat, messageKey, { center: false });
  await waitForDemoMessageWiring(chat, messageKey, ['ytcqContextWired']);
  await focusMessageArea(page, chat, recorder, {
    afterHoldMs: options.afterCameraHoldMs ?? 420,
    alignRight: true,
    durationMs: options.cameraDurationMs,
    screenXRatio: options.screenXRatio
  });
  await source.message.hover({ timeout: 2_000 }).catch(() => undefined);
  const menuButton = await getFirstVisibleLocator(source.message.locator('#menu button, #menu yt-icon-button, #menu #button'), 2_000);
  await clickWithCursor(
    page,
    menuButton,
    recorder,
    'message menu button',
    {
      afterClickHoldMs: 0,
      durationMs: 640,
      padding: 6
    }
  );
  return openMessageMenu(chat, messageKey);
}

async function ensureDemoNativeMenuRows(menu) {
  await menu.evaluate((element) => {
    const list = element.querySelector('#items');
    if (!(list instanceof HTMLElement)) return;
    const menuIcons = {
      Report: 'm4 2.999-.146.073A1.55 1.55 0 003 4.454v16.545a1 1 0 102 0v-6.491a7.26 7.26 0 016.248.115l.752.376a8.94 8.94 0 008 0l.145-.073c.524-.262.855-.797.855-1.382V4.458a1.21 1.21 0 00-1.752-1.083 7.26 7.26 0 01-6.496 0L12 2.999a8.94 8.94 0 00-8 0Zm7.105 1.79v-.002l.752.376A9.26 9.26 0 0019 5.641v7.62a6.95 6.95 0 01-6.105-.052l-.752-.376A9.261 9.261 0 005 12.355v-7.62a6.94 6.94 0 016.105.054Z',
      Block: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.82 0 3.5.61 4.84 1.64L5.64 16.84A7.96 7.96 0 0 1 4 12c0-4.42 3.58-8 8-8Zm0 16c-1.82 0-3.5-.61-4.84-1.64l11.2-11.2A7.96 7.96 0 0 1 20 12c0 4.42-3.58 8-8 8Z'
    };
    const makeNativeRow = (label) => {
      const nativeItem = document.createElement('div');
      const icon = document.createElement('span');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const text = document.createElement('span');
      nativeItem.className = 'ytcq-demo-native-menu-item';
      icon.className = 'ytcq-demo-native-menu-icon';
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('aria-hidden', 'true');
      path.setAttribute('d', menuIcons[label]);
      svg.append(path);
      icon.append(svg);
      text.textContent = label;
      nativeItem.append(icon, text);
      return nativeItem;
    };

    list.querySelectorAll('.ytcq-demo-native-menu-item').forEach((row) => row.remove());
    const markItem = list.querySelector('.ytcq-context-item[data-ytcq-action="mark-user"]');
    const splitItem = list.querySelector('.ytcq-context-item[data-ytcq-action="reply-actions"]');
    const reportRow = makeNativeRow('Report');
    const blockRow = makeNativeRow('Block');

    list.prepend(blockRow);
    list.prepend(reportRow);
    if (markItem) list.insertBefore(markItem, splitItem || null);
    if (splitItem) list.append(splitItem);
    element.style.height = 'auto';
    element.style.maxHeight = 'none';
  });
}

async function getDemoMessageSource(chat, messageKey, { center = true } = {}) {
  const message = chat.locator(`${demoChatMessageSelector}[data-ytcq-demo-key="${messageKey}"]`).first();
  await message.waitFor({ state: 'visible', timeout: 15_000 });
  const author = message.locator('#author-name').first();
  const avatar = message.locator('#author-photo').first();
  await author.waitFor({ state: 'visible', timeout: 5_000 });
  await avatar.waitFor({ state: 'visible', timeout: 5_000 });
  if (center) await centerLocatorInViewport(message);
  return {
    author,
    avatar,
    message,
    text: await cleanLocatorText(message.locator('#message').first()).catch(() => '')
  };
}

async function waitForDemoMessageWiring(chat, messageKey, markers) {
  await poll(async () => {
    return chat.locator('body').evaluate((body, [key, datasetMarkers]) => {
      void body;
      const message = document.querySelector(`.ytcq-demo-message[data-ytcq-demo-key="${CSS.escape(key)}"]`);
      if (!(message instanceof HTMLElement)) return false;
      return datasetMarkers.every((marker) => message.dataset[marker] === 'true');
    }, [messageKey, markers]);
  }, {
    label: `${messageKey} demo message wiring`,
    timeout: 10_000
  });
}

async function getFirstVisibleLocator(locator, timeout = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeout) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const box = await candidate.boundingBox().catch(() => null);
      if (box?.width && box.height && await candidate.isVisible().catch(() => false)) return candidate;
    }
    await delay(200);
  }
  throw new Error('Could not find a visible locator candidate.');
}

async function hasUsableLocatorBox(locator) {
  const box = await locator.boundingBox().catch(() => null);
  return Boolean(box?.width && box.height);
}

async function closeNativeMenus(chat) {
  await chat.locator('body').evaluate((body) => {
    void body;
    window.__ytcqDemoCloseMenus?.();
  }).catch(() => undefined);
  for (let index = 0; index < 3; index += 1) {
    await chat.locator('body').press('Escape').catch(() => undefined);
    const menu = await findVisibleNativeMenu(chat).catch(() => null);
    if (!menu) break;
    await menu.press('Escape').catch(() => undefined);
  }
  await chat.locator(menuPopupSelector).evaluateAll((menus) => {
    menus.forEach((menu) => menu.remove());
  }).catch(() => undefined);
}

async function closeFocusPromptIfPresent(chat) {
  const close = chat.locator('.ytcq-focus-card .ytcq-focus-close, .ytcq-focus-card [aria-label="Close"]').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click().catch(() => undefined);
  }
}

async function closeProfileCardIfPresent(chat) {
  const close = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-close').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click().catch(() => undefined);
  }
}

async function closeInboxPanelIfPresent(chat) {
  const close = chat.locator('.ytcq-inbox-card .ytcq-profile-card-close').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click().catch(() => undefined);
  }
}

async function closeGamesPanelIfPresent(chat) {
  const close = chat.locator('.ytcq-games-card .ytcq-profile-card-close').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click().catch(() => undefined);
  }
}

async function keepMenuWithinFrameViewport(menu) {
  await menu.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    const rect = element.getBoundingClientRect();
    const viewportPadding = 8;
    const nextTop = Math.max(
      viewportPadding,
      Math.min(rect.top, window.innerHeight - rect.height - viewportPadding)
    );
    const nextLeft = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - rect.width - viewportPadding)
    );
    element.style.position = 'fixed';
    element.style.inset = 'auto';
    element.style.top = `${nextTop}px`;
    element.style.left = `${nextLeft}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  });
}

async function findVisibleNativeMenu(chat) {
  const menus = chat.locator(menuPopupSelector);
  const count = await menus.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const menu = menus.nth(index);
    const box = await menu.boundingBox().catch(() => null);
    if (box?.width && box.height && await menu.isVisible().catch(() => false)) return menu;
  }
  return null;
}

async function findVisibleMenu(chat, markerSelector) {
  const menus = chat.locator(menuPopupSelector).filter({
    has: chat.locator(markerSelector)
  });
  const count = await menus.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const menu = menus.nth(index);
    const box = await menu.boundingBox().catch(() => null);
    if (box?.width && box.height && await menu.isVisible().catch(() => false)) return menu;
  }
  return null;
}

async function centerLocatorInViewport(locator) {
  await locator.evaluate((element) => {
    if (element instanceof HTMLElement) {
      const scrollContainers = [];
      let parent = element.parentElement;
      while (parent) {
        if (parent.scrollWidth > parent.clientWidth) {
          scrollContainers.push([parent, parent.scrollLeft]);
        }
        parent = parent.parentElement;
      }
      element.scrollIntoView({
        block: 'center',
        inline: 'nearest'
      });
      scrollContainers.forEach(([container, scrollLeft]) => {
        container.scrollLeft = scrollLeft;
      });
    }
  }).catch(() => undefined);
}

async function cleanLocatorText(locator) {
  const text = await locator.innerText({ timeout: 1_000 });
  return text.replace(/\s+/g, ' ').trim();
}

async function poll(callback, { label, timeout = 5_000, interval = 250 }) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt <= timeout) {
    try {
      if (await callback()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(interval);
  }
  throw new Error(`Timed out waiting for ${label}.${lastError ? ` Last error: ${String(lastError)}` : ''}`);
}

async function writeDemoDiagnostics(page) {
  const screenshotPath = path.join(diagnosticDir, 'walkthrough-demo-failure.png');
  const framesPath = path.join(diagnosticDir, 'walkthrough-demo-frames.json');
  const htmlPath = path.join(diagnosticDir, 'walkthrough-demo-page.html');

  await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => undefined);
  await writeFile(htmlPath, await page.content().catch(() => ''));

  const frames = [];
  for (const frame of page.frames()) {
    frames.push({
      bodyText: await frame.locator('body').innerText({ timeout: 1_000 }).catch(() => ''),
      title: await frame.title().catch(() => ''),
      url: frame.url()
    });
  }
  await writeFile(framesPath, `${JSON.stringify(frames, null, 2)}\n`);
  console.error(`Saved walkthrough demo diagnostics to: ${diagnosticDir}`);
}

async function dismissConsentIfPresent(page) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    for (const name of consentButtonNames) {
      const buttons = [
        page.getByRole('button', { name }).first(),
        page.locator('button').filter({ hasText: name }).first()
      ];

      for (const button of buttons) {
        if (!await button.isVisible({ timeout: 150 }).catch(() => false)) continue;
        await button.click({ timeout: 2_000 }).catch(() => undefined);
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        return;
      }
    }

    if (!await page.locator('ytd-consent-bump-v2-lightbox').first().isVisible({ timeout: 150 }).catch(() => false)) {
      return;
    }

    await page.waitForTimeout(300);
  }
}

async function prepareSignedInWorkingProfile() {
  console.log(`[walkthrough] Using signed-in Chrome source profile: ${sourceProfileDir}`);
  if (!existsSync(path.join(sourceProfileDir, 'Default', 'Cookies'))) {
    throw new Error([
      'Missing signed-in Chrome profile cookies for the walkthrough demo.',
      'Run `npm run test:youtube-login`, sign in to YouTube web, and install Chat Enhancer in that profile first.',
      `Pristine profile: ${sourceProfileDir}`
    ].join('\n'));
  }

  const extensionId = await getInstalledProfileExtensionId(sourceProfileDir);
  if (!extensionId) {
    throw new Error([
      'Chat Enhancer is not installed in the signed-in Chrome profile.',
      'Run `npm run test:youtube-login`, then make sure dist/extension-chrome is loaded in chrome://extensions for that profile.',
      `Pristine profile: ${sourceProfileDir}`
    ].join('\n'));
  }

  if (isSameOrNestedPath(sourceProfileDir, profileDir) || isSameOrNestedPath(profileDir, sourceProfileDir)) {
    throw new Error([
      `Signed-in source profile and walkthrough working profile overlap: ${sourceProfileDir} -> ${profileDir}`,
      'Use a separate YTCQ_CHROME_PROFILE or YTCQ_CHROME_WORKING_PROFILES value.'
    ].join('\n'));
  }

  await assertSourceProfileClosed(sourceProfileDir);
  await mkdir(chromeProfilesDir, { recursive: true });
  await removeProfilePath(profileDir);
  await cp(sourceProfileDir, profileDir, {
    recursive: true,
    filter: (source) => !isRootChromeRuntimePath(source, sourceProfileDir)
  });
  await removeChromeRuntimeFiles(profileDir);
  console.log(`[walkthrough] Using signed-in Chrome working profile: ${profileDir}`);
}

async function launchNormalChromeDemoContext({ initialUrl, userAgent }) {
  const remoteDebuggingPort = await getFreePort();
  const args = [
    `--user-data-dir=${profileDir}`,
    '--profile-directory=Default',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    '--no-first-run',
    '--mute-audio',
    `--force-device-scale-factor=${deviceScaleFactor}`,
    ...(headless ? [
      '--headless=new',
      `--window-size=${viewport.width},${viewport.height}`
    ] : []),
    ...(userAgent ? [`--user-agent=${userAgent}`] : []),
    initialUrl
  ];

  const browserProcess = spawn(await getChromeExecutable(), args, {
    stdio: 'ignore'
  });

  try {
    const browser = await connectToChrome(remoteDebuggingPort, browserProcess);
    const context = browser.contexts()[0];
    if (!context) throw new Error('Could not find the normal Chrome profile context.');

    return {
      browser,
      browserProcess,
      context,
      close: async () => {
        await Promise.race([
          closeNormalChrome(browser),
          delay(5_000)
        ]).catch(() => undefined);
        if (browserProcess.exitCode !== null) return;
        await Promise.race([
          waitForProcessExit(browserProcess),
          delay(5_000)
        ]);
        if (browserProcess.exitCode !== null) return;
        browserProcess.kill();
        await Promise.race([
          waitForProcessExit(browserProcess),
          delay(5_000)
        ]);
      }
    };
  } catch (error) {
    browserProcess.kill();
    throw error;
  }
}

async function getInstalledProfileExtensionId(profileDirectory) {
  const preferencesPaths = [
    path.join(profileDirectory, 'Default', 'Preferences'),
    path.join(profileDirectory, 'Default', 'Secure Preferences')
  ];

  for (const preferencesPath of preferencesPaths) {
    const preferences = await readJsonFile(preferencesPath).catch(() => null);
    const settings = preferences?.extensions?.settings;
    if (!settings) continue;

    for (const [extensionId, extensionSettings] of Object.entries(settings)) {
      if (isChatEnhancerExtensionSettings(extensionSettings)) return extensionId;
    }
  }

  return null;
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function isChatEnhancerExtensionSettings(settings) {
  if (settings.state !== undefined && settings.state !== 1) return false;

  const installedPath = settings.path ? path.resolve(settings.path) : '';
  if (installedPath && installedPath === path.resolve(extensionDir)) return true;

  const manifest = settings.manifest;
  return manifest?.name === '__MSG_extensionName__' &&
    manifest.default_locale === 'en' &&
    manifest.action?.default_popup === 'popup.html' &&
    manifest.background?.service_worker === 'background.js' &&
    Boolean(manifest.content_scripts?.some((contentScript) => {
      return contentScript.matches?.some((matchPattern) => matchPattern.includes('youtube.com/live_chat'));
    }));
}

async function assertSourceProfileClosed(profileDirectory) {
  const activeFiles = await getExistingRootProfileFiles(profileDirectory, activeChromeProfileFileNames);
  if (activeFiles.length === 0) return;

  throw new Error([
    `The signed-in source Chrome profile appears to be open: ${profileDirectory}`,
    'Close the Chrome window opened by `npm run test:youtube-login`, then rerun the walkthrough capture.',
    `Open-profile marker files: ${activeFiles.join(', ')}`
  ].join('\n'));
}

async function removeChromeRuntimeFiles(profileDirectory) {
  const runtimeFiles = await getExistingRootProfileFiles(profileDirectory, runtimeChromeProfileFileNames);
  await Promise.all(runtimeFiles.map((fileName) => {
    return removeProfilePath(path.join(profileDirectory, fileName));
  }));
}

async function getExistingRootProfileFiles(profileDirectory, fileNames) {
  const existingFiles = [];
  for (const fileName of fileNames) {
    const filePath = path.join(profileDirectory, fileName);
    const pathExists = await lstat(filePath).then(() => true, () => false);
    if (pathExists) existingFiles.push(fileName);
  }
  return existingFiles;
}

function isRootChromeRuntimePath(filePath, profileDirectory) {
  const relativePath = path.relative(profileDirectory, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return false;
  if (relativePath.includes(path.sep)) return false;
  return runtimeChromeProfileFileNames.has(relativePath);
}

function isSameOrNestedPath(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return !relativePath || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function removeProfilePath(profilePath) {
  await rm(profilePath, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 250
  });
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local remote debugging port for Chrome.');
  }

  return address.port;
}

async function connectToChrome(remoteDebuggingPort, browserProcess) {
  const endpoint = `http://127.0.0.1:${remoteDebuggingPort}`;
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 15_000) {
    if (browserProcess.exitCode !== null) {
      throw new Error([
        `Chrome exited before opening DevTools at ${endpoint}.`,
        `The Chrome profile may already be open: ${profileDir}`,
        'Close that Chrome window before rerunning the walkthrough capture.'
      ].join('\n'));
    }

    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  throw new Error(`Could not connect to Chrome DevTools at ${endpoint}: ${String(lastError)}`);
}

async function closeNormalChrome(browser) {
  const session = await browser.newBrowserCDPSession();
  await session.send('Browser.close').catch(async () => {
    await browser.close().catch(() => undefined);
  });
  await session.detach().catch(() => undefined);
}

function waitForProcessExit(browserProcess) {
  if (browserProcess.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    browserProcess.once('exit', () => resolve());
  });
}

async function getChromeExecutable() {
  if (process.env.YTCQ_CHROME_EXE) return process.env.YTCQ_CHROME_EXE;

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(process.env.HOME || '', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
    ];
    for (const candidate of candidates) {
      if (await fileExists(candidate)) return candidate;
    }
  }

  if (process.platform === 'win32') return 'chrome';
  return 'google-chrome';
}

async function fileExists(filePath) {
  return access(filePath).then(() => true, () => false);
}

async function setDemoViewport(page, size) {
  await page.setViewportSize(size);
  const session = await page.context().newCDPSession(page);
  await applyCaptureMetrics(session, size);
  await session.detach().catch(() => undefined);
}

async function installWatchPageBranding(page) {
  const logoSrc = await readFileDataUrl(logoPath, 'image/svg+xml');
  const avatarLogoSrc = await readFileDataUrl(avatarLogoPath, 'image/png');
  const docsFontFaceCss = await getDemoDocsFontFaceCss();
  await page.addStyleTag({
    content: `
      ${docsFontFaceCss}

      html,
      body {
        --ytcq-demo-chat-column-width: 430px;
        overflow-x: clip !important;
      }

      ytd-watch-flexy,
      ytd-watch-flexy[flexy] {
        --ytd-watch-flexy-sidebar-min-width: var(--ytcq-demo-chat-column-width) !important;
        --ytd-watch-flexy-sidebar-width: var(--ytcq-demo-chat-column-width) !important;
      }

      ytd-watch-flexy[flexy] #columns.ytd-watch-flexy {
        column-gap: 20px !important;
        gap: 20px !important;
      }

      ytd-watch-flexy[flexy] #primary.ytd-watch-flexy {
        flex: 1 1 auto !important;
        max-width: calc(100% - var(--ytcq-demo-chat-column-width) - 20px) !important;
        min-width: 0 !important;
      }

      ytd-watch-flexy[flexy] #secondary.ytd-watch-flexy {
        flex: 0 0 var(--ytcq-demo-chat-column-width) !important;
        max-width: var(--ytcq-demo-chat-column-width) !important;
        min-width: var(--ytcq-demo-chat-column-width) !important;
        width: var(--ytcq-demo-chat-column-width) !important;
      }

      ytd-watch-flexy[flexy] #secondary-inner.ytd-watch-flexy,
      ytd-watch-flexy[flexy] #chat-container.ytd-watch-flexy,
      ytd-watch-flexy[flexy] ytd-live-chat-frame#chat,
      ytd-watch-flexy[flexy] iframe#chatframe {
        flex: 0 0 auto !important;
        max-width: none !important;
        min-width: 0 !important;
        width: 100% !important;
      }

      .ytcq-demo-video-cover {
        align-items: center;
        background: #fff;
        border-radius: inherit;
        box-sizing: border-box;
        color: #17191f;
        display: flex;
        flex-direction: column;
        font-family: "Inter", sans-serif;
        font-kerning: normal;
        font-synthesis-weight: none;
        inset: 0;
        justify-content: center;
        letter-spacing: 0;
        overflow: hidden;
        padding: 48px;
        pointer-events: none;
        position: absolute;
        text-align: center;
        text-rendering: optimizeLegibility;
        z-index: 2000;
      }

      #movie_player.ytcq-demo-cover-active video,
      #movie_player.ytcq-demo-cover-active .html5-video-container,
      #movie_player.ytcq-demo-cover-active .ytp-cued-thumbnail-overlay,
      #movie_player.ytcq-demo-cover-active .ytp-iv-video-content,
      #movie_player.ytcq-demo-cover-active .ytp-ce-element,
      #movie_player.ytcq-demo-cover-active .ytp-pause-overlay {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      .ytcq-demo-video-cover img {
        height: 88px;
        margin-bottom: 24px;
        object-fit: contain;
        width: 88px;
      }

      .ytcq-demo-video-cover strong {
        font-family: "Inter Display", "Inter", sans-serif;
        font-size: 42px;
        font-weight: 750;
        letter-spacing: -1px;
        line-height: 0.98;
      }

      .ytcq-demo-video-cover span {
        color: #626b7a;
        font-size: 18px;
        letter-spacing: 0;
        line-height: 1.55;
        margin-top: 12px;
      }

      img.ytcq-demo-logo-avatar {
        background: #fe0031 !important;
        object-fit: cover !important;
        object-position: center !important;
        transform: scale(1.08);
      }

      #player-ads,
      #masthead-ad,
      #panels-full-bleed-container,
      ytd-ad-slot-renderer,
      ytd-companion-slot-renderer,
      ytd-display-ad-renderer,
      ytd-engagement-panel-section-list-renderer[target-id*="ads" i],
      ytd-promoted-sparkles-web-renderer,
      ytd-promoted-video-renderer,
      ytd-merch-shelf-renderer,
      ytd-product-shelf-renderer,
      ytd-shopping-shelf-renderer,
      ytd-horizontal-card-list-renderer,
      ytd-metadata-row-container-renderer,
      ytd-feed-filter-chip-bar-renderer,
      ytd-watch-next-secondary-results-renderer,
      ytd-compact-video-renderer,
      ytd-compact-playlist-renderer,
      ytd-compact-radio-renderer,
      #related {
        display: none !important;
      }

      ytd-watch-metadata animated-rolling-number,
      ytd-watch-metadata yt-animated-rolling-number,
      ytd-watch-metadata .ytAnimatedRollingNumberHost,
      ytd-watch-metadata .yt-spec-button-shape-next__button-text-content {
        animation: none !important;
        transition: none !important;
      }
    `
  });

  await page.evaluate(([brandLogoSrc, avatarBrandLogoSrc]) => {
    if (window.__ytcqDemoWatchBrandingInstalled) return;
    window.__ytcqDemoWatchBrandingInstalled = true;

    const videoTitle = 'Chat Enhancer Demo';
    const channelName = 'Chat Enhancer for YouTube';
    const streamDescription = 'A guided walkthrough of live chat translation, saved messages, quick replies, Focus mode, marked users, emojis, commands, and popup settings.';

    const setText = (selectors, value) => {
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((element) => {
          element.textContent = value;
        });
      }
    };

    const setImage = (selectors) => {
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((image) => {
          if (!(image instanceof HTMLImageElement)) return;
          image.src = avatarBrandLogoSrc;
          image.classList.add('ytcq-demo-logo-avatar');
          image.removeAttribute('srcset');
        });
      }
    };

    const installVideoCover = () => {
      const player = document.querySelector('#movie_player');
      if (!(player instanceof HTMLElement) || player.querySelector('.ytcq-demo-video-cover')) return;
      player.style.position = 'relative';

      const cover = document.createElement('div');
      const logo = document.createElement('img');
      const title = document.createElement('strong');
      const subtitle = document.createElement('span');
      cover.className = 'ytcq-demo-video-cover';
      player.classList.add('ytcq-demo-cover-active');
      logo.alt = '';
      logo.src = brandLogoSrc;
      title.textContent = videoTitle;
      subtitle.textContent = 'A guided look at YouTube live chat enhancements';
      cover.append(logo, title, subtitle);
      player.append(cover);
    };

    const stabilizeEngagementCounters = () => {
      document.querySelectorAll([
        'ytd-watch-metadata animated-rolling-number',
        'ytd-watch-metadata yt-animated-rolling-number',
        'ytd-watch-metadata .ytAnimatedRollingNumberHost'
      ].join(',')).forEach((counter) => {
        counter.textContent = '1.2K';
      });

      document.querySelectorAll('ytd-watch-metadata button[aria-label*="like" i]').forEach((button) => {
        const text = button.querySelector('.yt-spec-button-shape-next__button-text-content, #text');
        if (text instanceof HTMLElement && !text.textContent?.trim()) text.textContent = '1.2K';
      });
    };

    const applyBranding = () => {
      document.title = `${videoTitle} - YouTube`;
      setText([
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1.title yt-formatted-string',
        '#title h1 yt-formatted-string',
        '#title h1',
        'ytd-watch-metadata h1'
      ], videoTitle);
      setText([
        'ytd-video-owner-renderer ytd-channel-name #text a',
        'ytd-video-owner-renderer ytd-channel-name #text',
        '#owner #channel-name #text a',
        '#owner #channel-name #text'
      ], channelName);
      setText([
        'ytd-watch-info-text',
        'ytd-watch-metadata #info-strings',
        'ytd-watch-metadata #info'
      ], '1.2K watching now • Started streaming 8 hours ago');
      const descriptionElement = document.querySelector('ytd-watch-metadata #description-inline-expander');
      if (descriptionElement instanceof HTMLElement && !descriptionElement.dataset.ytcqDemoDescriptionSet) {
        descriptionElement.dataset.ytcqDemoDescriptionSet = 'true';
        descriptionElement.textContent = streamDescription;
      }
      setImage([
        'button#avatar-btn img',
        '#avatar-btn img',
        'ytd-topbar-menu-button-renderer img',
        'ytd-video-owner-renderer #avatar img',
        '#owner #avatar img'
      ]);
      stabilizeEngagementCounters();
      installVideoCover();
    };

    let scheduled = false;
    const scheduleBranding = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        applyBranding();
      }, 100);
    };

    new MutationObserver(scheduleBranding).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    applyBranding();
  }, [logoSrc, avatarLogoSrc]);
}

async function installLiveChatMask(chat) {
  await chat.locator('body').evaluate(() => {
    if (window.__ytcqDemoMaskInstalled) return;
    window.__ytcqDemoMaskInstalled = true;

    const authorMap = new Map();

    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const translateIconPath = 'M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17a15.7 15.7 0 01-2.86 4.63A15.07 15.07 0 017.22 7H5.2a17.2 17.2 0 002.77 5.03l-5.09 5.02L4.3 18.47l5.01-5.01 3.11 3.11.45-1.5ZM18.5 10h-2L12 22h2l1.13-3h4.74L21 22h2l-4.5-12Zm-2.62 7l1.62-4.33L19.12 17h-3.24Z';

    const hashString = (value) => {
      let hash = 0;
      for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
      }
      return Math.abs(hash);
    };

    const getMarkedUserColor = (identity) => {
      const seed = cleanText(identity.authorName) || cleanText(identity.channelId) || 'marked-user';
      return `hsl(${hashString(seed) % 360} 86% 58%)`;
    };

    const demoProfiles = [
      ['@LuciaLive', 'The host noticed the request right away.', 'The host noticed the request right away.'],
      ['@marco_vibes87', 'That close-up during the chorus was perfect.', 'That close-up during the chorus was perfect.'],
      ['@なおこ東京', '今の照明の切り替え、すごく自然だった。', 'That lighting change felt really natural.'],
      ['@CafeLuz', '@CamilaNube sí, fue justo después del solo.', '@CamilaNube yes, it was right after the solo.'],
      ['@brunoRJ', 'Essa entrada do convidado ficou boa demais.', 'That guest entrance was great.'],
      ['@하나서울', '방금 드럼 들어오는 부분 다시 보고 싶다.', 'I want to see the drums come in again.'],
      ['@SoleneChat', '@marco_vibes87 oui, le timing était parfait.', '@marco_vibes87 yes, the timing was perfect.'],
      ['@रविमुंबई', 'यह गाना लाइव में और भी अच्छा लग रहा है।', 'This song sounds even better live.'],
      ['@deniz.istanbul', 'Bu geçiş gerçekten çok temizdi.', 'That transition was really clean.'],
      ['@AminaParis', 'Le son de la voix est beaucoup plus clair maintenant.', 'The vocal sound is much clearer now.'],
      ['@samir_stream', 'La música bajó justo cuando empezó a hablar.', 'The music dropped right when they started speaking.'],
      ['@NoahReacts', 'That replay angle helped me catch the handoff.', 'That replay angle helped me catch the handoff.'],
      ['@CamilaNube', '¿Alguien vio la reacción del host?', 'Did anyone see the host reaction?'],
      ['@JunWatches', '@なおこ東京 I saw it too, that lighting cue was smooth.', '@なおこ東京 I saw it too, that lighting cue was smooth.'],
      ['@MikaAudio', 'The bass is sitting way better after that break.', 'The bass is sitting way better after that break.'],
      ['@teal_viewer', 'Can someone clip the guest entrance?', 'Can someone clip the guest entrance?'],
      ['@RosaMarea', 'El público reaccionó justo a tiempo.', 'The crowd reacted right on time.'],
      ['@kiwi_notes', '@MikaAudio the bass sounds warmer now.', '@MikaAudio the bass sounds warmer now.'],
      ['@そら東京', '次の曲もこのカメラで見たい。', 'I want to watch the next song with this camera too.'],
      ['@LinaBerlin', 'Der zweite Sänger ist viel lauter als vorher.', 'The second singer is much louder than before.'],
      ['@bintang_jakarta', 'Lampunya pas banget waktu chorus masuk.', 'The lights hit perfectly when the chorus started.'],
      ['@عمر_بيروت', 'الإيقاع صار أوضح بعد التعديل.', 'The rhythm became clearer after the adjustment.'],
      ['@MaeStream', '@teal_viewer I missed it too, hoping for another replay.', '@teal_viewer I missed it too, hoping for another replay.'],
      ['@ines_clips', 'Ese plano del escenario se ve increíble.', 'That stage shot looks incredible.'],
      ['@유나채팅', '코러스 때 채팅 속도가 엄청 빨라졌네.', 'Chat got really fast during the chorus.'],
      ['@小林看直播', '这个镜头切得太准了。', 'That camera cut was perfectly timed.']
    ].map(([handle, message, translation]) => ({
      handle,
      color: getMarkedUserColor({ authorName: handle }),
      message,
      translation
    }));
    const backgroundProfiles = [
      '@RiverNotes',
      '@NovaReplay',
      '@EchoDesk',
      '@밤하늘',
      '@SoraMix',
      '@Luz_Claro',
      '@mint.frame',
      '@月光メモ'
    ].map((handle, index) => ({
      color: getMarkedUserColor({ authorName: handle }),
      handle,
      message: demoProfiles[index % demoProfiles.length].message,
      translation: demoProfiles[index % demoProfiles.length].translation
    }));
    const demoMessages = [
      {
        key: 'translate-1',
        handle: '@なおこ東京',
        message: '今の照明の切り替え、すごく自然だった。',
        translation: 'That lighting change felt really natural.',
        timestamp: '3:08'
      },
      {
        key: 'translate-2',
        handle: '@brunoRJ',
        message: 'Essa entrada do convidado ficou boa demais.',
        translation: 'That guest entrance was great.',
        timestamp: '3:10'
      },
      {
        key: 'reply',
        handle: '@marco_vibes87',
        message: 'That close-up during the chorus was perfect.',
        translation: 'That close-up during the chorus was perfect.',
        timestamp: '3:12'
      },
      {
        key: 'recent-1',
        handle: '@CamilaNube',
        message: '¿Alguien vio la reacción del host?',
        translation: 'Did anyone see the host reaction?',
        timestamp: '3:13'
      },
      {
        key: 'recent-2',
        handle: '@CamilaNube',
        message: '@CafeLuz sí, fue justo después del solo.',
        translation: '@CafeLuz yes, it was right after the solo.',
        timestamp: '3:14'
      },
      {
        key: 'focus-1',
        handle: '@teal_viewer',
        message: 'Can someone clip the guest entrance?',
        translation: 'Can someone clip the guest entrance?',
        timestamp: '3:15'
      },
      {
        key: 'focus-2',
        handle: '@MaeStream',
        message: '@teal_viewer I missed it too, hoping for another replay.',
        translation: '@teal_viewer I missed it too, hoping for another replay.',
        timestamp: '3:16'
      },
      {
        key: 'focus-3',
        handle: '@teal_viewer',
        message: 'Found it near the start of the bridge.',
        translation: 'Found it near the start of the bridge.',
        timestamp: '3:17'
      },
      {
        key: 'inbox',
        handle: '@LuciaLive',
        message: 'Please save this encore moment for later.',
        translation: 'Please save this encore moment for later.',
        timestamp: '3:18'
      },
      {
        key: 'mark',
        handle: '@小林看直播',
        message: '这个镜头切得太准了。',
        translation: 'That camera cut was perfectly timed.',
        timestamp: '3:19'
      },
      {
        key: 'after-mark-1',
        handle: '@RosaMarea',
        message: 'El público reaccionó justo a tiempo.',
        translation: 'The crowd reacted right on time.',
        timestamp: '3:20'
      },
      {
        key: 'after-mark-2',
        handle: '@kiwi_notes',
        message: '@MikaAudio the bass sounds warmer now.',
        translation: '@MikaAudio the bass sounds warmer now.',
        timestamp: '3:21'
      },
      {
        key: 'after-mark-3',
        handle: '@そら東京',
        message: '次の曲もこのカメラで見たい。',
        translation: 'I want to watch the next song with this camera too.',
        timestamp: '3:22'
      },
      {
        key: 'after-mark-4',
        handle: '@LinaBerlin',
        message: 'Der zweite Sänger ist viel lauter als vorher.',
        translation: 'The second singer is much louder than before.',
        timestamp: '3:23'
      },
      {
        key: 'tail',
        handle: '@MikaAudio',
        message: 'The bass is sitting way better after that break.',
        translation: 'The bass is sitting way better after that break.',
        timestamp: '3:20'
      }
    ];

    const installFixtureStyles = () => {
      if (document.querySelector('style[data-ytcq-demo-fixture]')) return;
      const style = document.createElement('style');
      style.dataset.ytcqDemoFixture = 'true';
      style.textContent = `
        yt-live-chat-banner-renderer,
        yt-live-chat-banner-manager,
        yt-live-chat-ticker-renderer,
        yt-live-chat-viewer-engagement-message-renderer,
        yt-live-chat-paid-message-renderer,
        yt-live-chat-membership-item-renderer,
        yt-live-chat-paid-sticker-renderer,
        yt-live-chat-renderer #action-panel,
        yt-live-chat-renderer #banner,
        yt-live-chat-renderer #ticker,
        yt-live-chat-item-list-renderer #show-more,
        yt-live-chat-item-list-renderer #new-messages-button,
        yt-live-chat-item-list-renderer tp-yt-paper-button,
        yt-live-chat-item-list-renderer #items {
          display: none !important;
        }

        #input,
        #input[contenteditable],
        yt-live-chat-text-input-field-renderer,
        yt-live-chat-text-input-field-renderer * {
          caret-color: currentColor !important;
        }

        tp-yt-paper-tooltip,
        paper-tooltip,
        yt-tooltip-renderer {
          display: none !important;
        }

        yt-live-chat-item-list-renderer #item-scroller {
          overflow: hidden !important;
          position: relative !important;
          scroll-behavior: auto !important;
        }

        .ytcq-demo-message-stage {
          box-sizing: border-box !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: flex-start !important;
          left: 0 !important;
          min-height: 100% !important;
          padding: 4px 0 4px 0 !important;
          position: absolute !important;
          right: 0 !important;
          top: 0 !important;
          transform: translateY(0) !important;
          z-index: 1 !important;
          will-change: transform !important;
        }

        .ytcq-demo-message {
          --ytcq-lite-row-background: transparent;
          align-items: start !important;
          background: var(--ytcq-lite-row-background) !important;
          box-sizing: border-box !important;
          column-gap: 16px !important;
          color: var(--yt-live-chat-primary-text-color, var(--yt-spec-text-primary, #0f0f0f)) !important;
          display: grid !important;
          font-family: Roboto, "YouTube Sans", Arial, sans-serif !important;
          font-size: 13px !important;
          grid-template-columns: 24px minmax(0, 1fr) !important;
          line-height: 1.35 !important;
          margin: 0 !important;
          min-height: 0 !important;
          padding: 4px 24px !important;
          position: relative !important;
          width: 100% !important;
        }

        .ytcq-demo-message:hover,
        .ytcq-demo-message:focus-within {
          background: color-mix(in srgb, var(--ytcq-lite-row-background), currentColor 6%) !important;
        }

        .ytcq-demo-message #author-photo {
          align-items: center !important;
          border-radius: 50% !important;
          display: flex !important;
          height: 24px !important;
          justify-content: center !important;
          margin: 0 !important;
          max-height: 24px !important;
          max-width: 24px !important;
          min-height: 24px !important;
          min-width: 24px !important;
          overflow: hidden !important;
          width: 24px !important;
        }

        .ytcq-demo-message #author-photo img {
          border-radius: 50% !important;
          display: block !important;
          height: 24px !important;
          width: 24px !important;
        }

        .ytcq-demo-message .ytcq-demo-message-content {
          align-self: center !important;
          line-height: 16px !important;
          margin: 0 !important;
          min-width: 0 !important;
          overflow-wrap: anywhere !important;
          padding: 0 !important;
        }

        .ytcq-demo-message .ytcq-demo-message-meta {
          display: inline !important;
          margin: 0 !important;
          min-width: 0 !important;
        }

        .ytcq-demo-message .ytcq-demo-author-chip {
          align-items: center !important;
          display: inline-flex !important;
          margin: 0 4px 0 0 !important;
          vertical-align: bottom !important;
        }

        .ytcq-demo-message #timestamp {
          color: var(--yt-live-chat-secondary-text-color, var(--yt-spec-text-secondary, #606060)) !important;
          display: none !important;
          font-size: 11px !important;
          line-height: 16px !important;
          margin-right: 8px !important;
          white-space: nowrap !important;
        }

        .ytcq-demo-message #author-name {
          color: var(--yt-live-chat-secondary-text-color, var(--yt-spec-text-secondary, #606060)) !important;
          cursor: pointer !important;
          display: inline-block !important;
          font: inherit !important;
          font-weight: 500 !important;
          margin: 0 !important;
          min-width: 0 !important;
          padding: 0 !important;
          vertical-align: bottom !important;
          white-space: nowrap !important;
        }

        .ytcq-demo-message .ytcq-demo-message-container {
          display: inline !important;
        }

        .ytcq-demo-message #message {
          color: var(--yt-live-chat-primary-text-color, var(--yt-spec-text-primary, #0f0f0f)) !important;
          overflow-wrap: anywhere !important;
          white-space: pre-wrap !important;
        }

        .ytcq-demo-message #menu {
          align-items: center !important;
          display: flex !important;
          height: 28px !important;
          justify-content: center !important;
          opacity: 0 !important;
          position: absolute !important;
          right: 8px !important;
          top: 2px !important;
          width: 28px !important;
        }

        .ytcq-demo-message:hover #menu,
        .ytcq-demo-message:focus-within #menu {
          opacity: 1 !important;
        }

        .ytcq-demo-message #menu button {
          align-items: center !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 50% !important;
          color: currentColor !important;
          cursor: pointer !important;
          display: flex !important;
          height: 28px !important;
          justify-content: center !important;
          padding: 0 !important;
          width: 28px !important;
        }

        .ytcq-inbox-card .ytcq-demo-inbox-avatar-fallback {
          align-items: center !important;
          background: ${getMarkedUserColor({ authorName: '@LuciaLive' })} !important;
          color: #fff !important;
          display: inline-flex !important;
          font-family: Roboto, "YouTube Sans", Arial, sans-serif !important;
          font-size: 11px !important;
          font-weight: 400 !important;
          justify-content: center !important;
          line-height: 1 !important;
          text-align: center !important;
        }

        .ytcq-inbox-card .ytcq-demo-inbox-avatar-letter {
          display: block !important;
          line-height: 1 !important;
          transform: translate(0.5px, 0.75px) !important;
        }

        .ytcq-demo-menu-shell {
          background: #fff !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24) !important;
          box-sizing: border-box !important;
          color: #0f0f0f !important;
          display: block !important;
          min-width: 164px !important;
          overflow: hidden !important;
          pointer-events: auto !important;
          position: fixed !important;
          z-index: 2147483000 !important;
        }

        .ytcq-demo-menu-shell .ytcq-context-item .ytcq-paper-item,
        .ytcq-demo-menu-shell .ytcq-context-split-button,
        .ytcq-demo-menu-shell .ytcq-menu-icon,
        .ytcq-demo-menu-shell .ytcq-menu-label {
          color: #0f0f0f !important;
        }

        .ytcq-demo-menu-shell #items {
          display: block !important;
        }

        .ytcq-demo-native-sentinel {
          display: none !important;
        }

        .ytcq-demo-native-menu-item {
          align-items: center !important;
          box-sizing: border-box !important;
          color: #0f0f0f !important;
          display: flex !important;
          font-family: Roboto, "YouTube Sans", Arial, sans-serif !important;
          font-size: 14px !important;
          gap: 16px !important;
          min-height: 40px !important;
          padding: 0 16px !important;
          white-space: nowrap !important;
        }

        .ytcq-demo-native-menu-item::before {
          content: "" !important;
          display: none !important;
          flex: 0 0 24px !important;
          height: 24px !important;
          opacity: 0.72 !important;
          width: 24px !important;
        }

        .ytcq-demo-native-menu-icon {
          align-items: center !important;
          color: #0f0f0f !important;
          display: flex !important;
          flex: 0 0 24px !important;
          height: 24px !important;
          justify-content: center !important;
          width: 24px !important;
        }

        .ytcq-demo-native-menu-icon svg {
          display: block !important;
          fill: currentColor !important;
          height: 24px !important;
          width: 24px !important;
        }
      `;
      document.head.append(style);
    };

    const getProfile = (rawValue, index = 0) => {
      const key = String(rawValue || '').trim();
      const existing = demoProfiles.find((profile) => profile.handle === key);
      if (existing) return existing;
      if (!authorMap.has(key)) authorMap.set(key, authorMap.size % backgroundProfiles.length);
      return backgroundProfiles[authorMap.get(key) ?? index % backgroundProfiles.length];
    };

    const getAvatarSrc = (profile) => {
      const normalized = profile.handle.replace(/^@/, '');
      const initial = (normalized.match(/\p{L}|\p{N}/u)?.[0] || normalized.slice(0, 1) || 'C').toUpperCase();
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
        `<rect width="64" height="64" rx="32" fill="${profile.color}"/>`,
        `<text x="32" y="32" text-anchor="middle" dy=".35em" fill="white" font-family="Roboto, Arial, sans-serif" font-size="30" font-weight="400">${initial.replace(/[&<>"']/g, '')}</text>`,
        '</svg>'
      ].join('');
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };

    const createTextRenderer = (value) => ({
      runs: [{ text: value }],
      simpleText: value
    });

    const createDemoMessage = (entry, index) => {
      const profile = getProfile(entry.handle, index);
      const message = document.createElement('yt-live-chat-text-message-renderer');
      const timestampUsec = String((Date.now() + index) * 1000);
      const avatarSrc = getAvatarSrc(profile);
      message.className = 'style-scope yt-live-chat-item-list-renderer ytcq-demo-message';
      message.dataset.ytcqDemoKey = entry.key;
      message.dataset.ytcqDemoAuthor = profile.handle;
      message.id = `ytcq-demo-message-${entry.key}`;
      message.data = {
        id: `ytcq-demo-message-${entry.key}`,
        authorExternalChannelId: `UCYtcqDemo${index}`,
        authorChannelId: `UCYtcqDemo${index}`,
        authorPhoto: {
          thumbnails: [
            {
              height: 64,
              url: avatarSrc,
              width: 64
            }
          ]
        },
        authorName: createTextRenderer(profile.handle),
        message: createTextRenderer(entry.message || profile.message),
        timestampUsec
      };

      const avatar = document.createElement('div');
      const image = document.createElement('img');
      avatar.id = 'author-photo';
      image.id = 'img';
      image.alt = '';
      image.src = avatarSrc;
      avatar.append(image);

      const content = document.createElement('div');
      const meta = document.createElement('div');
      const timestamp = document.createElement('span');
      const authorChip = document.createElement('span');
      const author = document.createElement('span');
      const messageContainer = document.createElement('span');
      const body = document.createElement('span');
      content.className = 'ytcq-demo-message-content';
      content.id = 'content';
      meta.className = 'ytcq-demo-message-meta';
      timestamp.id = 'timestamp';
      timestamp.textContent = entry.timestamp || '';
      authorChip.className = 'ytcq-demo-author-chip';
      author.id = 'author-name';
      author.textContent = profile.handle;
      messageContainer.className = 'ytcq-demo-message-container';
      messageContainer.id = 'message-container';
      body.id = 'message';
      body.dir = 'auto';
      body.textContent = entry.message || profile.message;
      authorChip.append(author);
      meta.append(timestamp, authorChip);
      messageContainer.append(body);
      content.append(meta, messageContainer);

      const menu = document.createElement('div');
      const button = document.createElement('button');
      menu.id = 'menu';
      button.type = 'button';
      button.setAttribute('aria-label', 'Actions');
      button.textContent = '⋮';
      menu.append(button);
      message.append(avatar, content, menu);
      return message;
    };

    const removeDemoMenus = () => {
      document.querySelectorAll('.ytcq-demo-menu-shell').forEach((menu) => menu.remove());
    };

    const openDemoMessageMenu = (messageKey = 'reply') => {
      installFixtureStyles();
      const message = document.querySelector(`.ytcq-demo-message[data-ytcq-demo-key="${CSS.escape(messageKey)}"]`);
      if (!(message instanceof HTMLElement)) return false;
      const menuButton = message.querySelector('#menu button, #menu');
      if (!(menuButton instanceof HTMLElement)) return false;

      menuButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        composed: true
      }));
      menuButton.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0,
        composed: true
      }));
      message.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        composed: true
      }));
      message.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0,
        composed: true
      }));

      removeDemoMenus();
      const buttonRect = menuButton.getBoundingClientRect();
      const shell = document.createElement('ytd-menu-popup-renderer');
      shell.className = 'style-scope ytd-popup-container ytcq-demo-menu-shell';
      shell.style.right = `${Math.max(8, window.innerWidth - buttonRect.right - 4)}px`;
      shell.style.top = `${Math.max(8, Math.min(window.innerHeight - 160, buttonRect.bottom + 4))}px`;

      const appendNativeRows = (list) => {
        if (!list.querySelector('.ytcq-demo-native-sentinel')) {
          const sentinel = document.createElement('ytd-menu-service-item-renderer');
          sentinel.className = 'style-scope ytd-menu-popup-renderer ytcq-demo-native-sentinel';
          list.append(sentinel);
        }
        if (list.querySelector('.ytcq-demo-native-menu-item')) return;
        const menuIcons = {
          Report: 'm4 2.999-.146.073A1.55 1.55 0 003 4.454v16.545a1 1 0 102 0v-6.491a7.26 7.26 0 016.248.115l.752.376a8.94 8.94 0 008 0l.145-.073c.524-.262.855-.797.855-1.382V4.458a1.21 1.21 0 00-1.752-1.083 7.26 7.26 0 01-6.496 0L12 2.999a8.94 8.94 0 00-8 0Zm7.105 1.79v-.002l.752.376A9.26 9.26 0 0019 5.641v7.62a6.95 6.95 0 01-6.105-.052l-.752-.376A9.261 9.261 0 005 12.355v-7.62a6.94 6.94 0 016.105.054Z',
          Block: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.82 0 3.5.61 4.84 1.64L5.64 16.84A7.96 7.96 0 0 1 4 12c0-4.42 3.58-8 8-8Zm0 16c-1.82 0-3.5-.61-4.84-1.64l11.2-11.2A7.96 7.96 0 0 1 20 12c0 4.42-3.58 8-8 8Z'
        };
        ['Report', 'Block'].forEach((label) => {
          const nativeItem = document.createElement('div');
          const icon = document.createElement('span');
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const text = document.createElement('span');
          nativeItem.className = 'ytcq-demo-native-menu-item';
          icon.className = 'ytcq-demo-native-menu-icon';
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('focusable', 'false');
          svg.setAttribute('aria-hidden', 'true');
          path.setAttribute('d', menuIcons[label]);
          svg.append(path);
          icon.append(svg);
          text.textContent = label;
          nativeItem.append(icon, text);
          list.append(nativeItem);
        });
      };
      const orderRows = (list) => {
        const markItem = list.querySelector('.ytcq-context-item[data-ytcq-action="mark-user"]');
        const splitItem = list.querySelector('.ytcq-context-item[data-ytcq-action="reply-actions"]');
        const nativeRows = Array.from(list.querySelectorAll('.ytcq-demo-native-menu-item'));
        nativeRows.reverse().forEach((row) => list.prepend(row));
        if (markItem) list.insertBefore(markItem, splitItem || null);
        if (splitItem) list.append(splitItem);
      };

      shell.style.opacity = '0';
      document.body.append(shell);
      window.setTimeout(() => {
        let list = shell.querySelector('#items');
        if (!(list instanceof HTMLElement)) {
          list = document.createElement('div');
          list.id = 'items';
          shell.append(list);
        }
        appendNativeRows(list);
        orderRows(list);
        shell.style.height = 'auto';
        shell.style.maxHeight = 'none';
        shell.style.opacity = '1';
      }, 80);
      return true;
    };

    const createDemoTranslationIcon = () => {
      const icon = document.createElement('span');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      icon.className = 'ytcq-replaced-translation-icon';
      icon.dataset.ytcqTranslationView = 'translated';
      icon.title = 'Original message';
      icon.setAttribute('aria-hidden', 'true');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('aria-hidden', 'true');
      path.setAttribute('d', translateIconPath);
      path.setAttribute('fill', 'currentColor');
      svg.append(path);
      icon.append(svg);
      return icon;
    };

    const getDemoTranslationText = (message, messageKey) => {
      const entry = demoMessages.find((candidate) => candidate.key === messageKey);
      if (entry?.translation) return entry.translation;
      const handle = message.dataset.ytcqDemoAuthor || message.querySelector('#author-name')?.textContent || '';
      return getProfile(handle).translation;
    };

    const restoreDemoReplacement = (message) => {
      const body = message.querySelector('#message');
      if (body instanceof HTMLElement && message.dataset.ytcqDemoOriginalText) {
        body.textContent = message.dataset.ytcqDemoOriginalText;
      }
      body?.classList.remove('ytcq-translation-replaced-text');
      body?.removeAttribute('lang');
      body?.removeAttribute('title');
      message.classList.remove('ytcq-translation-replaced');
      delete message.dataset.ytcqReplacedTranslation;
      delete message.dataset.ytcqTranslationView;
      delete message.dataset.ytcqDemoForcedTranslation;
    };

    const renderDemoInlineTranslation = (message, translationText, messageKey) => {
      restoreDemoReplacement(message);
      const content = message.querySelector('#content') || message.querySelector('.ytcq-demo-message-content') || message;
      if (!(content instanceof HTMLElement)) return false;
      message.querySelector(':scope .ytcq-translation')?.remove();
      const translation = document.createElement('div');
      const prefix = document.createElement('span');
      const body = document.createElement('span');
      translation.className = 'ytcq-translation';
      translation.lang = 'en';
      translation.title = 'Translated message';
      prefix.className = 'ytcq-translation-prefix';
      prefix.textContent = 'Translated:';
      body.textContent = translationText;
      translation.append(prefix, body);
      content.append(translation);
      message.dataset.ytcqDemoForcedTranslation = 'below';
      message.dataset.ytcqTranslationKey = `ytcq-demo:${messageKey}:en`;
      return true;
    };

    const renderDemoReplacementTranslation = (message, translationText, messageKey) => {
      const body = message.querySelector('#message');
      if (!(body instanceof HTMLElement)) return false;
      message.querySelector(':scope .ytcq-translation')?.remove();
      if (!message.dataset.ytcqDemoOriginalText) {
        message.dataset.ytcqDemoOriginalText = body.textContent || '';
      }
      body.replaceChildren(document.createTextNode(translationText), createDemoTranslationIcon());
      body.classList.add('ytcq-translation-replaced-text');
      body.lang = 'en';
      body.title = 'Translated message';
      message.classList.add('ytcq-translation-replaced');
      message.dataset.ytcqReplacedTranslation = 'true';
      message.dataset.ytcqTranslationView = 'translated';
      message.dataset.ytcqDemoForcedTranslation = 'replace';
      message.dataset.ytcqTranslationKey = `ytcq-demo:${messageKey}:en`;
      return true;
    };

    const renderDemoTranslation = (messageKey, display = 'below') => {
      const message = document.querySelector(`.ytcq-demo-message[data-ytcq-demo-key="${CSS.escape(messageKey)}"]`);
      if (!(message instanceof HTMLElement)) return false;
      const translationText = getDemoTranslationText(message, messageKey);
      return display === 'replace'
        ? renderDemoReplacementTranslation(message, translationText, messageKey)
        : renderDemoInlineTranslation(message, translationText, messageKey);
    };

    const installDemoMessages = () => {
      installFixtureStyles();
      const scroller = document.querySelector('yt-live-chat-item-list-renderer #item-scroller');
      if (!(scroller instanceof HTMLElement)) return false;
      let stage = scroller.querySelector('.ytcq-demo-message-stage');
      if (!(stage instanceof HTMLElement)) {
        stage = document.createElement('div');
        stage.className = 'ytcq-demo-message-stage';
        scroller.append(stage);
      }
      document.querySelectorAll('yt-live-chat-item-list-renderer #items .ytcq-demo-message').forEach((message) => {
        stage.append(message);
      });
      const existing = new Set(Array.from(stage.querySelectorAll('.ytcq-demo-message')).map((message) => message.dataset.ytcqDemoKey || ''));
      demoMessages.forEach((entry, index) => {
        if (existing.has(entry.key)) return;
        stage.append(createDemoMessage(entry, index));
      });
      stabilizeChatFeed();
      return true;
    };

    const getDemoMessageListBottom = (stage) => {
      const lastMessage = stage.querySelector('.ytcq-demo-message:last-child');
      return lastMessage instanceof HTMLElement
        ? lastMessage.offsetTop + lastMessage.offsetHeight + 4
        : stage.scrollHeight;
    };

    const setChatScrollTop = (nextScrollTop) => {
      const scroller = document.querySelector('yt-live-chat-item-list-renderer #item-scroller');
      const stage = document.querySelector('.ytcq-demo-message-stage');
      if (!(scroller instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;
      const lastMessageBottom = getDemoMessageListBottom(stage);
      const maxTop = Math.max(0, lastMessageBottom - scroller.clientHeight);
      const scrollTop = Math.max(0, Math.min(maxTop, nextScrollTop));
      stage.style.setProperty('min-height', `${Math.max(scroller.clientHeight, lastMessageBottom)}px`, 'important');
      stage.style.setProperty('transform', `translateY(${-scrollTop}px)`, 'important');
      scroller.scrollTop = 0;
      window.__ytcqDemoChatScrollTop = scrollTop;
    };

    const stabilizeChatFeed = () => {
      const scroller = document.querySelector('yt-live-chat-item-list-renderer #item-scroller');
      const stage = document.querySelector('.ytcq-demo-message-stage');
      if (!(scroller instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;
      const lastMessageBottom = getDemoMessageListBottom(stage);
      if (Date.now() < (window.__ytcqDemoManualScrollUntil || 0)) return;
      setChatScrollTop(Math.max(0, lastMessageBottom - scroller.clientHeight));
    };

    const maskImage = (image, profile) => {
      if (!(image instanceof HTMLImageElement)) return;
      const src = getAvatarSrc(profile);
      if (image.src === src) return;
      image.src = src;
      image.removeAttribute('srcset');
    };

    const setTranslationText = (translation, profile) => {
      if (!(translation instanceof HTMLElement)) return;
      translation.lang = 'en';
      translation.title = 'Translated message';
      const prefix = translation.querySelector('.ytcq-translation-prefix');
      if (prefix) prefix.textContent = 'Translated:';
      const body = Array.from(translation.querySelectorAll('span'))
        .find((span) => !span.classList.contains('ytcq-translation-prefix'));
      if (body) {
        body.textContent = profile.translation;
      } else if (!translation.querySelector('.ytcq-replaced-translation-icon')) {
        translation.textContent = `Translated: ${profile.translation}`;
      }
    };

    const maskComposerAvatar = () => {
      const createComposerLogo = () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const background = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.classList.add('ytcq-demo-composer-avatar-inline-logo');
        svg.setAttribute('viewBox', '0 0 64 64');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('aria-hidden', 'true');
        background.setAttribute('d', 'M32 0a32 32 0 1 1 0 64 32 32 0 0 1 0-64Z');
        background.setAttribute('fill', '#fe0031');
        glyph.setAttribute('transform', 'translate(-5 3) scale(1.22)');
        glyph.setAttribute('d', 'M40.2454 18.4114C42.1615 18.733 43.9292 19.6468 45.2991 21.0247C48.0348 24.1959 48.0348 32.2988 45.2991 35.47C44.8198 35.9902 44.2611 36.4312 43.6438 36.7766L43.3469 38.6233C43.2679 39.086 43.0748 39.5221 42.7844 39.8909C42.4941 40.2596 42.116 40.5503 41.6848 40.7356C41.2537 40.9208 40.7829 40.9945 40.3157 40.9514C39.8484 40.9083 39.399 40.7495 39.009 40.4885L36.0989 38.554C36.0327 38.5074 35.9532 38.4834 35.8723 38.4846C31.795 38.4671 28.3794 37.3344 26.759 35.47C26.5223 35.1881 26.3125 34.8846 26.1321 34.5637C31.272 34.4593 35.4537 32.9781 37.5969 30.4866C39.9145 27.8033 40.803 22.8197 40.2454 18.4114ZM25.5745 9.20728C30.3934 9.20728 34.3971 10.5092 36.2825 12.6907C39.444 16.3474 39.444 25.6864 36.2825 29.344C34.4294 31.4871 30.4922 32.785 25.7483 32.8157C25.5914 32.8135 25.437 32.8564 25.304 32.9397L21.8684 35.2297C21.4515 35.5083 20.9713 35.6778 20.4719 35.7229C19.9727 35.768 19.47 35.6878 19.01 35.4885C18.5501 35.2893 18.1477 34.9773 17.8391 34.5823C17.5305 34.1871 17.3254 33.7205 17.2434 33.2258L16.8586 30.9133C16.1097 30.5098 15.4366 29.9792 14.8684 29.3459C11.7051 25.6867 11.7049 16.3473 14.8665 12.6897C16.7518 10.5091 20.7556 9.20728 25.5745 9.20728ZM23.5793 17.595C23.0941 17.3548 22.5247 17.7078 22.5247 18.2493V24.9514C22.5247 25.4929 23.0941 25.8459 23.5793 25.6057L30.3508 22.2551C30.8924 21.987 30.8924 21.2137 30.3508 20.9456L23.5793 17.595Z');
        glyph.setAttribute('fill', '#fff');
        svg.append(background, glyph);
        return svg;
      };

      document.querySelectorAll([
        'yt-live-chat-message-input-renderer #author-photo',
        'yt-live-chat-message-input-renderer yt-img-shadow'
      ].join(',')).forEach((container) => {
        if (!(container instanceof HTMLElement)) return;
        container.style.backgroundColor = 'transparent';
        container.style.backgroundImage = 'none';
        container.style.backgroundPosition = 'center';
        container.style.backgroundSize = 'cover';
        container.style.borderRadius = '50%';
        container.style.display = 'inline-block';
        container.style.flex = '0 0 32px';
        container.style.height = '32px';
        container.style.marginRight = '8px';
        container.style.opacity = '1';
        container.style.overflow = 'hidden';
        container.style.position = 'relative';
        container.style.width = '32px';

        container.querySelectorAll('img').forEach((image) => {
          image.style.display = 'none';
        });
        if (!container.querySelector('.ytcq-demo-composer-avatar-inline-logo')) {
          container.append(createComposerLogo());
        }
        const logo = container.querySelector('.ytcq-demo-composer-avatar-inline-logo');
        if (logo instanceof SVGElement) {
          logo.style.display = 'block';
          logo.style.height = '32px';
          logo.style.inset = '0';
          logo.style.position = 'absolute';
          logo.style.width = '32px';
          logo.style.zIndex = '3';
        }
      });

      document.querySelectorAll([
        'yt-live-chat-message-input-renderer #author-photo img',
        'yt-live-chat-message-input-renderer yt-img-shadow img',
        'yt-live-chat-message-input-renderer img#img'
      ].join(',')).forEach((image) => {
        if (!(image instanceof HTMLImageElement)) return;
        image.removeAttribute('srcset');
        image.style.display = 'none';
      });
    };

    const removeBrandedEmojiSections = () => {
      document.querySelectorAll([
        'yt-emoji-picker-category-renderer',
        'yt-emoji-picker-category-button-renderer',
        'yt-emoji-picker-category'
      ].join(',')).forEach((section) => {
        const text = section.textContent || '';
        const images = Array.from(section.querySelectorAll('img'));
        const imageText = images.map((image) => [
          image.alt,
          image.title,
          image.src
        ].join(' ')).join(' ');
        const hasCustomEmojiImages = images.some((image) => /yt3\.ggpht|googleusercontent|ytimg/i.test(image.src || ''));
        if (/lofi\s*girl/i.test(`${text} ${imageText}`) || hasCustomEmojiImages) section.remove();
      });
    };

    const maskMessage = (message, index) => {
      if (!(message instanceof HTMLElement)) return;
      if (message.classList.contains('ytcq-demo-message')) return;
      const rawAuthor = message.querySelector('#author-name')?.textContent || message.dataset.ytcqDemoAuthor || '';
      const profile = getProfile(rawAuthor, index);
      message.dataset.ytcqDemoAuthor = profile.handle;
      const author = message.querySelector('#author-name');
      if (author) author.textContent = profile.handle;
      const body = message.querySelector('#message');
      if (body) body.textContent = profile.message;
      message.querySelectorAll('#author-photo img, yt-img-shadow img, img#img').forEach((image) => maskImage(image, profile));
      message.querySelectorAll('.ytcq-translation').forEach((translation) => setTranslationText(translation, profile));
    };

    const maskAll = () => {
      installDemoMessages();
      maskComposerAvatar();
      removeBrandedEmojiSections();
      Array.from(document.querySelectorAll([
        'yt-live-chat-text-message-renderer',
        'yt-live-chat-paid-message-renderer',
        'yt-live-chat-membership-item-renderer',
        'yt-live-chat-paid-sticker-renderer'
      ].join(','))).slice(-90).forEach(maskMessage);
      stabilizeChatFeed();
    };

    let scheduled = false;
    const scheduleMask = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        maskAll();
      }, 50);
    };

    new MutationObserver(scheduleMask).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') removeDemoMenus();
    }, true);
    window.__ytcqDemoOpenMessageMenu = openDemoMessageMenu;
    window.__ytcqDemoCloseMenus = removeDemoMenus;
    window.__ytcqDemoRenderTranslation = renderDemoTranslation;
    window.__ytcqDemoSetChatScrollTop = setChatScrollTop;
    window.__ytcqDemoStabilizeChat = stabilizeChatFeed;
    maskAll();
  });
}

async function installDemoPresentationLayer(page) {
  const docsFontFaceCss = await getDemoDocsFontFaceCss();
  await page.addStyleTag({
    content: `
      ${docsFontFaceCss}

      .ytcq-demo-caption,
      .ytcq-demo-focus {
        font-family: "Inter", sans-serif;
        font-kerning: normal;
        font-synthesis-weight: none;
        letter-spacing: 0;
        pointer-events: none;
        position: fixed;
        text-rendering: optimizeLegibility;
      }

      .ytcq-demo-caption {
        background: #fff;
        border: 1px solid #e2e6ee;
        border-radius: 8px;
        box-sizing: border-box;
        box-shadow: 0 18px 48px rgba(23, 25, 31, 0.14);
        color: #17191f;
        line-height: 1.55;
        left: 48px;
        max-width: 320px;
        opacity: 0;
        padding: 16px 18px;
        top: 150px;
        transform: translateY(10px);
        transition: opacity 180ms ease, transform 180ms ease;
        z-index: 2147483620;
      }

      @supports (corner-shape: superellipse(2)) {
        .ytcq-demo-caption {
          border-radius: 24px;
          corner-shape: superellipse(2);
        }
      }

      @supports ((corner-shape: squircle) and (not (corner-shape: superellipse(2)))) {
        .ytcq-demo-caption {
          border-radius: 24px;
          corner-shape: squircle;
        }
      }

      .ytcq-demo-caption.is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      .ytcq-demo-caption::before,
      .ytcq-demo-caption::after {
        content: "";
        display: none;
        height: 0;
        position: absolute;
        width: 0;
      }

      .ytcq-demo-caption[data-pointer="right"]::before,
      .ytcq-demo-caption[data-pointer="right"]::after,
      .ytcq-demo-caption[data-pointer="left"]::before,
      .ytcq-demo-caption[data-pointer="left"]::after {
        top: var(--ytcq-demo-pointer-offset, 50%);
        transform: translateY(-50%);
      }

      .ytcq-demo-caption[data-pointer="right"]::before {
        border-bottom: 9px solid transparent;
        border-left: 11px solid #e2e6ee;
        border-top: 9px solid transparent;
        display: block;
        right: -11px;
      }

      .ytcq-demo-caption[data-pointer="right"]::after {
        border-bottom: 8px solid transparent;
        border-left: 10px solid #fff;
        border-top: 8px solid transparent;
        display: block;
        right: -9px;
      }

      .ytcq-demo-caption[data-pointer="left"]::before {
        border-bottom: 9px solid transparent;
        border-right: 11px solid #e2e6ee;
        border-top: 9px solid transparent;
        display: block;
        left: -11px;
      }

      .ytcq-demo-caption[data-pointer="left"]::after {
        border-bottom: 8px solid transparent;
        border-right: 10px solid #fff;
        border-top: 8px solid transparent;
        display: block;
        left: -9px;
      }

      .ytcq-demo-caption[data-pointer="top"]::before,
      .ytcq-demo-caption[data-pointer="top"]::after,
      .ytcq-demo-caption[data-pointer="bottom"]::before,
      .ytcq-demo-caption[data-pointer="bottom"]::after {
        left: var(--ytcq-demo-pointer-offset, 50%);
        transform: translateX(-50%);
      }

      .ytcq-demo-caption[data-pointer="top"]::before {
        border-bottom: 11px solid #e2e6ee;
        border-left: 9px solid transparent;
        border-right: 9px solid transparent;
        display: block;
        top: -11px;
      }

      .ytcq-demo-caption[data-pointer="top"]::after {
        border-bottom: 10px solid #fff;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        display: block;
        top: -9px;
      }

      .ytcq-demo-caption[data-pointer="bottom"]::before {
        border-left: 9px solid transparent;
        border-right: 9px solid transparent;
        border-top: 11px solid #e2e6ee;
        bottom: -11px;
        display: block;
      }

      .ytcq-demo-caption[data-pointer="bottom"]::after {
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 10px solid #fff;
        bottom: -9px;
        display: block;
      }

      .ytcq-demo-caption strong {
        color: #17191f;
        display: block;
        font-family: "Inter Display", "Inter", sans-serif;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1.25;
        margin-bottom: 7px;
      }

      .ytcq-demo-caption span {
        color: #626b7a;
        display: block;
        font-size: 14px;
        letter-spacing: 0;
        line-height: 1.45;
      }

      .ytcq-demo-focus {
        background: rgba(47, 128, 237, 0.035);
        border: 2px solid rgba(74, 155, 255, 0.95);
        border-radius: 18px;
        box-shadow:
          0 0 0 9999px rgba(2, 6, 23, 0.07),
          0 0 0 4px rgba(74, 155, 255, 0.30),
          0 0 0 10px rgba(74, 155, 255, 0.14),
          0 0 28px 12px rgba(47, 128, 237, 0.38),
          inset 0 0 22px rgba(74, 155, 255, 0.12);
        box-sizing: border-box;
        opacity: 0;
        transform: scale(0.96);
        transition: opacity 160ms ease, transform 180ms ease;
        z-index: 2147483600;
      }

      .ytcq-demo-focus.is-visible {
        opacity: 1;
        transform: scale(1);
      }

      html,
      body {
        height: 100vh !important;
        overflow: hidden !important;
        width: 100vw !important;
      }

      ytd-app {
        min-height: 100vh !important;
        transition: transform 960ms cubic-bezier(0.2, 0, 0, 1) !important;
        transform-origin: 0 0 !important;
        width: 100vw !important;
        will-change: transform !important;
      }
    `
  });

  await page.evaluate(() => {
    if (window.__ytcqDemoPresentationInstalled) return;
    window.__ytcqDemoPresentationInstalled = true;

    const caption = document.createElement('div');
    const captionTitle = document.createElement('strong');
    const captionBody = document.createElement('span');
    const focus = document.createElement('div');
    caption.className = 'ytcq-demo-caption';
    focus.className = 'ytcq-demo-focus';
    caption.append(captionTitle, captionBody);
    document.body.append(caption, focus);
  });
}

async function installPopupPresentationLayer(page) {
  await installDemoPresentationLayer(page);
  await installDemoCursor(page);
  await page.addStyleTag({
    content: `
      html {
        align-items: center;
        background: #f6f7f8 !important;
        display: flex !important;
        justify-content: center;
      }

      body {
        background: transparent !important;
        height: ${extensionPopupSize.height}px !important;
        margin: 0 !important;
        overflow: visible !important;
        width: ${extensionPopupSize.width}px !important;
      }

      main,
      .popup-shell {
        border-radius: 18px !important;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
        box-sizing: border-box !important;
        height: ${extensionPopupSize.height}px !important;
        opacity: 0 !important;
        transition: none !important;
        width: ${extensionPopupSize.width}px !important;
      }
    `
  });
}

async function fadeDemoPopupIn(page, recorder) {
  await animateDemoPopupOpacity(page, recorder, 0, 1, 460);
}

async function fadeDemoPopupOut(page, recorder) {
  await fadeOutDemoCaption(page, recorder, 280);
  await animateDemoPopupOpacity(page, recorder, 1, 0, 420);
}

async function animateDemoPopupOpacity(page, recorder, fromOpacity, toOpacity, durationMs) {
  const frames = durationToFrames(durationMs);
  for (let frame = 0; frame <= frames; frame += 1) {
    const progress = easeInOutCubic(frame / frames);
    const opacity = fromOpacity + (toOpacity - fromOpacity) * progress;
    await setDemoPopupOpacity(page, opacity);
    await recorder.captureFrame();
  }
}

async function setDemoPopupOpacity(page, opacity) {
  await page.evaluate((nextOpacity) => {
    const targets = document.querySelectorAll('main, .popup-shell');
    targets.forEach((target) => {
      if (target instanceof HTMLElement) {
        target.style.setProperty('opacity', String(nextOpacity), 'important');
      }
    });
  }, opacity);
}

async function installDemoCursor(page) {
  const pointerCursorSrc = await readSvgDataUrl(pointerCursorPath);
  const handCursorSrc = await readSvgDataUrl(handCursorPath);
  await page.addStyleTag({
    content: `
      .ytcq-demo-cursor {
        display: block !important;
        height: 44px;
        left: 0;
        opacity: 1 !important;
        pointer-events: none;
        position: fixed;
        top: 0;
        transform: translate(12px, 24px);
        visibility: visible !important;
        width: 44px;
        z-index: 2147483647;
      }

      .ytcq-demo-cursor img {
        display: block;
        height: 44px;
        opacity: 1 !important;
        visibility: visible !important;
        width: 44px;
      }
    `
  });
  await page.evaluate(([pointerSrc, handSrc, hotspot, position]) => {
    let cursor = document.querySelector('.ytcq-demo-cursor');
    let image = cursor?.querySelector('img');
    if (!(cursor instanceof HTMLElement)) {
      cursor = document.createElement('div');
      cursor.className = 'ytcq-demo-cursor';
      document.body.append(cursor);
    }
    if (!(image instanceof HTMLImageElement)) {
      image = document.createElement('img');
      image.alt = '';
      cursor.replaceChildren(image);
    }
    image.src = pointerSrc;
    window.__ytcqDemoCursorPosition = position;
    window.__ytcqDemoCursorImages = { hand: handSrc, pointer: pointerSrc };
    window.__ytcqDemoCursorHotspot = hotspot;
    cursor.style.transform = `translate(${position.x - hotspot.x}px, ${position.y - hotspot.y}px)`;
  }, [pointerCursorSrc, handCursorSrc, cursorHotspot, demoCursorPosition]);
}

async function syncDemoCursorToStoredPosition(page) {
  await page.evaluate((position) => {
    window.__ytcqDemoCursorPosition = position;
    const cursor = document.querySelector('.ytcq-demo-cursor');
    const hotspot = window.__ytcqDemoCursorHotspot || { x: 16, y: 12 };
    if (cursor instanceof HTMLElement) {
      cursor.style.transform = `translate(${position.x - hotspot.x}px, ${position.y - hotspot.y}px)`;
    }
  }, demoCursorPosition).catch(() => undefined);
}

async function createFrameRecorder(page) {
  return createScreencastFrameRecorder(page);
}

async function createScreencastFrameRecorder(page) {
  const videoEncoder = createPipedVideoEncoder(pipedVideoPath);
  let currentSource = null;
  let frameCount = 0;
  let latestFrameBuffer = null;
  let latestFrameSequence = 0;
  let lastFrameBuffer = null;
  let lastProgressAt = 0;
  let restartPromise = null;
  let restartScheduled = false;
  let stage = 'Preparing';
  let stopped = false;
  let nextActionFrameAt = Date.now();
  let lastLoggedFrameSize = '';
  const startedAt = Date.now();
  const clickCues = [];
  const frameWaiters = new Set();

  await startScreencastSource(page);

  return {
    get clickCues() {
      return [...clickCues];
    },
    get frameCount() {
      return frameCount;
    },
    cueClick() {
      clickCues.push(Math.max(0, (frameCount / demoFps) * 1_000));
    },
    setStage(nextStage) {
      stage = nextStage;
      writeCaptureProgress({
        estimatedFrames: estimatedDemoFrames,
        frameCount,
        last: false,
        stage,
        startedAt
      });
    },
    async usePage(nextPage) {
      await syncDemoCursorToStoredPosition(nextPage);
      await restartScreencastSource(nextPage, { clearLatestFrame: true });
      lastFrameBuffer = null;
    },
    async refreshCaptureSource() {
      const page = currentSource?.page;
      if (!page) return;
      await restartScreencastSource(page, { clearLatestFrame: false });
    },
    async captureFrame() {
      await capturePaintedFrame();
    },
    async abort() {
      stopped = true;
      resolveFrameWaiters(null);
      await stopScreencastSource();
      await videoEncoder?.abort();
    },
    async captureThenHoldStill(durationMs) {
      if (durationMs <= 0) return;
      const frames = durationToFrames(durationMs);
      await capturePaintedFrame();
      await writeRepeatedLastFrame(Math.max(0, frames - 1));
      resetActionFrameClock();
    },
    async hold(durationMs) {
      const frames = durationToFrames(durationMs);
      for (let frame = 0; frame < frames; frame += 1) {
        await captureDynamicFrame();
      }
    },
    async holdStill(durationMs) {
      if (durationMs <= 0) return;
      const frames = durationToFrames(durationMs);
      if (!lastFrameBuffer) {
        await captureDynamicFrame();
        await writeRepeatedLastFrame(Math.max(0, frames - 1));
      } else {
        await writeRepeatedLastFrame(frames);
      }
      resetActionFrameClock();
    },
    async settleThenHoldStill(durationMs, settleMs = 240) {
      if (durationMs <= 0) return;
      const dynamicMs = Math.min(durationMs, settleMs);
      await this.hold(dynamicMs);
      await this.holdStill(durationMs - dynamicMs);
    },
    async close() {
      const capturedAt = Date.now();
      stopped = true;
      resolveFrameWaiters(null);
      writeCaptureProgress({
        estimatedFrames: estimatedDemoFrames,
        frameCount,
        last: true,
        stage: 'Captured',
        startedAt
      });
      await stopScreencastSource();
      const flushedAt = Date.now();
      await videoEncoder?.close();
      const finishedAt = Date.now();
      return {
        captureFps: frameCount / Math.max(0.001, (capturedAt - startedAt) / 1_000),
        captureMs: capturedAt - startedAt,
        encoderFlushMs: finishedAt - flushedAt,
        frameCount,
        videoPath: pipedVideoPath
      };
    }
  };

  async function startScreencastSource(nextPage) {
    const session = await createCaptureSession(nextPage);
    const handleFrame = (event) => {
      const buffer = Buffer.from(event.data, 'base64');
      session.send('Page.screencastFrameAck', {
        sessionId: event.sessionId
      }).catch(() => undefined);

      const dimensions = getImageDimensions(buffer);
      logFrameSizeIfNeeded(buffer, event.metadata, dimensions);
      if (latestFrameBuffer && !frameMatchesCaptureSize(dimensions)) {
        scheduleScreencastSourceRefresh();
        return;
      }

      latestFrameBuffer = buffer;
      latestFrameSequence += 1;
      resolveFrameWaiters(latestFrameBuffer);
    };

    session.on('Page.screencastFrame', handleFrame);
    currentSource = { handleFrame, page: nextPage, session };
    const { height, width } = getCapturePixelSize();
    const options = {
      everyNthFrame: 1,
      format: frameFormat,
      maxHeight: height,
      maxWidth: width
    };
    if (frameFormat === 'jpeg') options.quality = frameQuality;
    await session.send('Page.startScreencast', options);
    await withTimeout(waitForLatestFrame(), 10_000, 'receive first screencast frame');
    resetActionFrameClock();
  }

  async function stopScreencastSource() {
    if (!currentSource) return;
    const source = currentSource;
    currentSource = null;
    source.session.off('Page.screencastFrame', source.handleFrame);
    await source.session.send('Page.stopScreencast').catch(() => undefined);
    await source.session.detach().catch(() => undefined);
  }

  function scheduleScreencastSourceRefresh() {
    const page = currentSource?.page;
    if (!page || restartPromise || restartScheduled) return;
    restartScheduled = true;
    void (async () => {
      await delay(40);
      await restartScreencastSource(page, { clearLatestFrame: false });
    })().finally(() => {
      restartScheduled = false;
    });
  }

  async function restartScreencastSource(nextPage, { clearLatestFrame }) {
    if (restartPromise) {
      await restartPromise;
    }

    restartPromise = (async () => {
      if (clearLatestFrame) {
        latestFrameBuffer = null;
        resolveFrameWaiters(null);
      }
      await stopScreencastSource();
      await startScreencastSource(nextPage);
      resetActionFrameClock();
    })().finally(() => {
      restartPromise = null;
    });
    await restartPromise;
  }

  function waitForLatestFrame() {
    if (latestFrameBuffer) return Promise.resolve(latestFrameBuffer);
    if (stopped) return Promise.resolve(null);
    return new Promise((resolve) => {
      frameWaiters.add(resolve);
    });
  }

  function resolveFrameWaiters(buffer) {
    const waiters = [...frameWaiters];
    frameWaiters.clear();
    waiters.forEach((resolve) => resolve(buffer));
  }

  async function captureDynamicFrame() {
    await waitForNextActionFrame();
    const buffer = latestFrameBuffer || await waitForLatestFrame();
    if (!buffer || stopped) return;
    lastFrameBuffer = buffer;
    await writeFrameBuffer(buffer);
  }

  async function capturePaintedFrame() {
    const sequenceBeforePaint = latestFrameSequence;
    await currentSource?.page.evaluate(() => {
      return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }).catch(() => undefined);
    await waitForNextActionFrame();
    const freshFrame = await waitForFrameAfter(
      sequenceBeforePaint,
      Math.max(48, Math.round(getFrameDurationMs() * 4))
    );
    const buffer = freshFrame || latestFrameBuffer || await waitForLatestFrame();
    if (!buffer || stopped) return;
    lastFrameBuffer = buffer;
    await writeFrameBuffer(buffer);
  }

  async function waitForFrameAfter(sequence, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (!stopped && latestFrameSequence <= sequence && Date.now() < deadline) {
      await delay(Math.min(6, Math.max(1, deadline - Date.now())));
    }
    return latestFrameSequence > sequence ? latestFrameBuffer : null;
  }

  async function waitForNextActionFrame() {
    const frameDurationMs = getFrameDurationMs();
    nextActionFrameAt += frameDurationMs;
    const waitMs = nextActionFrameAt - Date.now();
    if (waitMs > 0) {
      await delay(waitMs);
      return;
    }

    if (waitMs < -frameDurationMs * 4) resetActionFrameClock();
  }

  function resetActionFrameClock() {
    nextActionFrameAt = Date.now();
  }

  async function writeFrameBuffer(buffer) {
    frameCount += 1;
    const now = Date.now();
    if (now - lastProgressAt >= progressUpdateMs) {
      lastProgressAt = now;
      writeCaptureProgress({
        estimatedFrames: estimatedDemoFrames,
        frameCount,
        last: false,
        stage,
        startedAt
      });
    }
    await videoEncoder.writeFrame(buffer);
  }

  async function writeRepeatedLastFrame(frameTotal) {
    if (!lastFrameBuffer) return;
    for (let frame = 0; frame < frameTotal; frame += 1) {
      await writeFrameBuffer(lastFrameBuffer);
    }
  }

  function logFrameSizeIfNeeded(buffer, metadata, dimensions = getImageDimensions(buffer)) {
    if (!shouldLogFrameSize) return;
    const metadataSize = metadata && Number.isFinite(metadata.deviceWidth) && Number.isFinite(metadata.deviceHeight)
      ? `${Math.round(metadata.deviceWidth)}x${Math.round(metadata.deviceHeight)}`
      : 'unknown';
    const bufferSize = dimensions ? `${dimensions.width}x${dimensions.height}` : 'unknown';
    const label = `${bufferSize}|${metadataSize}`;
    if (label === lastLoggedFrameSize) return;
    lastLoggedFrameSize = label;
    console.log(`\n[walkthrough] Raw frame ${bufferSize}; metadata ${metadataSize}; stage ${stage}`);
  }
}

function frameMatchesCaptureSize(dimensions) {
  if (!dimensions) return true;
  const { height, width } = getCapturePixelSize();
  return dimensions.width === width && dimensions.height === height;
}

function getImageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return {
      height: buffer.readUInt32BE(20),
      width: buffer.readUInt32BE(16)
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }
      offset += 2 + size;
    }
  }

  return null;
}

function createPipedVideoEncoder(videoPath) {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    String(demoFps),
    '-c:v',
    frameFormat === 'jpeg' ? 'mjpeg' : 'png',
    '-i',
    'pipe:0',
    ...getVideoEncodeArgs(),
    videoPath
  ];
  const child = spawn(process.env.YTCQ_FFMPEG || 'ffmpeg', args, {
    stdio: ['pipe', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  });
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = stderr.trim() ? `\n${stderr.trim()}` : '';
      reject(new Error(`ffmpeg frame pipe failed with ${signal || `exit code ${code}`}.${details}`));
    });
  });

  return {
    async close() {
      child.stdin.end();
      await exitPromise;
    },
    async abort() {
      child.stdin.destroy();
      child.kill('SIGTERM');
      await exitPromise.catch(() => undefined);
    },
    async writeFrame(buffer) {
      await writeStream(child.stdin, buffer);
    }
  };
}

function writeStream(stream, buffer) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      stream.off('drain', handleDrain);
      stream.off('error', handleError);
    }

    function handleDrain() {
      cleanup();
      resolve();
    }

    function handleError(error) {
      cleanup();
      reject(error);
    }

    stream.once('error', handleError);
    if (stream.write(buffer)) {
      cleanup();
      resolve();
      return;
    }

    stream.once('drain', handleDrain);
  });
}

function writeCaptureProgress({ estimatedFrames, frameCount, last, stage, startedAt }) {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const captureFps = frameCount / (elapsedMs / 1_000);
  const videoSeconds = frameCount / demoFps;
  const progress = last ? 1 : Math.min(1, frameCount / estimatedFrames);
  const remainingFrames = last ? 0 : Math.max(0, estimatedFrames - frameCount);
  const etaMs = captureFps > 0 ? (remainingFrames / captureFps) * 1_000 : 0;
  const barWidth = 24;
  const filled = Math.min(barWidth, Math.round(progress * barWidth));
  const bar = `${'#'.repeat(filled)}${'-'.repeat(barWidth - filled)}`;
  const text = [
    `[walkthrough] ${bar}`,
    `${Math.round(progress * 100).toString().padStart(3, ' ')}%`,
    `${frameCount}/${estimatedFrames} frames`,
    `${formatDuration(videoSeconds * 1_000)} video`,
    `${captureFps.toFixed(1)} fps`,
    `elapsed ${formatDuration(elapsedMs)}`,
    `eta ${formatDuration(etaMs)}`,
    stage
  ].join(' | ');
  process.stdout.write(`${last ? '\r' : '\r'}${text}${last ? '\n' : ''}`);
}

async function createCaptureSession(page) {
  const session = await page.context().newCDPSession(page);
  await applyCaptureMetrics(session, viewport);
  return session;
}

async function applyCaptureMetrics(session, size) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor,
    height: size.height,
    mobile: false,
    screenHeight: size.height,
    screenWidth: size.width,
    width: size.width
  });
  await session.send('Emulation.setVisibleSize', {
    height: size.height,
    width: size.width
  }).catch(() => undefined);
}

async function hoverWithCursor(page, locator, recorder, label, options = {}) {
  const box = await getLocatorBox(locator, label);
  const hoverPoint = getHumanTargetPoint(box, label);
  await setDemoFocusOnLocator(page, locator, options.padding ?? 8);
  await moveCursor(page, hoverPoint.x, hoverPoint.y, options.durationMs, recorder, {
    label,
    hoverBox: box
  });
  await recorder.hold(options.afterHoverHoldMs ?? 260);
  await clearDemoFocus(page);
  return box;
}

async function clickWithCursor(page, locator, recorder, label, options = {}) {
  if (options.beforeFocusHoldMs) {
    await recorder.hold(options.beforeFocusHoldMs);
  }
  const box = await getLocatorBox(locator, label);
  const clickPoint = getHumanTargetPoint(box, label);
  await setDemoFocusOnLocator(page, locator, options.padding ?? 8);
  if (options.afterFocusHoldMs) {
    await recorder.hold(options.afterFocusHoldMs);
  }
  if (options.caption) {
    await setDemoCaption(
      page,
      options.caption.title,
      options.caption.body,
      options.caption.anchorBox || box,
      options.caption.options || {}
    );
    const captionLeadMs = options.caption.durationMs ?? getClickCaptionLeadDuration(
      options.caption.title,
      options.caption.body
    );
    const captionAnimationMs = Math.min(360, captionLeadMs);
    await recorder.hold(captionAnimationMs);
    await recorder.holdStill(captionLeadMs - captionAnimationMs);
  }
  await moveCursor(page, clickPoint.x, clickPoint.y, options.durationMs, recorder, {
    label,
    hoverBox: box
  });
  await recorder.hold(options.clickSettleMs ?? getHumanClickSettleMs(label));
  const modifiers = options.modifiers || [];
  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }
  let mouseIsDown = false;
  try {
    await page.mouse.down();
    mouseIsDown = true;
    recorder.cueClick();
    await recorder.hold(options.pressMs ?? getHumanPressMs(label));
    await page.mouse.up();
    mouseIsDown = false;
  } finally {
    if (mouseIsDown) await page.mouse.up().catch(() => undefined);
    for (const modifier of modifiers.slice().reverse()) {
      await page.keyboard.up(modifier).catch(() => undefined);
    }
  }
  await clearDemoFocus(page);
  await setCursorVariant(page, 'pointer');
  await recorder.hold(options.afterClickHoldMs ?? 360);
}

async function highlightLocator(page, locator, padding = 8) {
  return setDemoFocusOnLocator(page, locator, padding);
}

async function showDemoCaptionFor(page, recorder, title, body, options = {}) {
  await fadeOutDemoCaption(page, recorder, 280);
  const box = options.anchorBox ||
    (options.anchorLocator ? await getLocatorBox(options.anchorLocator, title) : null);
  await setDemoCaption(page, title, body, box, options.captionOptions || {});
  if (options.anchorLocator) {
    await setDemoFocusOnLocator(page, options.anchorLocator, options.padding ?? 8);
  } else if (box) {
    await setDemoFocusBox(page, box, options.padding ?? 8);
  }
  const durationMs = options.durationMs || getReadableCaptionDuration(title, body);
  const animationMs = Math.min(360, durationMs);
  await recorder.hold(animationMs);
  await recorder.holdStill(durationMs - animationMs);
  await fadeOutDemoCaption(page, recorder, 320);
  await clearDemoFocus(page);
}

async function fadeInDemoLocator(locator, recorder, durationMs = 360) {
  await locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.style.opacity = '0';
    element.style.transform = 'translateY(-8px) scale(0.985)';
    element.style.transformOrigin = 'top right';
    element.style.transition = 'none';
    element.style.willChange = 'opacity, transform';
  });

  const frames = Math.max(1, durationToFrames(durationMs));
  for (let frame = 1; frame <= frames; frame += 1) {
    const progress = easeInOutCubic(frame / frames);
    await locator.evaluate((element, nextProgress) => {
      if (!(element instanceof HTMLElement)) return;
      element.style.opacity = String(nextProgress);
      element.style.transform = [
        `translateY(${(1 - nextProgress) * -8}px)`,
        `scale(${0.985 + nextProgress * 0.015})`
      ].join(' ');
    }, progress);
    await recorder.captureFrame();
  }

  await locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.style.removeProperty('opacity');
    element.style.removeProperty('transform');
    element.style.removeProperty('transform-origin');
    element.style.removeProperty('transition');
    element.style.removeProperty('will-change');
  });
}

async function setDemoCaption(page, title, body, anchorBox = null, options = {}) {
  await page.evaluate(([nextTitle, nextBody, targetBox, captionOptions]) => {
    const caption = document.querySelector('.ytcq-demo-caption');
    if (!(caption instanceof HTMLElement)) return;
    const placement = captionOptions?.placement || 'auto';
    const titleElement = caption.querySelector('strong');
    const bodyElement = caption.querySelector('span');
    caption.classList.remove('is-visible');
    if (titleElement) titleElement.textContent = nextTitle;
    if (bodyElement) bodyElement.textContent = nextBody;

    if (targetBox) {
      const viewportPadding = captionOptions?.viewportPadding ?? 18;
      const gap = captionOptions?.gap ?? 36;
      const verticalGap = captionOptions?.verticalGap ?? 22;
      const maxCaptionWidth = captionOptions?.maxWidth ?? 320;
      const captionBox = caption.getBoundingClientRect();
      const captionWidth = Math.min(captionBox.width || maxCaptionWidth, maxCaptionWidth);
      const captionHeight = captionBox.height || 104;
      const targetIsLow = targetBox.y + targetBox.height > window.innerHeight * 0.72;
      const horizontalPlacement = ['left', 'right', 'side'].includes(placement);
      const shouldPlaceAbove = placement === 'above' || (!horizontalPlacement && targetIsLow);
      const fitsLeft = targetBox.x - captionWidth - gap >= viewportPadding;
      const fitsRight = targetBox.x + targetBox.width + captionWidth + gap <= window.innerWidth - viewportPadding;
      let left;
      let top;
      if (shouldPlaceAbove && targetBox.y - captionHeight - verticalGap >= viewportPadding) {
        left = Math.max(
          viewportPadding,
          Math.min(
            window.innerWidth - captionWidth - viewportPadding,
            targetBox.x + targetBox.width / 2 - captionWidth / 2
          )
        );
        top = targetBox.y - captionHeight - verticalGap;
      } else if (placement === 'right' && fitsRight) {
        left = targetBox.x + targetBox.width + gap;
      } else if (placement === 'left' && fitsLeft) {
        left = targetBox.x - captionWidth - gap;
      } else if (fitsLeft) {
        left = targetBox.x - captionWidth - gap;
      } else if (fitsRight) {
        left = targetBox.x + targetBox.width + gap;
      } else {
        left = Math.max(viewportPadding, Math.min(window.innerWidth - captionWidth - viewportPadding, targetBox.x));
      }

      top ??= Math.max(
        viewportPadding,
        Math.min(
          window.innerHeight - captionHeight - viewportPadding,
          targetBox.y + targetBox.height / 2 - captionHeight / 2
        )
      );
      caption.style.left = `${left}px`;
      caption.style.top = `${top}px`;

      const captionCenterX = left + captionWidth / 2;
      const captionCenterY = top + captionHeight / 2;
      const targetCenterX = targetBox.x + targetBox.width / 2;
      const targetCenterY = targetBox.y + targetBox.height / 2;
      const deltaX = targetCenterX - captionCenterX;
      const deltaY = targetCenterY - captionCenterY;
      const pointerSide = Math.abs(deltaX) >= Math.abs(deltaY)
        ? (deltaX >= 0 ? 'right' : 'left')
        : (deltaY >= 0 ? 'bottom' : 'top');
      const pointerOffset = pointerSide === 'left' || pointerSide === 'right'
        ? Math.max(24, Math.min(captionHeight - 24, targetCenterY - top))
        : Math.max(24, Math.min(captionWidth - 24, targetCenterX - left));
      caption.dataset.pointer = pointerSide;
      caption.style.setProperty('--ytcq-demo-pointer-offset', `${pointerOffset}px`);
    } else {
      const maxCaptionWidth = captionOptions?.maxWidth ?? 320;
      const captionBox = caption.getBoundingClientRect();
      const captionWidth = Math.min(captionBox.width || maxCaptionWidth, maxCaptionWidth);
      const player = document.querySelector('#movie_player');
      const playerBox = player instanceof HTMLElement ? player.getBoundingClientRect() : null;
      const left = playerBox
        ? Math.max(48, Math.min(window.innerWidth - captionWidth - 48, playerBox.right - captionWidth - 48))
        : Math.max(48, Math.min(window.innerWidth - captionWidth - 48, window.innerWidth * 0.58));
      const top = playerBox
        ? Math.max(48, playerBox.top + 72)
        : 150;
      caption.style.left = `${left}px`;
      caption.style.top = `${top}px`;
      delete caption.dataset.pointer;
      caption.style.removeProperty('--ytcq-demo-pointer-offset');
    }

    caption.classList.add('is-visible');
  }, [title, body, anchorBox, options]);
}

async function fadeOutDemoCaption(page, recorder, durationMs = 320) {
  const frames = Math.max(1, durationToFrames(durationMs));
  const hasVisibleCaption = await page.evaluate(() => {
    const caption = document.querySelector('.ytcq-demo-caption');
    if (!(caption instanceof HTMLElement) || !caption.classList.contains('is-visible')) return false;
    caption.style.transition = 'none';
    return true;
  }).catch(() => false);
  if (!hasVisibleCaption) return;

  for (let frame = 1; frame <= frames; frame += 1) {
    const progress = easeInOutCubic(frame / frames);
    await page.evaluate((nextProgress) => {
      const caption = document.querySelector('.ytcq-demo-caption');
      if (!(caption instanceof HTMLElement)) return;
      caption.style.opacity = String(1 - nextProgress);
      caption.style.transform = `translateY(${nextProgress * 10}px)`;
    }, progress);
    await recorder.captureFrame();
  }

  await page.evaluate(() => {
    const caption = document.querySelector('.ytcq-demo-caption');
    if (!(caption instanceof HTMLElement)) return;
    caption.classList.remove('is-visible');
    caption.style.removeProperty('opacity');
    caption.style.removeProperty('transform');
    caption.style.removeProperty('transition');
  });
}

async function setDemoFocusOnLocator(page, locator, padding = 8) {
  const box = await locator.boundingBox();
  if (!box) {
    await clearDemoFocus(page);
    return null;
  }
  await setDemoFocusBox(page, box, padding);
  return box;
}

async function setDemoFocusBox(page, box, padding = 8) {
  await page.evaluate(([targetBox, targetPadding, shouldAnimate]) => {
    const focus = document.querySelector('.ytcq-demo-focus');
    if (!(focus instanceof HTMLElement)) return;
    if (shouldAnimate) focus.classList.remove('is-visible');
    focus.style.left = `${targetBox.x - targetPadding}px`;
    focus.style.top = `${targetBox.y - targetPadding}px`;
    focus.style.width = `${targetBox.width + targetPadding * 2}px`;
    focus.style.height = `${targetBox.height + targetPadding * 2}px`;
    if (shouldAnimate || !focus.classList.contains('is-visible')) void focus.offsetWidth;
    focus.classList.add('is-visible');
  }, [box, padding, true]);
}

async function clearDemoFocus(page) {
  await hideDemoFocusBox(page);
}

async function hideDemoFocusBox(page) {
  await page.evaluate(() => {
    document.querySelector('.ytcq-demo-focus')?.classList.remove('is-visible');
  });
}

async function getLocatorBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Could not find visible bounding box for ${label}.`);
  return box;
}

async function parkDemoCursorForOutro(page, recorder) {
  await moveCursor(page, viewport.width - 68, viewport.height - 72, 640, recorder, {
    label: 'outro cursor park'
  });
  await recorder.hold(180);
}

async function moveCursor(page, x, y, durationMs, recorder, options = {}) {
  const start = await page.evaluate(() => window.__ytcqDemoCursorPosition || null).catch(() => null) ||
    demoCursorPosition ||
    defaultDemoCursorPosition;
  demoCursorPosition = { x: start.x, y: start.y };
  const moveDurationMs = durationMs ?? getHumanCursorDurationMs(start, { x, y });
  const steps = durationToFrames(moveDurationMs);
  let activeVariant = pointIsInsideBox(start, options.hoverBox) ? 'hand' : 'pointer';
  await setCursorVariant(page, activeVariant);
  const controlPoints = getHumanCursorControlPoints(start, { x, y }, options.label || '');

  for (let step = 1; step <= steps; step += 1) {
    const progress = easeInOutCubic(step / steps);
    const point = step === steps
      ? { x, y }
      : getCubicBezierPoint(start, controlPoints.first, controlPoints.second, { x, y }, progress);
    const nextX = point.x;
    const nextY = point.y;
    const nextVariant = pointIsInsideBox({ x: nextX, y: nextY }, options.hoverBox) ? 'hand' : 'pointer';
    if (nextVariant !== activeVariant) {
      activeVariant = nextVariant;
      await setCursorVariant(page, activeVariant);
    }
    if (step === steps || step % 6 === 0) {
      await page.mouse.move(nextX, nextY);
    }
    demoCursorPosition = { x: nextX, y: nextY };
    await page.evaluate(([cursorX, cursorY]) => {
      window.__ytcqDemoCursorPosition = { x: cursorX, y: cursorY };
      const cursor = document.querySelector('.ytcq-demo-cursor');
      const hotspot = window.__ytcqDemoCursorHotspot || { x: 16, y: 12 };
      if (cursor instanceof HTMLElement) {
        cursor.style.transform = `translate(${cursorX - hotspot.x}px, ${cursorY - hotspot.y}px)`;
      }
    }, [nextX, nextY]);
    await recorder.captureFrame();
  }
}

async function setCursorVariant(page, variant) {
  await page.evaluate((nextVariant) => {
    const image = document.querySelector('.ytcq-demo-cursor img');
    const cursorImages = window.__ytcqDemoCursorImages || {};
    const src = cursorImages[nextVariant] || cursorImages.pointer;
    if (image instanceof HTMLImageElement && src) image.src = src;
  }, variant);
}

async function setDemoCameraForBox(page, recorder, box, options = {}) {
  const scale = box ? options.scale || 1.16 : 1;
  await clearDemoFocus(page);
  await recorder.hold(options.preHoldMs ?? 100);
  const currentCamera = await getDemoCamera(page);
  const logicalBox = box ? unprojectCameraBox(box, currentCamera) : null;
  const transform = box
    ? getCameraTransformForBox(logicalBox, scale, options)
    : getDefaultCamera();
  if (cameraTransformIsClose(currentCamera, transform)) {
    await recorder.hold(options.durationMs ?? 220);
    return;
  }
  await page.evaluate((camera) => {
    const app = document.querySelector('ytd-app');
    if (!(app instanceof HTMLElement)) return;
    window.__ytcqDemoCamera = camera;
    app.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  }, transform);
  await recorder.hold(options.durationMs ?? getCameraTransitionDurationMs(currentCamera, transform));
}

function cameraTransformIsClose(currentCamera, nextCamera) {
  const moveDistance = Math.hypot(nextCamera.x - currentCamera.x, nextCamera.y - currentCamera.y);
  const scaleDelta = Math.abs(nextCamera.scale - currentCamera.scale);
  return moveDistance < 18 && scaleDelta < 0.012;
}

function getCameraTransitionDurationMs(currentCamera, nextCamera) {
  const moveDistance = Math.hypot(nextCamera.x - currentCamera.x, nextCamera.y - currentCamera.y);
  const scaleDelta = Math.abs(nextCamera.scale - currentCamera.scale);
  return Math.round(Math.min(1_120, Math.max(760, 620 + moveDistance * 0.38 + scaleDelta * 1_600)));
}

async function getDemoCamera(page) {
  return page.evaluate(() => {
    return window.__ytcqDemoCamera || { scale: 1, x: 0, y: 0 };
  });
}

function getDefaultCamera() {
  return { scale: 1, x: 0, y: 0 };
}

function unprojectCameraBox(box, camera) {
  return {
    height: box.height / camera.scale,
    width: box.width / camera.scale,
    x: (box.x - camera.x) / camera.scale,
    y: (box.y - camera.y) / camera.scale
  };
}

function getCameraTransformForBox(box, scale, options = {}) {
  const focusXRatio = options.focusXRatio ?? 0.5;
  const focusYRatio = options.focusYRatio ?? 0.5;
  const screenXRatio = options.screenXRatio ?? 0.5;
  const screenYRatio = options.screenYRatio ?? 0.5;
  const targetX = box.x + box.width * focusXRatio;
  const targetY = box.y + box.height * focusYRatio;
  const minX = viewport.width - viewport.width * scale;
  const minY = viewport.height - viewport.height * scale;
  const rawX = options.preserveRightEdge
    ? minX
    : viewport.width * screenXRatio - targetX * scale;
  const rawY = viewport.height * screenYRatio - targetY * scale;

  return {
    scale,
    x: Math.min(0, Math.max(minX, rawX)),
    y: Math.min(0, Math.max(minY, rawY))
  };
}

function getReadableCaptionDuration(title, body) {
  const words = `${title} ${body}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(5_800, Math.max(3_600, 600 + words * 260));
}

function getClickCaptionLeadDuration(title, body) {
  return Math.max(2_400, getReadableCaptionDuration(title, body) - 1_800);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function pointIsInsideBox(point, box) {
  return Boolean(
    box &&
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function getHumanTargetPoint(box, label = '') {
  const seed = getStableSeed(label);
  const maxOffsetX = Math.min(10, Math.max(0, box.width * 0.18));
  const maxOffsetY = Math.min(7, Math.max(0, box.height * 0.16));
  const offsetX = getSeededUnit(seed) * maxOffsetX;
  const offsetY = getSeededUnit(seed >>> 8) * maxOffsetY;
  return {
    x: box.x + box.width / 2 + offsetX,
    y: box.y + box.height / 2 + offsetY
  };
}

function getHumanCursorDurationMs(start, end) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return Math.round(Math.min(980, Math.max(380, 210 + distance * 0.72)));
}

function getHumanClickSettleMs(label = '') {
  return 120 + Math.round((getStableSeed(label) % 80) / 2);
}

function getHumanPressMs(label = '') {
  return 54 + (getStableSeed(label) % 34);
}

function getHumanKeyDelayMs(grapheme, index) {
  if (grapheme === ' ') return 8;
  if (isVisualEmojiGrapheme(grapheme)) return 18;
  return 7 + ((index * 5 + grapheme.codePointAt(0)) % 8);
}

function getHumanTypingHoldMs(grapheme, index, graphemes) {
  if (isVisualEmojiGrapheme(grapheme)) return 120;
  if (/[.!?]/.test(grapheme)) return 125;
  if (grapheme === ' ') return 34 + (index % 3) * 8;
  const next = graphemes[index + 1] || '';
  const wordPause = next === ' ' && index > 0 ? 28 + (index % 4) * 9 : 0;
  return 30 + ((index * 7 + grapheme.codePointAt(0)) % 18) + wordPause;
}

function isVisualEmojiGrapheme(value) {
  return /\p{Extended_Pictographic}/u.test(value) || value.includes('\uFE0F');
}

function getHumanCursorControlPoints(start, end, label = '') {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const seed = getStableSeed(`${label}:${Math.round(start.x)},${Math.round(start.y)}:${Math.round(end.x)},${Math.round(end.y)}`);
  const bend = Math.min(80, Math.max(14, distance * 0.13)) * (getSeededUnit(seed) >= 0 ? 1 : -1);
  const firstBias = 0.32 + Math.abs(getSeededUnit(seed >>> 4)) * 0.08;
  const secondBias = 0.72 + Math.abs(getSeededUnit(seed >>> 10)) * 0.10;
  return {
    first: {
      x: start.x + dx * firstBias + normalX * bend,
      y: start.y + dy * firstBias + normalY * bend
    },
    second: {
      x: start.x + dx * secondBias - normalX * bend * 0.42,
      y: start.y + dy * secondBias - normalY * bend * 0.42
    }
  };
}

function getCubicBezierPoint(start, firstControl, secondControl, end, progress) {
  const inverse = 1 - progress;
  const first = inverse * inverse * inverse;
  const second = 3 * inverse * inverse * progress;
  const third = 3 * inverse * progress * progress;
  const fourth = progress * progress * progress;
  return {
    x: start.x * first + firstControl.x * second + secondControl.x * third + end.x * fourth,
    y: start.y * first + firstControl.y * second + secondControl.y * third + end.y * fourth
  };
}

function getStableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getSeededUnit(seed) {
  return ((seed % 2001) / 1000) - 1;
}

function durationToFrames(durationMs) {
  return Math.max(1, Math.round((durationMs / 1_000) * demoFps));
}

function getFrameDurationMs() {
  return 1_000 / demoFps;
}

function getDefaultDemoFps() {
  if (previewMode) return 24;
  return 60;
}

function getDefaultDemoScale() {
  if (previewMode) return 1;
  return 1.5;
}

function getDefaultDemoCrf() {
  if (previewMode) return '26';
  return '17';
}

function getDefaultDemoPreset() {
  if (previewMode) return 'ultrafast';
  return 'veryfast';
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoundedInteger(value, fallback, min, max) {
  const parsed = readPositiveInteger(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}

function readEnum(value, allowedValues, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getFutureDemoWhenTarget(now = new Date()) {
  const target = new Date(now.getTime() + (45 * 60 * 1_000));
  target.setSeconds(0, 0);
  target.setMinutes(Math.ceil(target.getMinutes() / 5) * 5);

  const hour = target.getHours();
  const minute = target.getMinutes();
  const time = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
  const isSameDay = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
  if (isSameDay) return time;

  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${month}-${day} ${time}`;
}

function getOutputLogLabel() {
  if (!shouldHashFinalOutput) return outputPath;
  return `${outputPath} -> ${path.join(finalVideoDir, `${finalVideoBaseName}-<hash>.mp4`)}`;
}

function getDemoModeLabel() {
  if (previewMode) return 'preview';
  return 'final';
}

function getFrameCaptureLogLabel() {
  const quality = frameFormat === 'jpeg' ? ` q${frameQuality}` : '';
  return `screencast pipe ${frameFormat}${quality}`;
}

function getCaptureSizeLabel() {
  const { height, width } = getCapturePixelSize();
  return `${width}x${height}`;
}

function getVideoEncodeLogLabel() {
  return `h264 crf ${process.env.YTCQ_DEMO_CRF || getDefaultDemoCrf()} ${process.env.YTCQ_DEMO_PRESET || getDefaultDemoPreset()}`;
}

function writeTimingSummary({ captureStats, encodeMs }) {
  const details = [
    `capture ${formatDuration(captureStats.captureMs)}`,
    `${captureStats.captureFps.toFixed(1)} capture fps`
  ];
  if (captureStats.encoderFlushMs > 100) {
    details.push(`pipe flush ${formatDuration(captureStats.encoderFlushMs)}`);
  }
  details.push(`mux ${formatDuration(encodeMs)}`);
  console.log(`[walkthrough] Timing: ${details.join(' | ')}`);
}

function shouldRunHeadlessDemo() {
  const override = process.env.YTCQ_DEMO_HEADLESS || process.env.YTCQ_TEST_LIVE_HEADLESS;
  if (override === '0') return false;
  if (override === '1') return true;
  return true;
}

async function getDemoDocsFontFaceCss() {
  demoDocsFontFaceCssPromise ??= (async () => {
    const [
      interFontSrc,
      interDisplayBoldFontSrc,
      interDisplayExtraBoldFontSrc
    ] = await Promise.all([
      readFileDataUrl(interFontPath, 'font/woff2'),
      readFileDataUrl(interDisplayBoldFontPath, 'font/woff2'),
      readFileDataUrl(interDisplayExtraBoldFontPath, 'font/woff2')
    ]);

    return `
      @font-face {
        font-family: "Inter";
        font-style: normal;
        font-weight: 100 900;
        font-display: swap;
        src: url("${interFontSrc}") format("woff2");
      }

      @font-face {
        font-family: "Inter Display";
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url("${interDisplayBoldFontSrc}") format("woff2");
      }

      @font-face {
        font-family: "Inter Display";
        font-style: normal;
        font-weight: 750 900;
        font-display: swap;
        src: url("${interDisplayExtraBoldFontSrc}") format("woff2");
      }
    `;
  })();

  return demoDocsFontFaceCssPromise;
}

async function readSvgDataUrl(filePath) {
  return readFileDataUrl(filePath, 'image/svg+xml');
}

async function readFileDataUrl(filePath, mimeType) {
  const contents = await readFile(filePath);
  return `data:${mimeType};base64,${contents.toString('base64')}`;
}

async function encodeCapturedVideo(frameCount, { clickCues = [], pipedVideoPath: inputVideoPath } = {}) {
  if (!inputVideoPath) throw new Error('No piped walkthrough video was captured.');
  await muxPipedVideoToOutput(inputVideoPath, frameCount, { clickCues });
}

async function muxPipedVideoToOutput(inputVideoPath, frameCount, { clickCues = [] } = {}) {
  if (frameCount <= 0) throw new Error('No demo frames were captured.');

  if (!clickCues.length) {
    await rename(inputVideoPath, outputPath);
    return;
  }

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputVideoPath
  ];
  appendAudioCueArgs(args, frameCount, { clickCues });
  args.push('-c:v', 'copy', outputPath);
  await runProcess(process.env.YTCQ_FFMPEG || 'ffmpeg', args);
}

function appendAudioCueArgs(args, frameCount, { clickCues = [] } = {}) {
  const availableAudioCueGroups = getAvailableAudioCueGroups({ clickCues });
  if (!availableAudioCueGroups.length) return;

  const videoDurationSeconds = frameCount / demoFps;
  args.push(
    '-f',
    'lavfi',
    '-t',
    videoDurationSeconds.toFixed(3),
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000'
  );

  let nextInputIndex = 2;
  const cueFilters = [];
  const cueLabels = [];
  const cueCounts = [];
  availableAudioCueGroups.forEach((group) => {
    const cues = group.cues.map((cueMs) => Math.max(0, Math.round(cueMs)));
    cueCounts.push(`${cues.length} ${group.label}`);
    cues.forEach((cueMs, index) => {
      args.push('-i', group.filePath);
      const label = `${group.tag}${index}`;
      cueFilters.push(`[${nextInputIndex}:a]adelay=delays=${cueMs}:all=1,volume=${group.volume}[${label}]`);
      cueLabels.push(`[${label}]`);
      nextInputIndex += 1;
    });
  });

  const mixedInputs = `[1:a]${cueLabels.join('')}`;
  args.push(
    '-filter_complex',
    `${cueFilters.join(';')};${mixedInputs}amix=inputs=${cueLabels.length + 1}:duration=first:dropout_transition=0:normalize=0[a]`,
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:a',
    'aac',
    '-b:a',
    '160k'
  );
  console.log(`[walkthrough] Mixing ${cueCounts.join(' and ')} cue${cueLabels.length === 1 ? '' : 's'} into the video.`);
}

function getAvailableAudioCueGroups({ clickCues = [] } = {}) {
  return [
    {
      cues: clickCues,
      filePath: clickSoundPath,
      label: 'click',
      tag: 'click',
      volume: previewMode ? '1.25' : '1.15'
    }
  ]
    .filter((group) => group.cues.length)
    .filter((group) => {
      if (existsSync(group.filePath)) return true;
      console.warn(`[walkthrough] Skipping ${group.label} cues because ${group.filePath} does not exist.`);
      return false;
    });
}

function getVideoEncodeArgs() {
  const { height, width } = getCapturePixelSize();
  return [
    '-vf',
    [
      `scale=${width}:${height}:flags=lanczos`,
      'setsar=1'
    ].join(','),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    process.env.YTCQ_DEMO_CRF || getDefaultDemoCrf(),
    '-preset',
    process.env.YTCQ_DEMO_PRESET || getDefaultDemoPreset()
  ];
}

function getCapturePixelSize() {
  return {
    height: makeEvenPixelSize(viewport.height * deviceScaleFactor),
    width: makeEvenPixelSize(viewport.width * deviceScaleFactor)
  };
}

function makeEvenPixelSize(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

async function applyContentHashToFinalOutput(unhashedOutputPath) {
  const contents = await readFile(unhashedOutputPath);
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 8);
  const hashedOutputPath = path.join(finalVideoDir, `${finalVideoBaseName}-${hash}.mp4`);
  await rename(unhashedOutputPath, hashedOutputPath);
  await removeOldFinalWalkthroughVideos(hashedOutputPath);
  return hashedOutputPath;
}

async function removeOldFinalWalkthroughVideos(currentOutputPath) {
  const entries = await readdir(finalVideoDir).catch(() => []);
  const finalVideoPattern = new RegExp(`^${escapeRegExp(finalVideoBaseName)}-[a-f0-9]{8}\\.mp4$`);
  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(finalVideoDir, entry);
    if (entryPath === currentOutputPath || !finalVideoPattern.test(entry)) return;
    await rm(entryPath, { force: true });
  }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} failed with ${signal || `exit code ${code}`}.`));
    });
  });
}


async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Timed out while trying to ${label}.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function delay(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function splitDemoGraphemes(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), ({ segment }) => segment);
  }
  return Array.from(value);
}

function getCanonicalWatchUrl(value) {
  try {
    const url = new URL(value);
    const videoId = url.searchParams.get('v') || '';
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : value;
  } catch {
    return value;
  }
}

function getSourceStorageKey(value) {
  const videoId = getVideoIdFromUrl(value);
  if (videoId) return `video:${videoId}`;
  return `source:${hashStorageKey(value || 'unknown')}`;
}

function createDemoAvatarSvg(handle) {
  const normalized = String(handle || '').replace(/^@/, '');
  const initial = (normalized.match(/\p{L}|\p{N}/u)?.[0] || normalized.slice(0, 1) || 'C')
    .toUpperCase();
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    `<rect width="64" height="64" rx="32" fill="${getDemoAvatarColor(handle)}"/>`,
    `<text x="32" y="32" text-anchor="middle" dy=".35em" fill="white" font-family="Roboto, Arial, sans-serif" font-size="30" font-weight="400">${escapeSvgText(initial)}</text>`,
    '</svg>'
  ].join('');
}

function getDemoAvatarColor(handle) {
  return `hsl(${hashDemoString(String(handle || '').trim() || 'marked-user') % 360} 86% 58%)`;
}

function getVideoIdFromUrl(value) {
  try {
    const url = new URL(value);
    return (url.searchParams.get('v') || url.searchParams.get('video_id') || '').trim();
  } catch {
    return '';
  }
}

function hashStorageKey(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function hashDemoString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return Math.abs(hash);
}

function escapeSvgText(value) {
  return String(value).replace(/[&<>"']/g, '');
}
