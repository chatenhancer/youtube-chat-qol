/**
 * Chat command floating cards.
 *
 * Shows command help and watched-keyword summaries using the same compact card
 * shell positioned near YouTube's chat input.
 */
import { t } from '../../shared/i18n';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { createFloatingCardCloseButton, positionFloatingCardAboveInput } from './floating-card';
import type { ChatCommandDefinition } from './types';

interface CommandCards {
  close(): void;
  showHelp(
    commands: ChatCommandDefinition[],
    getCommandDescription: (command: ChatCommandDefinition) => string
  ): void;
  showWatchedKeywords(keywords: string[]): void;
}

export function createCommandCards(): CommandCards {
  let activeCard: HTMLElement | null = null;
  let cleanup: (() => void) | null = null;

  const close = (): void => {
    cleanup?.();
    cleanup = null;
    activeCard?.remove();
    activeCard = null;
  };

  const open = (card: HTMLElement): void => {
    close();

    document.body.append(card);
    activeCard = card;
    positionFloatingCardAboveInput(card);

    const handleOutsideClick = (event: MouseEvent): void => {
      if (activeCard?.contains(event.target as Node)) return;
      close();
    };
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    const handleResize = (): void => {
      if (activeCard) positionFloatingCardAboveInput(activeCard);
    };

    cleanup = () => {
      document.removeEventListener('click', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeydown, true);
      window.removeEventListener('resize', handleResize, true);
    };

    window.setTimeout(() => {
      document.addEventListener('click', handleOutsideClick, true);
      document.addEventListener('keydown', handleKeydown, true);
      window.addEventListener('resize', handleResize, true);
    }, 0);
  };

  const showHelp = (
    commands: ChatCommandDefinition[],
    getCommandDescription: (command: ChatCommandDefinition) => string
  ): void => {
    const card = createBaseCard(t('chatCommands'), t('chatCommands'), close);

    const hint = ytcqCreateElement('p');
    hint.className = 'ytcq-command-help-hint';
    hint.textContent = t('commandHelpHint');

    const list = ytcqCreateElement('dl');
    list.className = 'ytcq-command-help-list';

    commands.forEach((command) => {
      const term = ytcqCreateElement('dt');
      term.textContent = command.helpLabel;

      const details = ytcqCreateElement('dd');
      details.textContent = getCommandDescription(command);

      list.append(term, details);
    });

    card.append(hint, list);
    open(card);
  };

  const showWatchedKeywords = (keywords: string[]): void => {
    const card = createBaseCard(t('watchedKeywords'), t('watchedKeywords'), close);

    const body = ytcqCreateElement('p');
    body.className = 'ytcq-command-help-hint';
    body.textContent = keywords.length
      ? keywords.map((keyword) => `"${keyword}"`).join(', ')
      : t('noWatchedKeywordsYet');

    card.append(body);
    open(card);
  };

  return {
    close,
    showHelp,
    showWatchedKeywords
  };
}

function createBaseCard(titleText: string, ariaLabel: string, close: () => void): HTMLElement {
  const card = ytcqCreateElement('section');
  card.className = 'ytcq-command-help-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', ariaLabel);

  const header = ytcqCreateElement('div');
  header.className = 'ytcq-command-help-header';

  const title = ytcqCreateElement('div');
  title.className = 'ytcq-command-help-title';
  title.textContent = titleText;

  header.append(title, createFloatingCardCloseButton(close));
  card.append(header);

  return card;
}
