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
import { ytcqCreateElement } from '../shared/managed-dom';
import type { Options } from '../shared/options';
import { getOptions } from '../shared/state';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import {
  findChatInput,
  getChatInputNodesText,
  getChatInputSnapshot,
  getChatInputText,
  replaceNodesInChatInput,
  type ChatInputSnapshot
} from '../youtube/chat-input';
import { translateTranslationPlan } from './chat-commands/translate-text';
import { registerFeatureLifecycle } from '../content/lifecycle';
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
let control: HTMLElement | null = null;
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

registerFeatureLifecycle({
  page: {
    init: ({ saveOptions }) => initComposerTranslation(saveOptions),
    boot: refreshComposerTranslation,
    cleanupStale: cleanupStaleComposerTranslation,
    optionsChanged: refreshComposerTranslation,
    reset: resetComposerTranslation
  },
  mutation: {
    enhance: ({ addedElements }) => {
      if (addedElements.some(shouldWireComposerTranslationForNode)) {
        scheduleComposerTranslationWire();
      }
    }
  }
});

export function initComposerTranslation(callback: SaveOptions): void {
  saveOptions = callback;
  scheduleComposerTranslationWire();
  document.addEventListener('input', handleDocumentInput, true);
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('keydown', handleDocumentKeydown, true);
  document.addEventListener('scroll', positionPanel, true);
  window.addEventListener('resize', positionPanel, true);
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

export function cleanupStaleComposerTranslation(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = 0;
  requestSerial += 1;
  replacingDraft = false;
  resetDraftMemory();
  document.querySelectorAll(`.${CONTROL_CLASS}, .${PANEL_CLASS}`).forEach((surface) => surface.remove());
  document.querySelectorAll('.ytcq-composer-translate-host').forEach((host) => {
    host.classList.remove('ytcq-composer-translate-host');
  });
  button = null;
  control = null;
  panel = null;
  select = null;
}

function wireComposerTranslationControl(): void {
  const emojiButton = document.querySelector<HTMLElement>(EMOJI_BUTTON_SELECTOR);
  if (!emojiButton) return;

  const currentControl = button?.closest<HTMLElement>(`.${CONTROL_CLASS}`) || null;
  if (currentControl?.isConnected && currentControl.parentElement === emojiButton) {
    control = currentControl;
    ensurePanel();
    updateButtonState();
    return;
  }

  currentControl?.remove();
  emojiButton.querySelectorAll(`:scope > .${CONTROL_CLASS}`).forEach((control) => control.remove());

  control = ytcqCreateElement('div');
  control.className = CONTROL_CLASS;
  control.append(createButton());
  ensurePanel();
  emojiButton.classList.add('ytcq-composer-translate-host');
  emojiButton.prepend(control);
  updateButtonState();
}

function createButton(): HTMLButtonElement {
  button = ytcqCreateElement('button');
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
  panel = ytcqCreateElement('div');
  panel.className = PANEL_CLASS;
  panel.hidden = true;

  const label = ytcqCreateElement('label');
  label.className = 'ytcq-composer-translate-label';
  label.textContent = t('translateDraftTo');

  select = ytcqCreateElement('select');
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

function ensurePanel(): HTMLElement {
  if (panel?.isConnected) return panel;

  panel?.remove();
  return document.body.appendChild(createPanel());
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = ytcqCreateElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function togglePanel(): void {
  const currentPanel = ensurePanel();
  currentPanel.hidden = !currentPanel.hidden;
  if (!currentPanel.hidden && select) {
    positionPanel();
    window.requestAnimationFrame(positionPanel);
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
  requestSerial += 1;
  scheduleDraftTranslation();
}

function handleDocumentClick(event: MouseEvent): void {
  if (!panel || panel.hidden) return;
  if (event.target instanceof Node && (panel.contains(event.target) || control?.contains(event.target))) return;
  closePanel();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePanel();
}

function positionPanel(): void {
  if (!panel || panel.hidden || !button?.isConnected) return;

  const buttonRect = button.getBoundingClientRect();
  const edgePadding = 8;
  const gap = 4;
  const panelWidth = panel.offsetWidth;
  const panelHeight = panel.offsetHeight;
  const maxLeft = Math.max(edgePadding, window.innerWidth - panelWidth - edgePadding);
  const left = Math.min(Math.max(edgePadding, buttonRect.right - panelWidth), maxLeft);
  const top = Math.max(edgePadding, buttonRect.top - panelHeight - gap);

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
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
    const continuation = getTranslatedDraftContinuation(snapshot, observedText);
    if (!continuation) return null;
    const sourceText = cleanText(`${lastSourceText} ${continuation.text}`);
    const sourceNodes = [
      ...cloneNodes(lastSourceNodes),
      ...createContinuationSourceNodes(continuation.nodes)
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

function getTranslatedDraftContinuation(
  snapshot: ChatInputSnapshot | null,
  observedText: string
): { nodes: Node[]; text: string } | null {
  const appendedText = cleanText(observedText.slice(lastTranslatedText.length));
  if (!appendedText) return null;

  const appendedNodes = snapshot?.childNodes.length
    ? getNodesAfterPlainTextPrefix(snapshot.childNodes, lastTranslatedText)
    : null;
  const nodes = appendedNodes?.length ? appendedNodes : [document.createTextNode(appendedText)];
  const text = cleanText(getChatInputNodesText(nodes) || appendedText);
  if (!text) return null;

  return {
    nodes,
    text
  };
}

function getNodesAfterPlainTextPrefix(nodes: Node[], prefix: string): Node[] | null {
  let remainingPrefix = prefix;
  const result: Node[] = [];

  for (const node of nodes) {
    if (!remainingPrefix) {
      result.push(node.cloneNode(true));
      continue;
    }

    const nodeText = getChatInputNodesText([node]);
    if (!nodeText) continue;

    if (remainingPrefix.startsWith(nodeText)) {
      remainingPrefix = remainingPrefix.slice(nodeText.length);
      continue;
    }

    if (node.nodeType === Node.TEXT_NODE && nodeText.startsWith(remainingPrefix)) {
      const remainder = nodeText.slice(remainingPrefix.length);
      if (remainder) result.push(document.createTextNode(remainder));
      remainingPrefix = '';
      continue;
    }

    return null;
  }

  return remainingPrefix ? null : result;
}

function createContinuationSourceNodes(nodes: Node[]): Node[] {
  const continuationNodes = cloneNodes(nodes);
  if (!lastSourcePlanText || startsWithWhitespace(continuationNodes)) return continuationNodes;
  return [document.createTextNode(' '), ...continuationNodes];
}

function startsWithWhitespace(nodes: Node[]): boolean {
  const firstText = nodes.length ? getChatInputNodesText([nodes[0]]) : '';
  return /^\s/u.test(firstText);
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
