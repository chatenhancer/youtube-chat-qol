export type PlaygroundLogLevel = 'error' | 'info' | 'warn';
export type PlaygroundLogValue = boolean | number | string | undefined;
export type PlaygroundLogDetails = Record<string, PlaygroundLogValue>;

const LOG_PREFIX = '[playground]';
const MAX_LOG_ERROR_MESSAGE_LENGTH = 500;

export function logPlaygroundEvent(
  event: string,
  details: PlaygroundLogDetails = {},
  level: PlaygroundLogLevel = 'info'
): void {
  const payload = {
    event,
    service: 'chat-enhancer-playground',
    ...compactDetails(details)
  };

  getConsoleMethod(level)(`${LOG_PREFIX} ${event}`, payload);
}

export function hashLogValue(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return `h_${(hash >>> 0).toString(36)}`;
}

export function shortLogId(value: string): string {
  return value.replace(/[^\w-]/g, '').slice(0, 18);
}

export function getLogErrorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export function getLogErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= MAX_LOG_ERROR_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_LOG_ERROR_MESSAGE_LENGTH - 3)}...`;
}

function compactDetails(details: PlaygroundLogDetails): PlaygroundLogDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== '')
  );
}

function getConsoleMethod(level: PlaygroundLogLevel): (message: string, details: unknown) => void {
  switch (level) {
    case 'error':
      return console.error.bind(console);
    case 'warn':
      return console.warn.bind(console);
    case 'info':
      return console.info.bind(console);
  }
}
