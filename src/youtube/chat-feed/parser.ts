/**
 * Pure parser for the InnerTube live-chat subset used by feed-backed
 * features. It deliberately discards continuations, tracking parameters, service
 * endpoints, request metadata, and every other value outside the shared
 * sanitized protocol. A page-world-only observer may retain YouTube's native
 * message-menu endpoint without adding it to the returned result.
 */
import type {
  YouTubeChatAuthor,
  YouTubeChatAuthorBadge,
  YouTubeChatFeedAction,
  YouTubeChatMessageColors,
  YouTubeChatMessageRecord,
  YouTubeChatRichRun
} from './protocol';

type DataRecord = Record<string, unknown>;

export interface YouTubeChatFeedParseOptions {
  observeContextMenuEndpoint?: YouTubeChatContextMenuEndpointObserver;
}

export type YouTubeChatContextMenuEndpoint = Record<string, unknown>;

export type YouTubeChatContextMenuEndpointObserver = (
  messageId: string,
  endpoint: YouTubeChatContextMenuEndpoint | null
) => void;

export interface YouTubeChatFeedParseResult {
  actions: YouTubeChatFeedAction[];
  compatibilityWarnings: string[];
  continuationTimeoutMs?: number;
  fatalErrors: string[];
  foundChat: boolean;
  unreadableFeed: boolean;
}

const MESSAGE_RENDERER_KEYS = new Set([
  'giftMessageViewModel',
  'liveChatTextMessageRenderer',
  'liveChatPaidMessageRenderer',
  'liveChatPaidStickerRenderer',
  'liveChatMembershipItemRenderer',
  'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer',
  'liveChatSponsorshipsGiftRedemptionAnnouncementRenderer'
]);

const KNOWN_IGNORED_ITEM_RENDERERS = new Set([
  'liveChatModeChangeMessageRenderer',
  'liveChatPlaceholderItemRenderer',
  'liveChatViewerEngagementMessageRenderer'
]);

const KNOWN_NON_FEED_ACTIONS = new Set([
  // Tickers and banners mirror information that also arrives through the main
  // feed. This first protocol intentionally leaves those auxiliary surfaces
  // native rather than treating their private renderers as parser failures.
  'addBannerToLiveChatCommand',
  'addInteractivityWidgetAction',
  'addLiveChatTickerItemAction',
  'closeLiveChatActionPanelAction',
  'collapseLiveChatItemAction',
  'dimChatItemAction',
  'liveChatReportModerationStateCommand',
  'removeBannerForLiveChatCommand',
  'removeLiveChatTickerItemAction',
  'replaceLiveChatTickerItemAction',
  'showLiveChatActionPanelAction',
  'showLiveChatDialogAction',
  'showLiveChatParticipantsAction',
  'showLiveChatSurveyCommand',
  'showLiveChatTooltipCommand',
  'showPollPanelAction',
  'updateDateTextAction',
  'updateDescriptionAction',
  'updateLiveChatPollAction',
  'updateOrAddInteractivityWidgetAction',
  'updateToggleButtonTextAction',
  'updateViewershipAction'
]);

interface ParserState {
  actions: YouTubeChatFeedAction[];
  compatibilityWarnings: Set<string>;
  continuationTimeoutMs?: number;
  fatalErrors: Set<string>;
  foundChat: boolean;
  observeContextMenuEndpoint?: YouTubeChatContextMenuEndpointObserver;
  processedActions: WeakSet<object>;
  unreadableFeed: boolean;
  visited: WeakSet<object>;
}

interface ParsedFormattedText {
  plainText: string;
  runs: YouTubeChatRichRun[];
}

interface ParsedAuthorBadges {
  badges: YouTubeChatAuthorBadge[];
  isOwner: boolean;
}

export function parseYouTubeChatFeedPayload(
  value: unknown,
  options: YouTubeChatFeedParseOptions = {}
): YouTubeChatFeedParseResult {
  const state: ParserState = {
    actions: [],
    compatibilityWarnings: new Set<string>(),
    fatalErrors: new Set<string>(),
    foundChat: false,
    observeContextMenuEndpoint: options.observeContextMenuEndpoint,
    processedActions: new WeakSet<object>(),
    unreadableFeed: false,
    visited: new WeakSet<object>()
  };

  walkForChatContainers(value, state, true);

  return {
    actions: state.actions,
    compatibilityWarnings: [...state.compatibilityWarnings],
    continuationTimeoutMs: state.continuationTimeoutMs,
    fatalErrors: [...state.fatalErrors],
    foundChat: state.foundChat,
    unreadableFeed: state.unreadableFeed
  };
}

