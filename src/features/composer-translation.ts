/**
 * Outgoing message translation composer.
 *
 * Adds a compact translate control beside YouTube's emoji button. When enabled,
 * the current chat draft is translated after a debounce and only replaced if
 * the draft has not changed while the request was in flight. The source draft
 * is mirrored so continued typing after a replacement retranslates the full
 * original text instead of mixing translated and untranslated fragments.
 */
import { getLocalizedLanguageLabel, t } from '../shared/i18n';
import { createTranslateIcon } from '../shared/icons';
import { LANGUAGE_OPTIONS } from '../shared/languages';
import type { Options } from '../shared/options';
import { getOptions } from '../shared/state';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import {
  findChatInput,
  getChatInputSnapshot,
  getChatInputText,
  replaceNodesInChatInput
} from '../youtube/chat-input';
import { translateTranslationPlan } from './chat-commands/translate-text';
import { createTranslationPlanFromNodes, type TranslationPlan } from './translation/protected-placeholders';

type SaveOptions = (values: Partial<Options>) => void;

const CONTROL_CLASS = 'ytcq-composer-translate-control';
const BUTTON_CLASS = 'ytcq-composer-translate-button';
const PANEL_CLASS = 'ytcq-composer-translate-panel';
const SELECT_CLASS = 'ytcq-composer-translate-select';
const INPUT_RENDERER_SELECTOR = 'yt-live-chat-message-input-renderer';
const EMOJI_BUTTON_SELECTOR = '#emoji-picker-button';
const TRANSLATION_DEBOUNCE_MS = 850;

let saveOptions: SaveOptions = () => {};
let button: HTMLButtonElement | null = null;
let panel: HTMLElement | null = null;
let select: HTMLSelectElement | null = null;
let wireFrame = 0;
let debounceTimer = 0;
let requestSerial = 0;
let activeLanguage = '';
let replacingDraft = false;
let lastSourceText = '';
let lastSourceNodes: Node[] = [];
let lastSourcePlanText = '';
let lastTranslatedText = '';

export function initComposerTranslation(callback: SaveOptions): void {
  saveOptions = callback;
  scheduleComposerTranslationWire();
  document.addEventListener('input', handleDocumentInput, true);
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('keydown', handleDocumentKeydown, true);
}

export function scheduleComposerTranslationWire(): void {
  if (wireFrame) return;
  wireFrame = window.requestAnimationFrame(() => {
    wireFrame = 0;
    wireComposerTranslationControl();
  });
}

export function refreshComposerTranslation(): void {
  const nextLanguage = getOptions().composerTranslateLanguage;
  if (nextLanguage !== activeLanguage) {
    activeLanguage = nextLanguage;
    resetDraftMemory();
    requestSerial += 1;
  }

  updateButtonState();
  if (select) select.value = nextLanguage;
  if (nextLanguage) {
    scheduleDraftTranslation();
  } else {
    window.clearTimeout(debounceTimer);
    debounceTimer = 0;
  }
}

export function resetComposerTranslation(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = 0;
  requestSerial += 1;
  resetDraftMemory();
  closePanel();
  refreshComposerTranslation();
}

function wireComposerTranslationControl(): void {
  const emojiButton = document.querySelector<HTMLElement>(EMOJI_BUTTON_SELECTOR);
  if (!emojiButton) return;

  const currentControl = button?.closest<HTMLElement>(`.${CONTROL_CLASS}`) || null;
  if (currentControl?.isConnected && currentControl.parentElement === emojiButton) {
    updateButtonState();
    return;
  }

  currentControl?.remove();
  emojiButton.querySelectorAll(`:scope > .${CONTROL_CLASS}`).forEach((control) => control.remove());

  const control = document.createElement('div');
  control.className = CONTROL_CLASS;
  control.append(createButton(), createPanel());
  emojiButton.classList.add('ytcq-composer-translate-host');
  emojiButton.prepend(control);
  updateButtonState();
}

function createButton(): HTMLButtonElement {
  button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.append(createTranslateIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePanel();
  });
  return button;
}

function createPanel(): HTMLElement {
  panel = document.createElement('div');
  panel.className = PANEL_CLASS;
  panel.hidden = true;

  const label = document.createElement('label');
  label.className = 'ytcq-composer-translate-label';
  label.textContent = t('translateDraftTo');

  select = document.createElement('select');
  select.className = SELECT_CLASS;
  select.setAttribute('aria-label', t('translateDraftTo'));
  select.append(createLanguageOption('', t('selectOff')));
  LANGUAGE_OPTIONS.forEach(([value, labelText]) => {
    select?.append(createLanguageOption(value, getLocalizedLanguageLabel(value) || labelText));
  });
  select.addEventListener('change', () => {
    const targetLanguage = select?.value || '';
    saveOptions({ composerTranslateLanguage: targetLanguage });
    if (targetLanguage) scheduleDraftTranslation(true);
  });

  panel.append(label, select);
  return panel;
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function togglePanel(): void {
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden && select) {
    select.value = getOptions().composerTranslateLanguage;
    select.focus();
  }
}

