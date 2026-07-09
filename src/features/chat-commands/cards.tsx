/**
 * Chat command floating cards.
 *
 * Shows command help and watched-keyword summaries using the same compact card
 * shell positioned near YouTube's chat input.
 */
import { t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
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
    const cardListeners = new AbortController();

    cleanup = () => {
      cardListeners.abort();
    };

    window.setTimeout(() => {
      const options = { capture: true, signal: cardListeners.signal };
      document.addEventListener('click', handleOutsideClick, options);
      document.addEventListener('keydown', handleKeydown, options);
      window.addEventListener('resize', handleResize, options);
    }, 0);
  };

  const showHelp = (
    commands: ChatCommandDefinition[],
    getCommandDescription: (command: ChatCommandDefinition) => string
  ): void => {
    const card = createBaseCard(t('chatCommands'), t('chatCommands'), close);

    card.append(
      el<HTMLParagraphElement>(<p class="ytcq-command-help-hint">{t('commandHelpHint')}</p>),
      el<HTMLDListElement>(
        <dl class="ytcq-command-help-list">
          {commands.map((command) => [
            <dt>{command.helpLabel}</dt>,
            <dd>{getCommandDescription(command)}</dd>
          ])}
        </dl>
      )
    );
    open(card);
  };

  const showWatchedKeywords = (keywords: string[]): void => {
    const card = createBaseCard(t('watchedKeywords'), t('watchedKeywords'), close);

    card.append(
      el<HTMLParagraphElement>(
        <p class="ytcq-command-help-hint">
          {keywords.length
            ? keywords.map((keyword) => `"${keyword}"`).join(', ')
            : t('noWatchedKeywordsYet')}
        </p>
      )
    );
    open(card);
  };

  return {
    close,
    showHelp,
    showWatchedKeywords
  };
}

function createBaseCard(titleText: string, ariaLabel: string, close: () => void): HTMLElement {
  return el<HTMLElement>(
    <section class="ytcq-command-help-card" role="dialog" aria-label={ariaLabel}>
      <div class="ytcq-command-help-header">
        <div class="ytcq-command-help-title">{titleText}</div>
        {createFloatingCardCloseButton(close)}
      </div>
    </section>
  );
}
