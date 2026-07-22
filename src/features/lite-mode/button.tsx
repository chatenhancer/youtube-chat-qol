/**
 * Lite mode header button.
 *
 * Keeps the always-available performance toggle ordered with Chat Enhancer's
 * other header controls while tolerating YouTube replacing the chat header.
 */
import type { FeatureMutationBatch, SaveOptions } from '../../content/dispatcher';
import { createBoltIcon } from '../../shared/icons';
import { t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import type { Options } from '../../shared/options';
import { getOptions } from '../../shared/state';
import { CHAT_HEADER_SELECTOR } from '../../youtube/selectors';

export const LITE_MODE_BUTTON_CLASS = 'ytcq-lite-mode-button';
export const LITE_MODE_BUTTON_ACTIVE_CLASS = 'ytcq-lite-mode-button-active';
export const LITE_MODE_BUTTON_SELECTOR = `.${LITE_MODE_BUTTON_CLASS}`;

const LITE_MODE_BUTTON_OWNER_ID = `${Date.now()}-${Math.random()}`;

let saveOptions: SaveOptions = () => {};
let liteModeButtonWireTimer: number | null = null;

export function initLiteModeButton(callback: SaveOptions): void {
  saveOptions = callback;
}

export function scheduleLiteModeButtonWire(): void {
  if (liteModeButtonWireTimer !== null) return;

  liteModeButtonWireTimer = window.setTimeout(() => {
    liteModeButtonWireTimer = null;
    wireLiteModeButton();
  }, 0);
}

export function wireLiteModeButton(): void {
  const header = document.querySelector<HTMLElement>(CHAT_HEADER_SELECTOR);
  if (!header) return;

  const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>(LITE_MODE_BUTTON_SELECTOR));
  const ownedButton = buttons.find(
    (button) => button.dataset.ytcqLiteModeOwner === LITE_MODE_BUTTON_OWNER_ID
  );
  buttons.forEach((button) => {
    if (button !== ownedButton) button.remove();
  });

  const button = ownedButton || createLiteModeButton();
  moveLiteModeButton(button, header, getLiteModeHeaderAnchor(header));
  refreshLiteModeButton(getOptions());
}

export function refreshLiteModeButton(
  options: Pick<Options, 'liteModeEnabled'> = getOptions()
): void {
  document.querySelectorAll<HTMLButtonElement>(LITE_MODE_BUTTON_SELECTOR).forEach((button) => {
    const enabled = options.liteModeEnabled;
    const label = t(enabled ? 'disableLiteMode' : 'enableLiteMode');
    button.classList.toggle(LITE_MODE_BUTTON_ACTIVE_CLASS, enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}

export function cleanupLiteModeButton(): void {
  if (liteModeButtonWireTimer !== null) {
    window.clearTimeout(liteModeButtonWireTimer);
    liteModeButtonWireTimer = null;
  }
  document.querySelectorAll(LITE_MODE_BUTTON_SELECTOR).forEach((button) => button.remove());
}

export function shouldWireLiteModeButton({
  addedElements,
  mutations
}: FeatureMutationBatch): boolean {
  return (
    mutations.some((mutation) => {
      return (
        mutation.type === 'childList' &&
        mutation.target instanceof Element &&
        Boolean(mutation.target.closest(CHAT_HEADER_SELECTOR))
      );
    }) ||
    addedElements.some((element) => {
      return (
        element.matches(CHAT_HEADER_SELECTOR) ||
        Boolean(element.querySelector(CHAT_HEADER_SELECTOR))
      );
    })
  );
}

function createLiteModeButton(): HTMLButtonElement {
  const handleClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    saveOptions({ liteModeEnabled: !getOptions().liteModeEnabled });
  };

  return el<HTMLButtonElement>(
    <button
      type="button"
      class={LITE_MODE_BUTTON_CLASS}
      data-ytcq-lite-mode-owner={LITE_MODE_BUTTON_OWNER_ID}
      title={t('enableLiteMode')}
      aria-label={t('enableLiteMode')}
      aria-pressed="false"
      onClickCapture={handleClick}
    >
      {createBoltIcon()}
    </button>
  );
}

function getLiteModeHeaderAnchor(header: HTMLElement): HTMLElement | null {
  return (
    header.querySelector<HTMLElement>('.ytcq-games-button') ||
    header.querySelector<HTMLElement>('.ytcq-inbox-button') ||
    header.querySelector<HTMLElement>('#live-chat-header-context-menu') ||
    getDirectHeaderChild(
      header,
      header.querySelector<HTMLElement>('button[aria-label="More options"]')
    ) ||
    getDirectHeaderChild(
      header,
      header.querySelector<HTMLElement>('button[title="More options"]')
    ) ||
    header.querySelector<HTMLElement>('#close-button')
  );
}

function getDirectHeaderChild(
  header: HTMLElement,
  element: HTMLElement | null
): HTMLElement | null {
  if (!element) return null;

  let current: HTMLElement | null = element;
  while (current && current.parentElement !== header) {
    current = current.parentElement;
  }
  return current;
}

function moveLiteModeButton(
  button: HTMLButtonElement,
  header: HTMLElement,
  anchor: HTMLElement | null
): void {
  if (anchor && anchor !== button && button.nextElementSibling !== anchor) {
    anchor.before(button);
  } else if (!anchor && button.parentElement !== header) {
    header.append(button);
  }
}
