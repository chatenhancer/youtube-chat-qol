import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createKeywordPanel,
  createKeywordToggleButton,
  refreshKeywordToggle
} from './keyword-panel';
import {
  addInboxKeywordsToState,
  getInboxKeywordsSnapshot,
  resetInboxStore
} from './state';

describe('inbox keyword panel', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    resetInboxStore();
  });

  it('renders a keyword count badge on the toggle button', () => {
    addInboxKeywordsToState(['launch', 'status']);

    const button = createKeywordToggleButton();

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.querySelector('.ytcq-inbox-keyword-count')?.textContent).toBe('2');
    expect(button.querySelector<HTMLElement>('.ytcq-inbox-keyword-count')?.hidden).toBe(false);

    resetInboxStore();
    refreshKeywordToggle(button);
    expect(button.querySelector<HTMLElement>('.ytcq-inbox-keyword-count')?.hidden).toBe(true);
  });

  it('adds normalized keywords and rerenders chips from the form', () => {
    const onKeywordsChanged = vi.fn();
    const panel = createKeywordPanel({ onKeywordsChanged });
    const input = panel.querySelector<HTMLInputElement>('.ytcq-inbox-keyword-input')!;
    const form = panel.querySelector<HTMLFormElement>('form')!;

    input.value = ' Launch ';
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

    expect(getInboxKeywordsSnapshot()).toEqual(['Launch']);
    expect(panel.querySelector('.ytcq-inbox-keyword-chip')?.textContent).toContain('Launch');
    expect(onKeywordsChanged).toHaveBeenCalledOnce();
  });

  it('does not add duplicate keywords and removes existing chips', () => {
    const onKeywordsChanged = vi.fn();
    addInboxKeywordsToState(['launch']);
    const panel = createKeywordPanel({ onKeywordsChanged });
    const input = panel.querySelector<HTMLInputElement>('.ytcq-inbox-keyword-input')!;
    const form = panel.querySelector<HTMLFormElement>('form')!;

    input.value = 'LAUNCH';
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(getInboxKeywordsSnapshot()).toEqual(['launch']);
    expect(onKeywordsChanged).not.toHaveBeenCalled();

    panel.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-remove')?.click();
    expect(getInboxKeywordsSnapshot()).toEqual([]);
    expect(panel.querySelector('.ytcq-inbox-keyword-empty')?.textContent).toBe('No keywords');
    expect(onKeywordsChanged).toHaveBeenCalledOnce();
  });
});
