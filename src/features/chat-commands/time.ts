/**
 * Time parsing and formatting helpers.
 *
 * Supports timezone aliases and flexible local date/time inputs for /time and
 * /when-style duration commands.
 */
import { getUiLocale, t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';
import { normalizeCommandToken } from './parser';

type DurationUnit = 'day' | 'hour' | 'minute' | 'month' | 'second' | 'year';

export interface TimeZoneOption {
  label: string;
  timeZone: string;
}

export interface ChatCommandTimeZone extends TimeZoneOption {
  aliases: string[];
}

export interface WhenFormatResult {
  detail: string;
  insertion: string;
}

export const CHAT_COMMAND_TIME_ZONES: ChatCommandTimeZone[] = [
  {
    aliases: ['utc'],
    label: 'UTC',
    timeZone: 'UTC'
  },
  {
    aliases: ['tokyo', 'jst'],
    label: 'Tokyo',
    timeZone: 'Asia/Tokyo'
  },
  {
    aliases: ['seoul', 'kst'],
    label: 'Seoul',
    timeZone: 'Asia/Seoul'
  },
  {
    aliases: ['london'],
    label: 'London',
    timeZone: 'Europe/London'
  },
  {
    aliases: ['paris'],
    label: 'Paris',
    timeZone: 'Europe/Paris'
  },
  {
    aliases: ['madrid'],
    label: 'Madrid',
    timeZone: 'Europe/Madrid'
  },
  {
    aliases: ['newyork', 'nyc', 'et', 'eastern'],
    label: 'New York',
    timeZone: 'America/New_York'
  },
  {
    aliases: ['losangeles', 'la', 'pt', 'pacific'],
    label: 'Los Angeles',
    timeZone: 'America/Los_Angeles'
  }
];

const timeZoneByCommandName = createTimeZoneCommandMap();

export function formatTime(value: string): string {
  const normalized = normalizeCommandToken(value);
  const timeZone = normalized ? getTimeZoneOption(normalized) : null;
  if (normalized && !timeZone) return '';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone: timeZone.timeZone } : {}),
    timeZoneName: 'short'
  }).format(new Date());
}

export function formatWhen(value: string): string {
  return formatWhenResult(value)?.insertion || '';
}

export function formatWhenResult(value: string): WhenFormatResult | null {
  const parsed = parseWhenTarget(value);
  if (!parsed) return null;

  const now = new Date();
  const insertion = parsed.target.getTime() >= now.getTime()
    ? formatCalendarDuration(now, parsed.target)
    : formatCalendarDuration(parsed.target, now);
  const target = formatWhenTarget(parsed.target, parsed.timeZone, parsed.includeDate);

  if (parsed.target.getTime() >= now.getTime()) {
    return {
      detail: t('whenUntilTarget', {
        duration: insertion,
        target
      }),
      insertion
    };
  }

  return {
    detail: t('whenSinceTarget', {
      duration: insertion,
      target
    }),
    insertion
  };
}

export function getTimeZoneOption(value: string): TimeZoneOption | null {
  const normalized = normalizeCommandToken(value);
  return normalized ? timeZoneByCommandName.get(normalized) || null : null;
}

function parseLocalTime(value: string): {
  hasSeconds: boolean;
  hour: number;
  meridiem: 'am' | 'pm' | '';
  minute: number;
  second: number;
} | null {
  const match = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i.exec(cleanText(value));
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const second = Number(match[3] || 0);
  const meridiem = (match[4] || '').toLowerCase() as 'am' | 'pm' | '';

  if (minute > 59 || second > 59) return null;
  if (meridiem && (hour < 1 || hour > 12)) return null;
  if (!meridiem && hour > 23) return null;

  return {
    hasSeconds: match[3] !== undefined,
    hour,
    meridiem,
    minute,
    second
  };
}

function parseWhenTarget(value: string): {
  includeDate: boolean;
  target: Date;
  timeZone: TimeZoneOption | null;
} | null {
  const { text, timeZone } = extractWhenTextAndTimeZone(value);
  if (!text) return null;

  const datedTarget = parseDatedWhenTarget(text, timeZone?.timeZone);
  if (datedTarget) return { includeDate: true, target: datedTarget, timeZone };

  const time = parseLocalTime(text);
  if (!time) return null;

  const now = getCurrentDateParts(timeZone?.timeZone);
  const target = createDateTime(
    now.year,
    now.month,
    now.day,
    getLocalHour(time),
    time.minute,
    time.second,
    timeZone?.timeZone
  );
  if (!target) return null;

  return {
    includeDate: false,
    target,
    timeZone
  };
}