function walkForChatContainers(
  value: unknown,
  state: ParserState,
  parseRootActions = false
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkForChatContainers(item, state);
    }
    return;
  }

  const record = asRecord(value);
  if (!record || state.visited.has(record)) return;
  state.visited.add(record);
  if (parseRootActions) parseActionArray(record.actions, state);

  for (const [key, child] of Object.entries(record)) {
    if (key === 'liveChatContinuation') {
      parseLiveChatContinuation(child, state);
      continue;
    }
    if (key === 'liveChatRenderer') {
      parseInitialLiveChatRenderer(child, state);
      continue;
    }
    if (key === 'actions') continue;
    walkForChatContainers(child, state);
  }
}

function parseLiveChatContinuation(value: unknown, state: ParserState): void {
  const continuation = asRecord(value);
  if (!continuation) return;
  state.foundChat = true;
  if (continuation.clientMessages !== undefined && continuation.clientMessages !== null) {
    pushAction(state, { type: 'reset' });
  }
  parseActionArray(continuation.actions, state);
  rememberContinuationTimeout(continuation.continuations, state);
}

function parseInitialLiveChatRenderer(value: unknown, state: ParserState): void {
  const record = asRecord(value);
  if (!record || state.visited.has(record)) return;
  state.visited.add(record);
  state.foundChat = true;

  parseActionArray(record.actions, state);
  rememberContinuationTimeout(record.continuations, state);
  for (const [key, child] of Object.entries(record)) {
    if (key === 'actions' || key === 'continuations') continue;
    findInitialItemLists(child, state);
  }
}

function findInitialItemLists(value: unknown, state: ParserState): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      findInitialItemLists(item, state);
    }
    return;
  }

  const record = asRecord(value);
  if (!record || state.visited.has(record)) return;
  state.visited.add(record);

  for (const [key, child] of Object.entries(record)) {
    if (key === 'liveChatItemListRenderer') {
      const itemList = asRecord(child);
      if (itemList && Array.isArray(itemList.contents)) {
        itemList.contents.forEach((item) => parseFeedItem(item, state));
      }
      if (itemList) {
        parseActionArray(itemList.actions, state);
        rememberContinuationTimeout(itemList.continuations, state);
      }
      continue;
    }
    findInitialItemLists(child, state);
  }
}

function parseActionArray(
  value: unknown,
  state: ParserState,
  replayOffsetMs?: number
): void {
  if (!Array.isArray(value)) return;
  value.forEach((action) => parseAction(action, state, replayOffsetMs));
}

function parseAction(value: unknown, state: ParserState, replayOffsetMs?: number): void {
  const action = asRecord(value);
  if (!action || Object.keys(action).length === 0) {
    rememberCompatibilityWarning(state, 'feed-action:invalid', true);
    return;
  }
  if (state.processedActions.has(action)) return;
  state.processedActions.add(action);

  for (const [key, payload] of Object.entries(action)) {
    if (key === 'replayChatItemAction') {
      const replay = asRecord(payload);
      if (!replay || !Array.isArray(replay.actions)) {
        rememberCompatibilityWarning(state, 'replayChatItemAction:invalid', true);
        continue;
      }
      parseActionArray(
        replay.actions,
        state,
        parseReplayOffsetMs(replay.videoOffsetTimeMsec) ?? replayOffsetMs
      );
      continue;
    }

    if (key === 'addChatItemAction') {
      parseFeedItem(asRecord(payload)?.item, state, replayOffsetMs);
      continue;
    }

    if (key === 'replaceChatItemAction') {
      const replacement = asRecord(payload);
      if (!replacement) {
        rememberCompatibilityWarning(state, 'replaceChatItemAction:invalid', true);
        continue;
      }
      const targetId = getNonEmptyString(replacement.targetItemId);
      if (targetId) pushAction(state, { id: targetId, type: 'remove' }, replayOffsetMs);
      else rememberCompatibilityWarning(state, 'replaceChatItemAction:missing-target');
      parseFeedItem(replacement.replacementItem, state, replayOffsetMs);
      continue;
    }

    if (key === 'removeChatItemAction' || key === 'markChatItemAsDeletedAction') {
      const targetId = getNonEmptyString(asRecord(payload)?.targetItemId);
      if (targetId) pushAction(state, { id: targetId, type: 'remove' }, replayOffsetMs);
      else rememberCompatibilityWarning(state, `${cleanInlineText(key)}:missing-target`);
      continue;
    }

    if (key === 'markChatItemsByAuthorAsDeletedAction' || key === 'removeChatItemByAuthorAction') {
      const channelId = getNonEmptyString(asRecord(payload)?.externalChannelId);
      if (channelId) {
        pushAction(state, { channelId, type: 'remove-author' }, replayOffsetMs);
      }
      else rememberCompatibilityWarning(state, `${cleanInlineText(key)}:missing-author`);
      continue;
    }

    // Unknown auxiliary commands are left to YouTube. Feed-looking commands
    // are recorded for diagnostics, and add-like commands contribute to feed
    // health because they may contain rows the shared parser could not read.
    if (KNOWN_NON_FEED_ACTIONS.has(key)) continue;
    if (/ChatItems?.*Action$/.test(key)) {
      rememberCompatibilityWarning(
        state,
        `feed-action:${cleanInlineText(key)}`,
        /^(?:add|append|insert|prepend|replace).*ChatItems?.*Action$/i.test(key)
      );
    }
  }
}

