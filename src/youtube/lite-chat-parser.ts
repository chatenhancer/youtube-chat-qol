/**
 * Pure, bounded parser for the small InnerTube live-chat subset used by Lite
 * mode. It deliberately discards continuations, tracking parameters, service
 * endpoints, request metadata, and every other value outside the shared
 * sanitized protocol.
 */
import type {
  LiteChatAction,
  LiteChatAuthor,
  LiteChatAuthorBadge,
  LiteChatMessageColors,
  LiteChatMessageRecord,
  LiteChatRichRun
} from '../features/lite-mode/protocol';

type DataRecord = Record<string, unknown>;

export interface LiteChatParseOptions {
  initial?: boolean;
}

export interface LiteChatParseResult {
  actions: LiteChatAction[];
  compatibilityWarnings: string[];
  continuationTimeoutMs?: number;
  fatalErrors: string[];
  foundChat: boolean;
  unreadableFeed: boolean;
}

const MAX_ACTIONS = 500;
const MAX_BADGES = 16;
const MAX_PARSE_DIAGNOSTICS = 32;
const MAX_GIFT_COUNT = 10_000;
const MAX_ID_LENGTH = 200;
const MAX_PLAIN_TEXT_LENGTH = 8_000;
const MAX_RUNS = 120;
const MAX_SHORTCUTS = 16;
const MAX_TEXT_LENGTH = 4_000;
const MAX_URL_LENGTH = 2_048;
const MAX_WALK_DEPTH = 12;
const MAX_WALK_NODES = 2_500;
const MAX_TIMEOUT_MS = 2 * 60 * 1_000;

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
  actions: LiteChatAction[];
  compatibilityWarnings: Set<string>;
  continuationTimeoutMs?: number;
  fatalErrors: Set<string>;
  foundChat: boolean;
  processedActions: WeakSet<object>;
  unreadableFeed: boolean;
  visited: WeakSet<object>;
  walkedNodes: number;
}

interface ParsedFormattedText {
  plainText: string;
  runs: LiteChatRichRun[];
}

interface ParsedAuthorBadges {
  badges: LiteChatAuthorBadge[];
  isOwner: boolean;
}