function parseDatedWhenTarget(text: string, timeZone?: string): Date | null {
  const dateFirstMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]([\s\S]+))?$/.exec(text);
  if (dateFirstMatch) {
    return createDatedDateTime(
      Number(dateFirstMatch[1]),
      Number(dateFirstMatch[2]),
      Number(dateFirstMatch[3]),
      dateFirstMatch[4] || '',
      timeZone
    );
  }

  const dateLastMatch = /^([\s\S]+?)\s+(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!dateLastMatch) return null;

  return createDatedDateTime(
    Number(dateLastMatch[2]),
    Number(dateLastMatch[3]),
    Number(dateLastMatch[4]),
    dateLastMatch[1],
    timeZone
  );
}

function createDatedDateTime(
  year: number,
  month: number,
  day: number,
  timeText: string,
  timeZone?: string
): Date | null {
  const cleanTimeText = cleanText(timeText);
  const time = cleanTimeText ? parseLocalTime(cleanTimeText) : null;
  if (cleanTimeText && !time) return null;

  return createValidatedDateTime(
    year,
    month,
    day,
    time ? getLocalHour(time) : 0,
    time?.minute || 0,
    time?.second || 0,
    timeZone
  );
}

function extractWhenTextAndTimeZone(value: string): {
  text: string;
  timeZone: TimeZoneOption | null;
} {
  const text = cleanText(value);
  if (!text) {
    return {
      text: '',
      timeZone: null
    };
  }

  const tokens = text.split(/\s+/);
  const firstTimeZone = getTimeZoneOption(tokens[0] || '');
  if (firstTimeZone) {
    return {
      text: cleanText(tokens.slice(1).join(' ')),
      timeZone: firstTimeZone
    };
  }

  const lastTimeZone = getTimeZoneOption(tokens[tokens.length - 1] || '');
  if (lastTimeZone) {
    return {
      text: cleanText(tokens.slice(0, -1).join(' ')),
      timeZone: lastTimeZone
    };
  }

  return {
    text,
    timeZone: null
  };
}

function getLocalHour(parsed: { hour: number; meridiem: 'am' | 'pm' | '' }): number {
  if (parsed.meridiem === 'am') return parsed.hour === 12 ? 0 : parsed.hour;
  if (parsed.meridiem === 'pm') return parsed.hour === 12 ? 12 : parsed.hour + 12;
  return parsed.hour;
}

function createValidatedDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone?: string
): Date | null {
  if (!isValidCalendarDate(year, month, day)) return null;

  const date = createDateTime(year, month, day, hour, minute, second, timeZone);
  if (!date) return null;

  const parts = timeZone
    ? getZonedDateTimeParts(date, timeZone)
    : getLocalDateTimeParts(date);
  if (!matchesDateTimeParts(parts, year, month, day, hour, minute, second)) return null;

  return date;
}

function createDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone?: string
): Date | null {
  if (timeZone) return createZonedDateTime(year, month, day, hour, minute, second, timeZone);
  return createLocalDateTime(year, month, day, hour, minute, second);
}

function createLocalDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const target = new Date();
  target.setFullYear(year, month - 1, day);
  target.setHours(hour, minute, second, 0);
  return target;
}

function createZonedDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date | null {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = desiredUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedDateTimeParts(new Date(instant), timeZone);
    const actualUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const offset = desiredUtc - actualUtc;
    if (offset === 0) break;
    instant += offset;
  }

  const date = new Date(instant);
  return matchesDateTimeParts(getZonedDateTimeParts(date, timeZone), year, month, day, hour, minute, second)
    ? date
    : null;
}

function getCurrentDateParts(timeZone?: string): { day: number; month: number; year: number } {
  if (timeZone) {
    const parts = getZonedDateTimeParts(new Date(), timeZone);
    return {
      day: parts.day,
      month: parts.month,
      year: parts.year
    };
  }

  const now = new Date();
  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function getLocalDateTimeParts(date: Date): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
} {
  return {
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    month: date.getMonth() + 1,
    second: date.getSeconds(),
    year: date.getFullYear()
  };
}