function parseFeedItem(value: unknown, state: ParserState, replayOffsetMs?: number): void {
  const item = asRecord(value);
  if (!item) {
    rememberCompatibilityWarning(state, 'feed:invalid-item', true);
    return;
  }
  const rendererEntry = getRendererEntry(item);
  if (!rendererEntry) {
    rememberCompatibilityWarning(state, 'feed:missing-renderer', true);
    return;
  }

  const [rendererKey, rendererValue] = rendererEntry;
  if (KNOWN_IGNORED_ITEM_RENDERERS.has(rendererKey)) return;
  if (!MESSAGE_RENDERER_KEYS.has(rendererKey)) {
    rememberCompatibilityWarning(state, `feed:${cleanInlineText(rendererKey)}`, true);
    return;
  }

  const record = parseMessageRenderer(rendererKey, rendererValue);
  if (!record) {
    rememberCompatibilityWarning(state, `${cleanInlineText(rendererKey)}:invalid`, true);
    return;
  }
  state.observeContextMenuEndpoint?.(
    record.id,
    asRecord(asRecord(rendererValue)?.contextMenuEndpoint) || null
  );
  pushAction(state, { record, type: 'upsert' }, replayOffsetMs);
}

function parseMessageRenderer(
  rendererKey: string,
  value: unknown
): YouTubeChatMessageRecord | null {
  const renderer = asRecord(value);
  if (!renderer) return null;
  const id = getNonEmptyString(renderer.id);
  if (!id) return null;

  const common = {
    author: parseAuthor(renderer),
    colors: parseColors(renderer),
    id,
    timestampText: getFormattedPlainText(renderer.timestampText) || undefined,
    timestampUsec: parseTimestampUsec(renderer.timestampUsec)
  };

  if (rendererKey === 'giftMessageViewModel') {
    const message = parseFormattedText(renderer.text);
    const imageUrl = getThumbnailUrl(renderer.giftImage);
    const alt = cleanInlineText(renderer.giftImageA11yLabel);
    if (!message.runs.length && !imageUrl) return null;
    const headerText = message.plainText || alt || 'Gift';
    return compactRecord({
      ...common,
      gift: {
        ...(alt ? { alt } : {}),
        giftType: 'purchase',
        headerText,
        ...(imageUrl ? { imageUrl } : {})
      },
      kind: 'gift',
      plainText: message.plainText,
      runs: message.runs
    });
  }

  if (rendererKey === 'liveChatTextMessageRenderer') {
    const message = parseFormattedText(renderer.message);
    if (!message.runs.length) return null;
    return compactRecord({
      ...common,
      kind: 'text',
      plainText: message.plainText,
      runs: message.runs
    });
  }

  if (rendererKey === 'liveChatPaidMessageRenderer') {
    const message = parseFormattedText(renderer.message);
    const amountText = getFormattedPlainText(renderer.purchaseAmountText);
    return compactRecord({
      ...common,
      kind: 'paid',
      paid: { amountText },
      plainText: message.plainText,
      runs: message.runs
    });
  }

  if (rendererKey === 'liveChatPaidStickerRenderer') {
    const imageUrl = getThumbnailUrl(renderer.sticker);
    const alt = getAccessibilityLabel(renderer.sticker) || 'Sticker';
    if (!imageUrl) return null;
    const amountText = getFormattedPlainText(renderer.purchaseAmountText);
    return compactRecord({
      ...common,
      kind: 'sticker',
      plainText: alt,
      runs: [],
      sticker: { alt, amountText, imageUrl }
    });
  }

  if (rendererKey === 'liveChatMembershipItemRenderer') {
    const message = parseFormattedText(renderer.message);
    const header = parseFirstFormattedText(
      renderer.headerPrimaryText,
      renderer.headerSubtext,
      renderer.membershipDurationText
    );
    const visible = message.runs.length ? message : header;
    const headerText = header.plainText || message.plainText;
    if (!headerText && !visible.runs.length) return null;
    return compactRecord({
      ...common,
      kind: 'membership',
      membership: {
        headerText,
        subtext: message.plainText && message.plainText !== headerText
          ? message.plainText
          : undefined
      },
      plainText: visible.plainText,
      runs: visible.runs
    });
  }

  const giftType = rendererKey === 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer'
    ? 'purchase'
    : 'redemption';
  const sponsorshipHeader = asRecord(asRecord(renderer.header)?.liveChatSponsorshipsHeaderRenderer);
  const header = parseFirstFormattedText(
    renderer.message,
    renderer.primaryText,
    renderer.headerPrimaryText,
    sponsorshipHeader?.primaryText
  );
  const author = parseAuthor(renderer, sponsorshipHeader || undefined);
  const headerText = header.plainText || (giftType === 'purchase' ? 'Gift memberships' : 'Gift membership');
  const giftImageUrl = getThumbnailUrl(sponsorshipHeader?.image);
  const giftImageAlt = getAccessibilityLabel(sponsorshipHeader?.image) || 'Gift membership';
  return compactRecord({
    ...common,
    author,
    gift: {
      ...(giftImageUrl ? { alt: giftImageAlt } : {}),
      count: parseGiftCount(renderer.giftMembershipsCount),
      giftType,
      headerText,
      ...(giftImageUrl ? { imageUrl: giftImageUrl } : {})
    },
    kind: 'gift',
    plainText: headerText,
    runs: header.runs.length ? header.runs : [{ text: headerText, type: 'text' }]
  });
}