export function parseLiteChatPayload(
  value: unknown,
  options: LiteChatParseOptions = {}
): LiteChatParseResult {
  const state: ParserState = {
    actions: [],
    compatibilityWarnings: new Set<string>(),
    fatalErrors: new Set<string>(),
    foundChat: false,
    processedActions: new WeakSet<object>(),
    unreadableFeed: false,
    visited: new WeakSet<object>(),
    walkedNodes: 0
  };

  walkForChatContainers(value, state, 0, options.initial !== true);

  if (options.initial && state.foundChat) {
    const latestActions = state.actions.slice(-(MAX_ACTIONS - 1));
    state.actions.length = 0;
    state.actions.push({ type: 'reset' }, ...latestActions);
  }

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
  depth: number,
  parseRootActions = false
): void {
  if (depth > MAX_WALK_DEPTH || state.walkedNodes >= MAX_WALK_NODES) return;
  if (Array.isArray(value)) {
    state.walkedNodes += 1;
    value.slice(0, MAX_ACTIONS).forEach((item) => walkForChatContainers(item, state, depth + 1));
    return;
  }

  const record = asRecord(value);
  if (!record || state.visited.has(record)) return;
  state.visited.add(record);
  state.walkedNodes += 1;
  if (parseRootActions) parseActionArray(record.actions, state);

  for (const [key, child] of Object.entries(record)) {
    if (key === 'liveChatContinuation') {
      parseLiveChatContinuation(child, state);
      continue;
    }
    if (key === 'liveChatRenderer') {
      parseInitialLiveChatRenderer(child, state, 0);
      continue;
    }
    if (key === 'actions') continue;
    walkForChatContainers(child, state, depth + 1);
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

function parseInitialLiveChatRenderer(value: unknown, state: ParserState, depth: number): void {
  const record = asRecord(value);
  if (!record || state.visited.has(record)) return;
  state.visited.add(record);
  state.walkedNodes += 1;
  state.foundChat = true;

  parseActionArray(record.actions, state);
  rememberContinuationTimeout(record.continuations, state);
  for (const [key, child] of Object.entries(record)) {
    if (key === 'actions' || key === 'continuations') continue;
    findInitialItemLists(child, state, depth + 1);
  }
}

function findInitialItemLists(value: unknown, state: ParserState, depth: number): void {
  if (depth > MAX_WALK_DEPTH || state.walkedNodes >= MAX_WALK_NODES) return;
  if (Array.isArray(value)) {
    state.walkedNodes += 1;
    value.slice(0, MAX_ACTIONS).forEach((item) => findInitialItemLists(item, state, depth + 1));
    return;
  }

  const record = asRecord(value);
  if (!record || state.visited.has(record)) return;
  state.visited.add(record);
  state.walkedNodes += 1;

  for (const [key, child] of Object.entries(record)) {
    if (key === 'liveChatItemListRenderer') {
      const itemList = asRecord(child);
      if (itemList && Array.isArray(itemList.contents)) {
        itemList.contents.slice(0, MAX_ACTIONS).forEach((item) => parseFeedItem(item, state));
      }
      if (itemList) {
        parseActionArray(itemList.actions, state);
        rememberContinuationTimeout(itemList.continuations, state);
      }
      continue;
    }
    findInitialItemLists(child, state, depth + 1);
  }
}

function parseActionArray(
  value: unknown,
  state: ParserState,
  replayOffsetMs?: number
): void {
  if (!Array.isArray(value)) return;
  value.slice(0, MAX_ACTIONS).forEach((action) => parseAction(action, state, replayOffsetMs));
  if (value.length > MAX_ACTIONS) rememberFatalError(state, 'parser:input-action-limit');
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
      const targetId = cleanInlineText(replacement.targetItemId, MAX_ID_LENGTH);
      if (targetId) pushAction(state, { id: targetId, type: 'remove' }, replayOffsetMs);
      else rememberCompatibilityWarning(state, 'replaceChatItemAction:missing-target');
      parseFeedItem(replacement.replacementItem, state, replayOffsetMs);
      continue;
    }

    if (key === 'removeChatItemAction' || key === 'markChatItemAsDeletedAction') {
      const targetId = cleanInlineText(asRecord(payload)?.targetItemId, MAX_ID_LENGTH);
      if (targetId) pushAction(state, { id: targetId, type: 'remove' }, replayOffsetMs);
      else rememberCompatibilityWarning(state, `${cleanInlineText(key, 120)}:missing-target`);
      continue;
    }

    if (key === 'markChatItemsByAuthorAsDeletedAction' || key === 'removeChatItemByAuthorAction') {
      const channelId = cleanInlineText(asRecord(payload)?.externalChannelId, MAX_ID_LENGTH);
      if (channelId) {
        pushAction(state, { channelId, type: 'remove-author' }, replayOffsetMs);
      }
      else rememberCompatibilityWarning(state, `${cleanInlineText(key, 120)}:missing-author`);
      continue;
    }

    // Unknown auxiliary commands are left to YouTube. Feed-looking commands
    // are recorded for diagnostics, and add-like commands contribute to feed
    // health because they may contain rows Lite could not read.
    if (KNOWN_NON_FEED_ACTIONS.has(key)) continue;
    if (/ChatItems?.*Action$/.test(key)) {
      rememberCompatibilityWarning(
        state,
        `feed-action:${cleanInlineText(key, 120)}`,
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
    rememberCompatibilityWarning(state, `feed:${cleanInlineText(rendererKey, 120)}`, true);
    return;
  }

  const record = parseMessageRenderer(rendererKey, rendererValue);
  if (!record) {
    rememberCompatibilityWarning(state, `${cleanInlineText(rendererKey, 120)}:invalid`, true);
    return;
  }
  pushAction(state, { record, type: 'upsert' }, replayOffsetMs);
}

function parseMessageRenderer(rendererKey: string, value: unknown): LiteChatMessageRecord | null {
  const renderer = asRecord(value);
  if (!renderer) return null;
  const id = cleanInlineText(renderer.id, MAX_ID_LENGTH);
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
    const alt = cleanInlineText(renderer.giftImageA11yLabel, 500);
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

function compactRecord(record: LiteChatMessageRecord): LiteChatMessageRecord {
  if (!record.author) delete record.author;
  if (!record.colors || Object.keys(record.colors).length === 0) delete record.colors;
  if (!record.timestampText) delete record.timestampText;
  if (!record.timestampUsec) delete record.timestampUsec;
  return record;
}

function parseAuthor(primary: DataRecord, fallback?: DataRecord): LiteChatAuthor | undefined {
  const name = getFormattedPlainText(primary.authorName) || getFormattedPlainText(fallback?.authorName);
  if (!name) return undefined;

  const channelId = cleanInlineText(
    primary.authorExternalChannelId || fallback?.authorExternalChannelId,
    MAX_ID_LENGTH
  );
  const avatarUrl = getThumbnailUrl(primary.authorPhoto) ||
    getThumbnailUrl(primary.authorAvatar) ||
    getThumbnailUrl(fallback?.authorPhoto) ||
    getThumbnailUrl(fallback?.authorAvatar);
  const { badges, isOwner } = parseBadges(primary.authorBadges || fallback?.authorBadges);
  return {
    ...(avatarUrl ? { avatarUrl } : {}),
    badges,
    ...(channelId ? { channelId } : {}),
    ...(isOwner ? { isOwner: true } : {}),
    name
  };
}

function parseBadges(value: unknown): ParsedAuthorBadges {
  if (!Array.isArray(value)) return { badges: [], isOwner: false };
  let isOwner = false;
  const badges = value.slice(0, MAX_BADGES)
    .map((badge): LiteChatAuthorBadge | null => {
      const renderer = asRecord(asRecord(badge)?.liveChatAuthorBadgeRenderer);
      if (!renderer) return null;
      const icon = asRecord(renderer.icon);
      const iconType = cleanInlineText(icon?.iconType, 120).toUpperCase();
      if (iconType === 'OWNER') {
        isOwner = true;
        return null;
      }
      const label = cleanInlineText(renderer.tooltip, 200) ||
        getAccessibilityLabel(renderer) ||
        getAccessibilityLabel(renderer.customThumbnail) ||
        iconType;
      if (!label) return null;
      const iconUrl = getThumbnailUrl(renderer.customThumbnail);
      const kind = iconType === 'MODERATOR'
        ? 'moderator' as const
        : iconType === 'VERIFIED'
          ? 'verified' as const
          : undefined;
      return {
        ...(iconUrl ? { iconUrl } : {}),
        ...(kind ? { kind } : {}),
        label
      };
    })
    .filter((badge): badge is LiteChatAuthorBadge => Boolean(badge));
  return { badges, isOwner };
}

function parseColors(renderer: DataRecord): LiteChatMessageColors | undefined {
  const colors: LiteChatMessageColors = {};
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
  colors: LiteChatMessageColors,
  key: keyof LiteChatMessageColors,
  value: unknown
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  const integer = Math.trunc(value);
  if (integer < -0x80000000 || integer > 0xffffffff) return;
  colors[key] = integer >>> 0;
}

function parseFormattedText(value: unknown): ParsedFormattedText {
  if (typeof value === 'string') {
    const text = cleanRunText(value, MAX_TEXT_LENGTH);
    return text ? { plainText: cleanPlainText(text), runs: [{ text, type: 'text' }] } : emptyFormattedText();
  }

  const formatted = asRecord(value);
  if (!formatted) return emptyFormattedText();
  const simpleText = cleanRunText(formatted.simpleText, MAX_TEXT_LENGTH);
  if (simpleText) {
    return {
      plainText: cleanPlainText(simpleText),
      runs: [{ text: simpleText, type: 'text' }]
    };
  }

  const content = cleanRunText(formatted.content, MAX_TEXT_LENGTH);
  if (content) {
    return {
      plainText: cleanPlainText(content),
      runs: [{ text: content, type: 'text' }]
    };
  }

  if (!Array.isArray(formatted.runs)) return emptyFormattedText();
  const runs: LiteChatRichRun[] = [];
  for (const rawRun of formatted.runs.slice(0, MAX_RUNS)) {
    const run = asRecord(rawRun);
    if (!run) continue;
    const emoji = asRecord(run.emoji);
    if (emoji) {
      const emojiId = cleanInlineText(emoji.emojiId, 200);
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

    const text = cleanRunText(run.text, MAX_TEXT_LENGTH);
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
  return value.slice(0, MAX_SHORTCUTS)
    .map((shortcut) => cleanInlineText(shortcut, 120))
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

  for (let index = Math.min(thumbnails.length, 20) - 1; index >= 0; index -= 1) {
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
  return cleanInlineText(accessibilityData?.label, 400);
}

function getSafeHttpsUrl(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim().slice(0, MAX_URL_LENGTH) : '';
  if (!candidate) return '';
  try {
    const url = new URL(candidate, 'https://www.youtube.com');
    return url.protocol === 'https:' ? url.href.slice(0, MAX_URL_LENGTH) : '';
  } catch {
    return '';
  }
}

function parseTimestampUsec(value: unknown): string | undefined {
  const timestamp = cleanInlineText(value, 24);
  return /^\d{1,24}$/.test(timestamp) ? timestamp : undefined;
}

function parseGiftCount(value: unknown): number | undefined {
  const count = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isFinite(count)) return undefined;
  const integer = Math.trunc(count);
  return integer >= 1 && integer <= MAX_GIFT_COUNT ? integer : undefined;
}

function rememberContinuationTimeout(value: unknown, state: ParserState): void {
  if (!Array.isArray(value)) return;
  for (const continuation of value.slice(0, 20)) {
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
      if (Number.isFinite(timeout) && timeout >= 0 && timeout <= MAX_TIMEOUT_MS) {
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
  action: LiteChatAction,
  replayOffsetMs?: number
): void {
  if (state.actions.length >= MAX_ACTIONS) {
    rememberFatalError(state, 'parser:output-action-limit');
    return;
  }
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
  if (!key || state.compatibilityWarnings.size >= MAX_PARSE_DIAGNOSTICS) return;
  state.compatibilityWarnings.add(key);
}

function rememberFatalError(state: ParserState, key: string): void {
  if (!key || state.fatalErrors.size >= MAX_PARSE_DIAGNOSTICS) return;
  state.fatalErrors.add(key);
}

function cleanInlineText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? sanitizeControlCharacters(value.slice(0, maxLength * 2), false).replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : typeof value === 'number' && Number.isFinite(value)
      ? String(Math.trunc(value)).slice(0, maxLength)
      : '';
}

function cleanRunText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? sanitizeControlCharacters(value.slice(0, maxLength * 2), true).slice(0, maxLength)
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
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAIN_TEXT_LENGTH);
}

function asRecord(value: unknown): DataRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord
    : null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}
