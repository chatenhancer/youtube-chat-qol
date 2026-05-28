/**
 * Time parsing and formatting helpers.
 *
 * Supports timezone aliases and flexible local date/time inputs for /time and
 * /when-style duration commands.
 */
import { getUiLocale } from '../../shared/i18n';
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
  const timeZone = normalized ? timeZoneByCommandName.get(normalized) : null;
  if (normalized && !timeZone) return '';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone: timeZone.timeZone } : {}),
    timeZoneName: 'short'
  }).format(new Date());
}

export function formatWhen(value: string): string {
  const parsed = parseWhenTarget(value);
  if (!parsed) return '';

  const now = new Date();
  return parsed.target.getTime() >= now.getTime()
    ? formatCalendarDuration(now, parsed.target)
    : formatCalendarDuration(parsed.target, now);
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
  target: Date;
} | null {
  const text = cleanText(value);
  if (!text) return null;

  const relativeMatch = /^(tomorrow|yesterday)(?:\s+([\s\S]+))?$/i.exec(text);
  if (relativeMatch) {
    const base = new Date();
    base.setDate(base.getDate() + (relativeMatch[1].toLowerCase() === 'tomorrow' ? 1 : -1));
    const time = relativeMatch[2] ? parseLocalTime(relativeMatch[2]) : null;
    if (relativeMatch[2] && !time) return null;
    return {
      target: createLocalDateTime(
        base.getFullYear(),
        base.getMonth() + 1,
        base.getDate(),
        time ? getLocalHour(time) : 0,
        time?.minute || 0,
        time?.second || 0
      )
    };
  }

  const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]([\s\S]+))?$/.exec(text);
  if (dateMatch) {
    const time = dateMatch[4] ? parseLocalTime(dateMatch[4]) : null;
    if (dateMatch[4] && !time) return null;

    const target = createValidatedLocalDateTime(
      Number(dateMatch[1]),
      Number(dateMatch[2]),
      Number(dateMatch[3]),
      time ? getLocalHour(time) : 0,
      time?.minute || 0,
      time?.second || 0
    );
    if (!target) return null;

    return { target };
  }

  const time = parseLocalTime(text);
  if (!time) return null;

  const now = new Date();
  return {
    target: createLocalDateTime(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      getLocalHour(time),
      time.minute,
      time.second
    )
  };
}

function getLocalHour(parsed: { hour: number; meridiem: 'am' | 'pm' | '' }): number {
  if (parsed.meridiem === 'am') return parsed.hour === 12 ? 0 : parsed.hour;
  if (parsed.meridiem === 'pm') return parsed.hour === 12 ? 12 : parsed.hour + 12;
  return parsed.hour;
}

function createValidatedLocalDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date | null {
  const date = createLocalDateTime(year, month, day, hour, minute, second);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
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