function compactRecord(record: YouTubeChatMessageRecord): YouTubeChatMessageRecord {
  if (!record.author) delete record.author;
  if (!record.colors || Object.keys(record.colors).length === 0) delete record.colors;
  if (!record.timestampText) delete record.timestampText;
  if (!record.timestampUsec) delete record.timestampUsec;
  return record;
}

function parseAuthor(primary: DataRecord, fallback?: DataRecord): YouTubeChatAuthor | undefined {
  const name = getFormattedPlainText(primary.authorName) || getFormattedPlainText(fallback?.authorName);
  if (!name) return undefined;

  const channelId = getNonEmptyString(
    primary.authorExternalChannelId || fallback?.authorExternalChannelId
  );
  const avatarUrl = getThumbnailUrl(primary.authorPhoto) ||
    getThumbnailUrl(primary.authorAvatar) ||
    getThumbnailUrl(fallback?.authorPhoto) ||
    getThumbnailUrl(fallback?.authorAvatar);
  const { badges, isOwner } = parseBadges(primary.authorBadges || fallback?.authorBadges);
  const topFanRank = parseTopFanRank(primary.beforeContentButtons) ??
    parseTopFanRank(fallback?.beforeContentButtons);
  return {
    ...(avatarUrl ? { avatarUrl } : {}),
    badges,
    ...(channelId ? { channelId } : {}),
    ...(isOwner ? { isOwner: true } : {}),
    name,
    ...(topFanRank ? { topFanRank } : {})
  };
}

function parseBadges(value: unknown): ParsedAuthorBadges {
  if (!Array.isArray(value)) return { badges: [], isOwner: false };
  let isOwner = false;
  const badges = value
    .map((badge): YouTubeChatAuthorBadge | null => {
      const renderer = asRecord(asRecord(badge)?.liveChatAuthorBadgeRenderer);
      if (!renderer) return null;
      const icon = asRecord(renderer.icon);
      const iconType = cleanInlineText(icon?.iconType).toUpperCase();
      if (iconType === 'OWNER') {
        isOwner = true;
        return null;
      }
      const label = cleanInlineText(renderer.tooltip) ||
        getAccessibilityLabel(renderer) ||
        getAccessibilityLabel(renderer.customThumbnail) ||
        iconType;
      if (!label) return null;
      const iconUrl = getThumbnailUrl(renderer.customThumbnail);
      const kind = iconType === 'MODERATOR'
        ? 'moderator' as const
        : iconType === 'VERIFIED'
          ? 'verified' as const
          : iconType === 'SPONSOR' || iconType === 'MEMBER' || iconUrl
            ? 'member' as const
            : undefined;
      return {
        ...(iconUrl ? { iconUrl } : {}),
        ...(kind ? { kind } : {}),
        label
      };
    })
    .filter((badge): badge is YouTubeChatAuthorBadge => Boolean(badge));
  return { badges, isOwner };
}

