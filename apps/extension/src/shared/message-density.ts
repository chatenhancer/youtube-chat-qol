/** Shared message-density registry for native and Lite chat feeds. */
export const DEFAULT_MESSAGE_DENSITY = 'default';

export const MESSAGE_DENSITY_OPTIONS = [
  {
    id: DEFAULT_MESSAGE_DENSITY,
    labelMessage: 'messageDensityDefault'
  },
  {
    id: 'compact',
    labelMessage: 'messageDensityCompact'
  }
] as const;

export type MessageDensity = typeof MESSAGE_DENSITY_OPTIONS[number]['id'];

export function isMessageDensity(value: unknown): value is MessageDensity {
  return typeof value === 'string' &&
    MESSAGE_DENSITY_OPTIONS.some((option) => option.id === value);
}

export function setMessageDensity(root: HTMLElement, value: unknown): void {
  if (value === 'compact') root.setAttribute('data-ytcq-message-density', value);
  else root.removeAttribute('data-ytcq-message-density');
}
