/** Message appearance presets; keep the stored density values for existing installs. */
export const DEFAULT_MESSAGE_DENSITY = 'default';

export const MESSAGE_DENSITY_OPTIONS = [
  {
    id: DEFAULT_MESSAGE_DENSITY,
    labelMessage: 'messageDensityDefault'
  },
  {
    id: 'compact',
    labelMessage: 'messageDensityCompact'
  },
  {
    id: 'minimal',
    labelMessage: 'messageDensityMinimal'
  }
] as const;

export type MessageDensity = typeof MESSAGE_DENSITY_OPTIONS[number]['id'];

export function isMessageDensity(value: unknown): value is MessageDensity {
  return typeof value === 'string' &&
    MESSAGE_DENSITY_OPTIONS.some((option) => option.id === value);
}

export function setMessageDensity(root: HTMLElement, value: unknown): void {
  if (value === 'compact' || value === 'minimal') root.setAttribute('data-ytcq-message-density', value);
  else root.removeAttribute('data-ytcq-message-density');
}
