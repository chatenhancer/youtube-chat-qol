/**
 * Inbox keyword panel.
 *
 * Renders the add/remove UI for watched keywords and phrases inside the Inbox
 * card, delegating persistence and chat highlight refresh to callbacks.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';
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
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-header-button ytcq-inbox-keyword-toggle';
  button.title = t('addKeywords');
  button.setAttribute('aria-label', t('addKeywords'));
  button.setAttribute('aria-expanded', 'false');
  button.append(createAddIcon(), createKeywordCountBadge());
  refreshKeywordToggle(button);
  return button;
}

export function createKeywordPanel({ onKeywordsChanged }: KeywordPanelOptions): HTMLElement {
  const panel = ytcqCreateElement('div');
  panel.className = 'ytcq-inbox-keyword-panel';
  panel.hidden = true;

  const form = ytcqCreateElement('form');
  form.className = 'ytcq-inbox-keyword-form';

  const input = ytcqCreateElement('input');
  input.className = 'ytcq-inbox-keyword-input';
  input.type = 'text';
  input.maxLength = MAX_KEYWORD_LENGTH;
  input.placeholder = t('keywordOrPhrase');
  input.setAttribute('aria-label', t('keywordOrPhrase'));

  const addButton = ytcqCreateElement('button');
  addButton.type = 'submit';
  addButton.className = 'ytcq-inbox-keyword-add';
  addButton.textContent = t('add');

  form.append(input, addButton);

  const chips = ytcqCreateElement('div');
  chips.className = 'ytcq-inbox-keyword-chips';
  renderKeywordChips(chips, { onKeywordsChanged });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const keyword = normalizeKeyword(input.value);
    if (!keyword || getInboxKeywordsSnapshot().some((existing) => keywordsEqual(existing, keyword))) {
      input.value = '';
      return;
    }

    const result = addInboxKeywordsToState([keyword]);
    input.value = '';
    if (!result.added.length) return;

    renderKeywordChips(chips, { onKeywordsChanged });
    onKeywordsChanged();
  });

  panel.append(form, chips);
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
  const badge = ytcqCreateElement('span');
  badge.className = 'ytcq-inbox-keyword-count';
  return badge;
}

function renderKeywordChips(container: HTMLElement, { onKeywordsChanged }: KeywordPanelOptions): void {
  container.replaceChildren();

  const keywords = getInboxKeywordsSnapshot();
  if (!keywords.length) {
    const empty = ytcqCreateElement('span');
    empty.className = 'ytcq-inbox-keyword-empty';
    empty.textContent = t('noKeywords');
    container.append(empty);
    return;
  }

  keywords.forEach((keyword) => {
    const chip = ytcqCreateElement('span');
    chip.className = 'ytcq-inbox-keyword-chip';

    const label = ytcqCreateElement('span');
    label.textContent = keyword;

    const removeButton = ytcqCreateElement('button');
    removeButton.type = 'button';
    removeButton.className = 'ytcq-inbox-keyword-remove';
    removeButton.setAttribute('aria-label', t('removeKeyword', { keyword }));
    removeButton.append(createCloseIcon());
    removeButton.addEventListener('click', () => {
      const result = removeInboxKeywordsFromState([keyword]);
      if (!result.removed.length) return;

      renderKeywordChips(container, { onKeywordsChanged });
      onKeywordsChanged();
    });

    chip.append(label, removeButton);
    container.append(chip);
  });
}