function parseTopFanRank(value: unknown): 1 | 2 | 3 | undefined {
  const visited = new WeakSet<object>();

  const scan = (candidate: unknown): 1 | 2 | 3 | undefined => {
    if (typeof candidate === 'string') {
      const match = cleanInlineText(candidate).match(/^#\s*([1-3])$/);
      return match ? Number(match[1]) as 1 | 2 | 3 : undefined;
    }
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) return undefined;

    visited.add(candidate);
    const children = Array.isArray(candidate) ? candidate : Object.values(candidate);
    for (const child of children) {
      const rank = scan(child);
      if (rank) return rank;
    }
    return undefined;
  };

  return scan(value);
}

function parseColors(renderer: DataRecord): YouTubeChatMessageColors | undefined {
  const colors: YouTubeChatMessageColors = {};
  assignColor(colors, 'authorName', renderer.authorNameTextColor);
  assignColor(colors, 'background', renderer.backgroundColor);
  assignColor(colors, 'bodyBackground', firstDefined(renderer.bodyBackgroundColor, renderer.moneyChipBackgroundColor));
  assignColor(colors, 'headerBackground', renderer.headerBackgroundColor);
  assignColor(colors, 'headerText', renderer.headerTextColor);
  assignColor(colors, 'text', firstDefined(renderer.bodyTextColor, renderer.moneyChipTextColor, renderer.textColor));
  assignColor(colors, 'timestamp', renderer.timestampColor);
  return Object.keys(colors).length ? colors : undefined;
}

function assignColor(
  colors: YouTubeChatMessageColors,
  key: keyof YouTubeChatMessageColors,
  value: unknown
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  const integer = Math.trunc(value);
  if (integer < -0x80000000 || integer > 0xffffffff) return;
  colors[key] = integer >>> 0;
}

function parseFormattedText(value: unknown): ParsedFormattedText {
  if (typeof value === 'string') {
    const text = cleanRunText(value);
    return text ? { plainText: cleanPlainText(text), runs: [{ text, type: 'text' }] } : emptyFormattedText();
  }

  const formatted = asRecord(value);
  if (!formatted) return emptyFormattedText();
  const simpleText = cleanRunText(formatted.simpleText);
  if (simpleText) {
    return {
      plainText: cleanPlainText(simpleText),
      runs: [{ text: simpleText, type: 'text' }]
    };
  }

  const content = cleanRunText(formatted.content);
  if (content) {
    return {
      plainText: cleanPlainText(content),
      runs: [{ text: content, type: 'text' }]
    };
  }

  if (!Array.isArray(formatted.runs)) return emptyFormattedText();
  const runs: YouTubeChatRichRun[] = [];
  for (const rawRun of formatted.runs) {
    const run = asRecord(rawRun);
    if (!run) continue;
    const emoji = asRecord(run.emoji);
    if (emoji) {
      const emojiId = getNonEmptyString(emoji.emojiId);
      const shortcuts = parseShortcuts(emoji.shortcuts);
      const imageUrl = getThumbnailUrl(emoji.image);
      const alt = shortcuts[0] || getAccessibilityLabel(emoji.image) || emojiId || 'Emoji';
      if (imageUrl) {
        runs.push({
          alt,
          ...(emojiId ? { emojiId } : {}),
          imageUrl,
          shortcuts,
          type: 'emoji'
        });
      } else if (alt) {
        runs.push({ text: alt, type: 'text' });
      }
      continue;
    }

    const text = cleanRunText(run.text);
    if (!text) continue;
    const href = getSafeRunHref(run);
    runs.push(href ? { href, text, type: 'text' } : { text, type: 'text' });
  }

  return {
    plainText: cleanPlainText(runs.map((run) => run.type === 'text' ? run.text : run.alt).join('')),
    runs
  };
}

function parseFirstFormattedText(...values: unknown[]): ParsedFormattedText {
  for (const value of values) {
    const parsed = parseFormattedText(value);
    if (parsed.runs.length || parsed.plainText) return parsed;
  }
  return emptyFormattedText();
}

