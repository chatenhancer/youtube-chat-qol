import { cleanText } from '../shared/text';

const CHAT_TIMESTAMP_FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ChatTimestampOptions {
  preferElapsed?: boolean;
}

export function getChatTimestampValue(
  timestampText: string,
  referenceTimestamp: number,
  options: ChatTimestampOptions = {}
): number | null {
  const normalized = cleanText(timestampText)
    .replace(/\./g, '')
    .toLocaleUpperCase();
  const match = normalized.match(/^(\d{1,4}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/);
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4];
  const hasThirdPart = Boolean(match[3]);

  if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(third)) return null;
  if (second > 59 || third > 59) return null;

  if (!meridiem && shouldParseElapsedTimestamp(first, options.preferElapsed === true)) {
    return getElapsedTimestampValue(first, second, third, hasThirdPart, referenceTimestamp);
  }

  return getClockTimestampValue(first, second, third, meridiem, referenceTimestamp);
}

export function isLiveChatReplayUrl(value = window.location.href): boolean {
  return /\/live_chat_replay\b/.test(value) || value.includes('live_chat_replay');
}

function shouldParseElapsedTimestamp(first: number, preferElapsed: boolean): boolean {
  return preferElapsed || first > 23;
}

function getElapsedTimestampValue(
  first: number,
  second: number,
  third: number,
  hasThirdPart: boolean,
  referenceTimestamp: number
): number {
  const totalSeconds = hasThirdPart
    ? first * 60 * 60 + second * 60 + third
    : first * 60 + second;
  const date = new Date(referenceTimestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime() + totalSeconds * 1000;
}

function getClockTimestampValue(
  first: number,
  minute: number,
  second: number,
  meridiem: string | undefined,
  referenceTimestamp: number
): number | null {
  let hour = first;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  const date = new Date(referenceTimestamp);
  date.setHours(hour, minute, second, 0);
  let parsedTimestamp = date.getTime();

  if (parsedTimestamp > referenceTimestamp + CHAT_TIMESTAMP_FUTURE_TOLERANCE_MS) {
    parsedTimestamp -= ONE_DAY_MS;
  }

  return parsedTimestamp;
}