function getZonedDateTimeParts(date: Date, timeZone: string): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
} {
  const values = new Map(
    getTimeZoneFormatter(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const hour = Number(values.get('hour'));
  return {
    day: Number(values.get('day')),
    hour: hour === 24 ? 0 : hour,
    minute: Number(values.get('minute')),
    month: Number(values.get('month')),
    second: Number(values.get('second')),
    year: Number(values.get('year'))
  };
}

function matchesDateTimeParts(
  parts: { day: number; hour: number; minute: number; month: number; second: number; year: number },
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): boolean {
  return (
    parts.year === year &&
    parts.month === month &&
    parts.day === day &&
    parts.hour === hour &&
    parts.minute === minute &&
    parts.second === second
  );
}

function getTimeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US-u-hc-h23', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric'
  });
}

function formatWhenTarget(target: Date, timeZone: TimeZoneOption | null, includeExplicitDate: boolean): string {
  const targetParts = timeZone
    ? getZonedDateTimeParts(target, timeZone.timeZone)
    : getLocalDateTimeParts(target);
  const todayParts = getCurrentDateParts(timeZone?.timeZone);
  const includeDate = includeExplicitDate || !isSameCalendarDay(targetParts, todayParts);
  const includeSeconds = targetParts.second !== 0;
  const formatter = new Intl.DateTimeFormat(getUiLocale(), {
    ...(includeDate ? { day: 'numeric', month: 'short', year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    ...(timeZone ? { timeZone: timeZone.timeZone } : {})
  });
  const targetLabel = formatter.format(target);

  return timeZone
    ? t('whenTargetInPlace', { place: timeZone.label, target: targetLabel })
    : targetLabel;
}

function isSameCalendarDay(
  a: { day: number; month: number; year: number },
  b: { day: number; month: number; year: number }
): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function formatCalendarDuration(start: Date, end: Date): string {
  let cursor = new Date(start);
  let years = 0;
  let months = 0;
  let days = 0;

  for (let next = addCalendarYears(cursor, 1); next.getTime() <= end.getTime(); next = addCalendarYears(cursor, 1)) {
    cursor = next;
    years += 1;
  }

  for (let next = addCalendarMonths(cursor, 1); next.getTime() <= end.getTime(); next = addCalendarMonths(cursor, 1)) {
    cursor = next;
    months += 1;
  }

  for (let next = addCalendarDays(cursor, 1); next.getTime() <= end.getTime(); next = addCalendarDays(cursor, 1)) {
    cursor = next;
    days += 1;
  }

  const totalSeconds = Math.max(0, Math.ceil((end.getTime() - cursor.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const units = getVisibleDurationUnits([
    { count: years, unit: 'year' },
    { count: months, unit: 'month' },
    { count: days, unit: 'day' },
    { count: hours, unit: 'hour' },
    { count: minutes, unit: 'minute' },
    { count: seconds, unit: 'second' }
  ]);
  return formatDurationParts(units.map(({ count, unit }) => formatDurationUnit(count, unit)));
}

function getVisibleDurationUnits(units: { count: number; unit: DurationUnit }[]): { count: number; unit: DurationUnit }[] {
  const nonZeroUnits = units.filter(({ count }) => count > 0);
  return nonZeroUnits.length ? nonZeroUnits.slice(0, 2) : [{ count: 0, unit: 'second' }];
}

function addCalendarYears(date: Date, years: number): Date {
  return createClampedCalendarDate(date, date.getFullYear() + years, date.getMonth());
}

function addCalendarMonths(date: Date, months: number): Date {
  return createClampedCalendarDate(date, date.getFullYear(), date.getMonth() + months);
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createClampedCalendarDate(source: Date, year: number, monthIndex: number): Date {
  const next = new Date(source);
  next.setDate(1);
  next.setFullYear(year, monthIndex, 1);
  next.setDate(Math.min(source.getDate(), getDaysInMonth(next.getFullYear(), next.getMonth())));
  return next;
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDurationUnit(count: number, unit: DurationUnit): string {
  try {
    const formatter = new Intl.NumberFormat(getUiLocale(), {
      style: 'unit',
      unit,
      unitDisplay: 'long'
    });
    return formatter.format(count);
  } catch {
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
  }
}

function formatDurationParts(parts: string[]): string {
  try {
    return new Intl.ListFormat(getUiLocale(), {
      style: 'long',
      type: 'conjunction'
    }).format(parts);
  } catch {
    return parts.join(' ');
  }
}

function createTimeZoneCommandMap(): Map<string, TimeZoneOption> {
  const map = new Map<string, TimeZoneOption>();
  CHAT_COMMAND_TIME_ZONES.forEach(({ aliases, label, timeZone }) => {
    aliases.forEach((alias) => {
      map.set(normalizeCommandToken(alias), { label, timeZone });
    });
  });
  return map;
}