function emptyFormattedText(): ParsedFormattedText {
  return { plainText: '', runs: [] };
}

function getFormattedPlainText(value: unknown): string {
  return parseFormattedText(value).plainText;
}

function parseShortcuts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((shortcut) => cleanInlineText(shortcut))
    .filter(Boolean);
}

function getSafeRunHref(run: DataRecord): string {
  const navigation = asRecord(run.navigationEndpoint);
  const commandMetadata = asRecord(navigation?.commandMetadata);
  const webMetadata = asRecord(commandMetadata?.webCommandMetadata);
  const urlEndpoint = asRecord(navigation?.urlEndpoint);
  return getSafeHttpsUrl(urlEndpoint?.url || webMetadata?.url);
}

function getThumbnailUrl(value: unknown): string {
  const record = asRecord(value);
  if (!record) return '';
  const image = asRecord(record.image) || asRecord(asRecord(record.avatarViewModel)?.image);
  const thumbnails = Array.isArray(record.thumbnails)
    ? record.thumbnails
    : Array.isArray(record.sources)
      ? record.sources
      : Array.isArray(image?.thumbnails)
        ? image.thumbnails
        : Array.isArray(image?.sources)
          ? image.sources
          : [];
  if (!Array.isArray(thumbnails)) return '';

  for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
    const thumbnail = asRecord(thumbnails[index]);
    const url = getSafeHttpsUrl(thumbnail?.url);
    if (url) return url;
  }
  return '';
}

function getAccessibilityLabel(value: unknown): string {
  const record = asRecord(value);
  if (!record) return '';
  const accessibility = asRecord(record.accessibility);
  const accessibilityData = asRecord(accessibility?.accessibilityData) || asRecord(record.accessibilityData);
  return cleanInlineText(accessibilityData?.label);
}

function getSafeHttpsUrl(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';
  try {
    const url = new URL(candidate, 'https://www.youtube.com');
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function parseTimestampUsec(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}

function parseGiftCount(value: unknown): number | undefined {
  const count = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isFinite(count)) return undefined;
  const integer = Math.trunc(count);
  return Number.isSafeInteger(integer) && integer >= 1 ? integer : undefined;
}

function rememberContinuationTimeout(value: unknown, state: ParserState): void {
  if (!Array.isArray(value)) return;
  for (const continuation of value) {
    const record = asRecord(continuation);
    if (!record) continue;
    for (const key of [
      'invalidationContinuationData',
      'timedContinuationData',
      'reloadContinuationData'
    ]) {
      const data = asRecord(record[key]);
      if (!data) continue;
      const timeout = typeof data.timeoutMs === 'number' ? Math.trunc(data.timeoutMs) : NaN;
      if (Number.isFinite(timeout) && timeout >= 0) {
        state.continuationTimeoutMs = timeout;
        return;
      }
    }
  }
}

function getRendererEntry(item: DataRecord): [string, unknown] | null {
  for (const [key, value] of Object.entries(item)) {
    if (/(?:Renderer|ViewModel)$/.test(key) && asRecord(value)) return [key, value];
  }
  return null;
}

function pushAction(
  state: ParserState,
  action: YouTubeChatFeedAction,
  replayOffsetMs?: number
): void {
  state.actions.push(replayOffsetMs === undefined ? action : { ...action, replayOffsetMs });
}

function parseReplayOffsetMs(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : typeof value === 'number'
      ? value
      : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function rememberCompatibilityWarning(
  state: ParserState,
  key: string,
  unreadableFeed = false
): void {
  if (unreadableFeed) state.unreadableFeed = true;
  if (!key) return;
  state.compatibilityWarnings.add(key);
}

function cleanInlineText(value: unknown): string {
  return typeof value === 'string'
    ? sanitizeControlCharacters(value, false).replace(/\s+/g, ' ').trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(Math.trunc(value))
      : '';
}

function cleanRunText(value: unknown): string {
  return typeof value === 'string'
    ? sanitizeControlCharacters(value, true)
    : '';
}

function sanitizeControlCharacters(value: string, preserveWhitespace: boolean): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0x7f) continue;
    if (code >= 0x20) {
      result += character;
      continue;
    }
    if (preserveWhitespace && (code === 0x09 || code === 0x0a || code === 0x0d)) {
      result += character;
    } else if (!preserveWhitespace) {
      result += ' ';
    }
  }
  return result;
}

function cleanPlainText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

function asRecord(value: unknown): DataRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord
    : null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}
