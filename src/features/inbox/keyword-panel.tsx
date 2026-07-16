/**
 * Inbox keyword panel.
 *
 * Renders the add/remove UI for watched keywords and phrases inside the Inbox
 * card, delegating persistence and chat highlight refresh to callbacks.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { jsx, el } from '../../shared/jsx-dom';
import { createAddIcon, formatBadgeCount } from './icons';
import { keywordsEqual, MAX_KEYWORD_LENGTH, normalizeKeyword } from './matching';
import {
  addInboxKeywordsToState,
  getInboxKeywordsSnapshot,
  removeInboxKeywordsFromState
} from './state';

export interface KeywordPanelOptions {
  onKeywordsChanged: () => void;
}

export function createKeywordToggleButton(): HTMLButtonElement {
  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-header-button ytcq-inbox-keyword-toggle"
      title={t('addKeywords')}
      aria-label={t('addKeywords')}
      aria-expanded="false"
    >
      {createAddIcon()}
      {createKeywordCountBadge()}
    </button>
  );
  refreshKeywordToggle(button);
  return button;
}

export function createKeywordPanel({ onKeywordsChanged }: KeywordPanelOptions): HTMLElement {
  let input!: HTMLInputElement;
  let chips!: HTMLDivElement;
  const handleSubmit = (event: Event): void => {
    event.preventDefault();
    const keyword = normalizeKeyword(input.value);
    if (
      !keyword ||
      getInboxKeywordsSnapshot().some((existing) => keywordsEqual(existing, keyword))
    ) {
      input.value = '';
      return;
    }

    const result = addInboxKeywordsToState([keyword]);
    input.value = '';
    if (!result.added.length) return;

    renderKeywordChips(chips, { onKeywordsChanged });
    onKeywordsChanged();
  };
  const form = el<HTMLFormElement>(
    <form class="ytcq-inbox-keyword-form" onSubmit={handleSubmit}>
      <input
        ref={(element: HTMLInputElement) => (input = element)}
        class="ytcq-inbox-keyword-input"
        type="text"
        maxLength={MAX_KEYWORD_LENGTH}
        placeholder={t('keywordOrPhrase')}
        aria-label={t('keywordOrPhrase')}
      />
      <button type="submit" class="ytcq-inbox-keyword-add">
        {t('add')}
      </button>
    </form>
  );
  const panel = el<HTMLDivElement>(
    <div class="ytcq-inbox-keyword-panel" hidden>
      {form}
      <div ref={(element: HTMLDivElement) => (chips = element)} class="ytcq-inbox-keyword-chips" />
    </div>
  );
  renderKeywordChips(chips, { onKeywordsChanged });
  return panel;
}

export function refreshKeywordToggle(button: HTMLButtonElement): void {
  const count = getInboxKeywordsSnapshot().length;
  const label = t('addKeywordsCount', { count });
  const badge = button.querySelector<HTMLElement>('.ytcq-inbox-keyword-count');

  button.title = label;
  button.setAttribute('aria-label', label);
  button.classList.toggle('ytcq-inbox-keyword-toggle-has-count', count > 0);

  if (badge) {
    badge.textContent = formatBadgeCount(count);
    badge.hidden = count === 0;
  }
}

function createKeywordCountBadge(): HTMLSpanElement {
  return el<HTMLSpanElement>(<span class="ytcq-inbox-keyword-count" />);
}

function renderKeywordChips(
  container: HTMLElement,
  { onKeywordsChanged }: KeywordPanelOptions
): void {
  container.replaceChildren();

  const keywords = getInboxKeywordsSnapshot();
  if (!keywords.length) {
    container.append(
      el<HTMLSpanElement>(<span class="ytcq-inbox-keyword-empty">{t('noKeywords')}</span>)
    );
    return;
  }

  keywords.forEach((keyword) => {
    const removeButton = el<HTMLButtonElement>(
      <button
        type="button"
        class="ytcq-inbox-keyword-remove"
        aria-label={t('removeKeyword', { keyword })}
        onClick={() => {
          const result = removeInboxKeywordsFromState([keyword]);
          if (!result.removed.length) return;

          renderKeywordChips(container, { onKeywordsChanged });
          onKeywordsChanged();
        }}
      >
        {createCloseIcon()}
      </button>
    );

    container.append(
      el<HTMLSpanElement>(
        <span class="ytcq-inbox-keyword-chip">
          <span>{keyword}</span>
          {removeButton}
        </span>
      )
    );
  });
}