function closePanel(): void {
  if (panel) panel.hidden = true;
}

function updateButtonState(): void {
  if (!button) return;

  const targetLanguage = getOptions().composerTranslateLanguage;
  const active = Boolean(targetLanguage);
  const language = targetLanguage ? getLocalizedLanguageLabel(targetLanguage) : '';
  button.classList.toggle('ytcq-composer-translate-button-active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', t('translateDraft'));
  button.title = active && language
    ? t('draftTranslationTo', { language })
    : t('draftTranslationOff');
}

function handleDocumentInput(event: Event): void {
  if (replacingDraft || !getOptions().composerTranslateLanguage || !isFromChatInput(event.target)) return;
  scheduleDraftTranslation();
}

function handleDocumentClick(event: MouseEvent): void {
  if (!panel || panel.hidden) return;
  if (event.target instanceof Node && panel.parentElement?.contains(event.target)) return;
  closePanel();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePanel();
}

function scheduleDraftTranslation(immediate = false): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(translateCurrentDraft, immediate ? 0 : TRANSLATION_DEBOUNCE_MS);
}

async function translateCurrentDraft(): Promise<void> {
  debounceTimer = 0;
  const targetLanguage = getOptions().composerTranslateLanguage;
  const candidate = getDraftTranslationCandidate();
  if (!targetLanguage || !candidate || candidate.sourceText.startsWith('/')) return;

  const requestId = ++requestSerial;
  try {
    const translated = await translateTranslationPlan(candidate.plan, candidate.sourceText, targetLanguage);
    if (requestId !== requestSerial) return;
    if (getOptions().composerTranslateLanguage !== targetLanguage) return;
    if (cleanText(getChatInputText()) !== candidate.observedText) return;
    if (!translated.text || translated.text === candidate.sourceText) return;

    replacingDraft = true;
    lastSourceText = candidate.sourceText;
    lastSourceNodes = cloneNodes(candidate.sourceNodes);
    lastSourcePlanText = candidate.plan.text;
    lastTranslatedText = translated.text;
    replaceNodesInChatInput(translated.nodes, translated.text);
  } catch {
    showToast(t('couldNotTranslateText'));
  } finally {
    window.setTimeout(() => {
      replacingDraft = false;
    }, 0);
  }
}

function getDraftTranslationCandidate(): {
  observedText: string;
  plan: TranslationPlan;
  sourceNodes: Node[];
  sourceText: string;
} | null {
  const snapshot = getChatInputSnapshot();
  const observedText = cleanText(snapshot?.text || '');
  if (!observedText) {
    resetDraftMemory();
    return null;
  }

  if (lastTranslatedText && observedText === lastTranslatedText) return null;

  if (lastSourceText && lastTranslatedText && observedText.startsWith(lastTranslatedText)) {
    const appendedText = cleanText(observedText.slice(lastTranslatedText.length));
    if (!appendedText) return null;
    const sourceText = cleanText(`${lastSourceText} ${appendedText}`);
    const sourceNodes = [
      ...cloneNodes(lastSourceNodes),
      document.createTextNode(`${lastSourcePlanText ? ' ' : ''}${appendedText}`)
    ];
    const plan = createTranslationPlanFromNodes(sourceNodes, sourceText);

    return {
      observedText,
      plan,
      sourceNodes,
      sourceText
    };
  }

  const sourceNodes = snapshot?.childNodes.length
    ? cloneNodes(snapshot.childNodes)
    : [document.createTextNode(observedText)];
  const plan = createTranslationPlanFromNodes(sourceNodes, observedText);

  return {
    observedText,
    plan,
    sourceNodes,
    sourceText: observedText
  };
}

function resetDraftMemory(): void {
  lastSourceText = '';
  lastSourceNodes = [];
  lastSourcePlanText = '';
  lastTranslatedText = '';
}

function cloneNodes(nodes: Node[]): Node[] {
  return nodes.map((node) => node.cloneNode(true));
}

function isFromChatInput(target: EventTarget | null): boolean {
  const input = findChatInput();
  if (!input || !(target instanceof Node)) return false;
  return input === target || input.contains(target);
}

export function shouldWireComposerTranslationForNode(node: Element): boolean {
  return Boolean(
    node.matches(INPUT_RENDERER_SELECTOR) ||
    node.matches(EMOJI_BUTTON_SELECTOR) ||
    node.querySelector(`${INPUT_RENDERER_SELECTOR}, ${EMOJI_BUTTON_SELECTOR}`)
  );
}
