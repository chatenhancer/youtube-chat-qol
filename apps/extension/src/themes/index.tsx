import { jsx, el } from '../shared/jsx-dom';
import { createSvgIcon, ICON_VIEW_BOX, TRASH_ICON_PATH } from '../shared/icons';
import { type ChatSkinTheme } from '../shared/chat-skins';
import {
  APPLIED_CUSTOM_THEME_KEY,
  createCustomTheme,
  defaultThemeRadius,
  loadCustomThemes,
  normalizeCustomTheme,
  saveCustomTheme,
  applyCustomTheme,
  deleteCustomTheme,
  isPreinstalledTheme,
  selectedThemeId,
  type CustomTheme,
  type ThemeArea
} from '../shared/custom-themes';
import {
  localizeExtensionPage,
  getExtensionMessage as message
} from '../shared/extension-page-i18n';
import { showExtensionDialog, closeExtensionDialog } from '../shared/extension-dialog';
import { initTabHighlight } from '../shared/extension-tabs';
import {
  areaButtons,
  themeFields,
  themeBackgroundFields,
  THEME_EDITOR_TABS,
  type ThemeEditorTab
} from './fields';
import { readThemeImage } from './image';
import { createThemePreview } from './preview';
import { createThemeHistory } from './history';

localizeExtensionPage(true);
initThemeEditor();

function initThemeEditor(): void {
  const host = document.querySelector<HTMLElement>('#themeEditor');
  const frame = document.querySelector<HTMLIFrameElement>('#themePreview');
  if (!host || !frame) return;
  frame.title = message('onboardingChatPreview');
  const preview = createThemePreview(frame);
  const history = createThemeHistory();
  let themes: CustomTheme[] = [];
  let draft = createCustomTheme();
  let original = JSON.stringify(draft);
  let savedId = '';
  let appliedId = '';
  let appliedSnapshot = '';
  let mode: ChatSkinTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let area: ThemeArea = 'header';
  let activeTab: ThemeEditorTab = 'colors';
  let busy = false;

  const picker = el<HTMLSelectElement>(
    <select
      id="themeEditorPicker"
      aria-label={message('themeSelect')}
      onChange={() => {
        const id = picker.value;
        picker.value = savedId;
        withDiscardConfirmation(() => selectTheme(id));
      }}
    />
  );
  const remove = el<HTMLButtonElement>(
    <button type="button" id="themeDelete" class="theme-icon-button" onClick={removeTheme}>
      {createSvgIcon(ICON_VIEW_BOX, TRASH_ICON_PATH, 1.7)}
    </button>
  );
  const name = el<HTMLInputElement>(
    <input
      type="text"
      id="themeName"
      maxlength="60"
      aria-label={message('themeName')}
      placeholder={message('themeName')}
      onInput={() => {
        name.setCustomValidity('');
        edit(draft, 'name', name.value);
      }}
    />
  );
  const status = el<HTMLElement>(<p class="theme-status" role="status" aria-live="polite" />);
  const presetNotice = el<HTMLElement>(
    <p class="theme-preset-notice" hidden>
      {message('themePresetNote')}
    </p>
  );
  const fields = el<HTMLElement>(<div class="theme-fields" />);
  const tabIds = Object.keys(THEME_EDITOR_TABS) as ThemeEditorTab[];
  const tabs = el<HTMLElement>(
    <div
      class="theme-editor-tabs popup-tabs"
      role="tablist"
      aria-label={message('themeCustomize')}
      onKeyDown={onTabKeyDown}
    >
      {tabIds.map((tab) => (
        <button
          type="button"
          class="popup-tab"
          id={`theme-tab-${tab}`}
          role="tab"
          data-theme-tab={tab}
          aria-controls={`theme-panel-${tab}`}
          aria-selected={activeTab === tab}
          tabindex={activeTab === tab ? 0 : -1}
          onClick={() => selectTab(tab)}
        >
          {message(THEME_EDITOR_TABS[tab])}
        </button>
      ))}
    </div>
  );
  const areas = areaButtons((value) => {
    area = value;
    rebuildFields(true);
    preview.showArea(area);
  });
  const save = el<HTMLButtonElement>(
    <button
      type="button"
      id="themeSave"
      class="popup-reset-dialog-button"
      onClick={() => {
        void saveTheme(false);
      }}
    >
      {message('themeSave')}
    </button>
  );
  const reset = el<HTMLButtonElement>(
    <button
      type="button"
      id="themeReset"
      class="popup-reset-dialog-button"
      onClick={() => resetDraft()}
    >
      {message('themeReset')}
    </button>
  );
  const apply = el<HTMLButtonElement>(
    <button
      type="button"
      id="themeSaveApply"
      class="popup-reset-dialog-button popup-reset-dialog-confirm"
      onClick={() => {
        void saveTheme(true);
      }}
    >
      {message('themeSaveApply')}
    </button>
  );
  const removeHint = el<HTMLElement>(
    <span class="theme-disabled-hint">
      {remove}
      <span id="themeDeleteHint" role="tooltip" />
    </span>
  );
  const actionHints = [reset, save, apply].map((button) =>
    el<HTMLElement>(
      <span class="theme-disabled-hint" aria-label={button.textContent || ''}>
        {button}
        <span id={`${button.id}Hint`} role="tooltip" />
      </span>
    )
  );
  const footer = el<HTMLElement>(
    <footer class="theme-editor-footer" role="group" aria-label={message('themeCustomize')}>
      {actionHints}
    </footer>
  );
  const modes = el<HTMLElement>(
    <div class="theme-appearance-row">
      <span>{message('themeAppearance')}</span>
      <div class="theme-modes popup-tabs" role="group" aria-label={message('themeAppearance')}>
        {(['light', 'dark'] as const).map((value) => (
          <button
            type="button"
            class="popup-tab"
            data-theme-mode={value}
            aria-pressed={mode === value}
            onClick={() => {
              mode = value;
              updateModeButtons();
              preview.setAppearance(mode);
            }}
          >
            {message(`theme_${value}`)}
          </button>
        ))}
      </div>
    </div>
  );
  const editor = el<HTMLElement>(
    <div class="theme-editor">
      <header class="theme-editor-header">
        <div class="theme-picker-actions">
          {removeHint}
          {picker}
        </div>
      </header>
      <div class="theme-name-row">{name}</div>
      {presetNotice}
      {tabs}
      {fields}
      {status}
      {footer}
    </div>
  );
  host.append(editor);
  frame.before(modes);
  editor.addEventListener('change', history.commit);
  editor.addEventListener('pointerdown', history.commit);
  const refreshHighlights = [tabs, areas, modes.querySelector<HTMLElement>('.popup-tabs')!].map(
    initTabHighlight
  );

  function updateTabs(): void {
    tabs.querySelectorAll<HTMLButtonElement>('[data-theme-tab]').forEach((button) => {
      const selected = button.dataset.themeTab === activeTab;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('popup-tab-active', selected);
      button.tabIndex = selected ? 0 : -1;
    });
    fields.querySelectorAll<HTMLElement>('[data-theme-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.themePanel !== activeTab;
    });
  }
  function selectTab(tab: ThemeEditorTab): void {
    if (busy) return;
    history.commit();
    activeTab = tab;
    tabs
      .querySelector<HTMLButtonElement>(`[data-theme-tab="${tab}"]`)
      ?.focus({ preventScroll: true });
    updateTabs();
    refreshHighlights.forEach((refresh) => refresh());
    if (tab === 'background') preview.showArea(area);
  }
  function onTabKeyDown(event: KeyboardEvent): void {
    if (!(event.target instanceof HTMLButtonElement) || busy) return;
    const current = tabIds.indexOf(activeTab);
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabIds.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      next =
        (current + direction * (document.documentElement.dir === 'rtl' ? -1 : 1) + tabIds.length) %
        tabIds.length;
    } else return;
    event.preventDefault();
    selectTab(tabIds[next]);
  }
  function notice(key: string, error = false): void {
    status.textContent = message(key);
    status.classList.toggle('theme-error', error);
  }
  function dirty(): boolean {
    return draftSnapshot() !== original;
  }
  function draftSnapshot(): string {
    return JSON.stringify({ ...draft, name: draft.name.trim() });
  }
  function updateButtons(): void {
    const nameError = !draft.name.trim()
      ? 'themeNameRequired'
      : draft.name.trim().toLowerCase() === 'aero'
        ? 'themePresetNameRequired'
        : '';
    const snapshot = draftSnapshot();
    const hasChanges = snapshot !== original;
    const applied = appliedId === draft.id && appliedSnapshot === snapshot;
    const blocked = busy ? 'themeWorking' : nameError;
    save.disabled = Boolean(blocked || !hasChanges);
    apply.disabled = Boolean(blocked || (!hasChanges && applied));
    const applyLabel = message(
      savedId && !hasChanges && !apply.disabled ? 'themeUse' : 'themeSaveApply'
    );
    apply.textContent = applyLabel;
    actionHints[2].setAttribute('aria-label', applyLabel);
    reset.disabled = busy || JSON.stringify(draft) === JSON.stringify(resetTarget());
    setDisabledHint(
      actionHints[0],
      reset.disabled ? message(busy ? 'themeWorking' : 'themeAtDefaults') : ''
    );
    setDisabledHint(actionHints[1], save.disabled ? message(blocked || 'themeNoChanges') : '');
    setDisabledHint(
      actionHints[2],
      apply.disabled ? message(blocked || 'themeAlreadyApplied') : ''
    );
    remove.title = message(savedId ? 'themeDelete' : 'themeClear');
    remove.setAttribute('aria-label', remove.title);
    const locked = isPreinstalledTheme({ id: savedId });
    remove.disabled = busy || locked;
    removeHint.setAttribute('aria-label', remove.title);
    setDisabledHint(
      removeHint,
      busy ? message('themeWorking') : locked ? message('themePresetLocked') : ''
    );
    presetNotice.hidden = !locked;
  }
  function setDisabledHint(container: HTMLElement, reason: string): void {
    const tooltip = container.querySelector<HTMLElement>('[role="tooltip"]')!;
    tooltip.textContent = reason.replace(/[.。۔।]$/u, '');
    container.tabIndex = reason ? 0 : -1;
    container.toggleAttribute('data-disabled', Boolean(reason));
    if (reason) {
      container.setAttribute('aria-describedby', tooltip.id);
    } else {
      container.removeAttribute('aria-describedby');
    }
  }
  function changed(rebuild = false): void {
    status.textContent = '';
    status.classList.remove('theme-error');
    if (rebuild) rebuildFields();
    updateButtons();
    preview.update(draft, mode);
  }
  function edit<T extends object, K extends keyof T>(
    target: T,
    key: K,
    value: T[K],
    rebuild = false
  ): void {
    const label =
      key === 'name'
        ? message('themeName')
        : key === 'image'
          ? message('theme_image')
          : fields
              .querySelector(`[data-theme-field="${String(key)}"]`)
              ?.getAttribute('aria-label') || String(key);
    const description =
      target === draft ? label : [message(`themeArea_${area}`), label].join(' · ');
    if (
      target === draft &&
      key === 'finish' &&
      value !== draft.finish &&
      draft.radius === defaultThemeRadius(draft.finish)
    ) {
      const theme = draft;
      const previous = { finish: theme.finish, radius: theme.radius };
      history.record(() => Object.assign(theme, previous), description);
      theme.finish = value as CustomTheme['finish'];
      theme.radius = defaultThemeRadius(theme.finish);
      changed(rebuild);
      return;
    }
    if (history.set(target, key, value, description)) changed(rebuild);
  }
  function rebuildFields(backgroundOnly = false): void {
    history.commit();
    const expanded = new Map(
      [...fields.querySelectorAll<HTMLDetailsElement>('details[data-theme-details]')].map(
        (details) => [details.dataset.themeDetails, details.open]
      )
    );
    const upload = (file: File, update: (image: string) => void) => {
      void uploadImage(file, update);
    };
    if (backgroundOnly) {
      // Keep the tabs mounted so focus and the moving highlight survive an area change.
      fields
        .querySelector('.theme-background-fields')!
        .replaceWith(themeBackgroundFields(draft, area, edit, upload));
    } else {
      fields.replaceChildren(themeFields(draft, area, areas, edit, upload));
    }
    fields
      .querySelectorAll<HTMLDetailsElement>('details[data-theme-details]')
      .forEach((details) => {
        details.open = expanded.get(details.dataset.themeDetails) ?? false;
      });
    areas
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.themeArea === area))
      );
    updateTabs();
    refreshHighlights.forEach((refresh) => refresh());
  }
  function updateModeButtons(): void {
    modes
      .querySelectorAll<HTMLButtonElement>('[data-theme-mode]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.themeMode === mode))
      );
    refreshHighlights.forEach((refresh) => refresh());
  }
  function fillPicker(): void {
    picker.replaceChildren(
      new Option(message('themeNew'), ''),
      ...themes.map(
        (theme) =>
          new Option(
            isPreinstalledTheme(theme)
              ? `${theme.name} · ${message('themePreinstalled')}`
              : theme.name,
            theme.id
          )
      )
    );
    picker.value = savedId;
  }
  function selectTheme(id: string): void {
    history.clear();
    const selected = themes.find((theme) => theme.id === id);
    draft = selected ? structuredClone(selected) : createCustomTheme();
    if (selected && isPreinstalledTheme(selected)) draft.id = crypto.randomUUID();
    savedId = selected?.id || '';
    original = JSON.stringify(draft);
    name.value = draft.name;
    name.setCustomValidity('');
    fillPicker();
    rebuildFields();
    changed();
  }
  function withDiscardConfirmation(action: () => void): void {
    if (busy) return;
    if (!dirty()) {
      action();
      return;
    }
    showExtensionDialog({
      message: message('themeDiscardConfirm'),
      actions: [
        { label: message('themeKeepEditing'), onClick: closeExtensionDialog },
        {
          label: message('themeDiscard'),
          className: 'popup-reset-dialog-confirm',
          onClick: () => {
            closeExtensionDialog();
            action();
          }
        }
      ]
    });
  }
  async function uploadImage(file: File, update: (image: string) => void): Promise<void> {
    setBusy(true);
    try {
      update(await readThemeImage(file));
    } catch {
      notice('themeImageError', true);
    } finally {
      setBusy(false);
    }
  }
  function setBusy(value: boolean): void {
    busy = value;
    editor
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >('input, select, button')
      .forEach((control) => {
        control.disabled = value;
      });
    if (!busy) rebuildFields();
    updateButtons();
  }
  async function refreshLibrary(): Promise<void> {
    themes = await loadCustomThemes();
    fillPicker();
  }
  async function saveTheme(shouldApply: boolean): Promise<void> {
    if (busy) return;
    history.commit();
    if (!draft.name.trim() || draft.name.trim().toLowerCase() === 'aero') {
      name.setCustomValidity(
        message(draft.name.trim() ? 'themePresetNameRequired' : 'themeNameRequired')
      );
      name.reportValidity();
      return;
    }
    setBusy(true);
    let saved = false;
    try {
      draft.name = draft.name.trim();
      name.value = draft.name;
      const theme =
        savedId && draft.name !== (JSON.parse(original) as CustomTheme).name
          ? { ...draft, id: crypto.randomUUID() }
          : draft;
      await saveCustomTheme(theme);
      draft.id = theme.id;
      saved = true;
      savedId = draft.id;
      original = JSON.stringify(draft);
      if (shouldApply) await applyCustomTheme(draft);
      await refreshLibrary();
      notice(shouldApply ? 'themeApplied' : 'themeSaved');
    } catch {
      notice(saved ? 'themeApplyError' : 'themeSaveError', true);
    } finally {
      setBusy(false);
    }
  }
  function resetTarget(): CustomTheme {
    if (savedId) return JSON.parse(original) as CustomTheme;
    return { ...createCustomTheme(), id: draft.id, name: draft.name };
  }
  function resetDraft(clearName = false): void {
    if (busy) return;
    const previous = draft;
    const next = resetTarget();
    if (clearName) next.name = '';
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    history.record(
      () => {
        draft = previous;
      },
      message(clearName ? 'themeClear' : 'themeReset')
    );
    draft = next;
    name.value = draft.name;
    name.setCustomValidity('');
    changed(true);
    if (!clearName) notice(savedId ? 'themeResetSavedDone' : 'themeResetDone');
  }
  async function removeTheme(): Promise<void> {
    if (busy || isPreinstalledTheme({ id: savedId })) return;
    if (!savedId) {
      resetDraft(true);
      return;
    }
    let isApplied: boolean;
    setBusy(true);
    try {
      const { chatSkin } = await chrome.storage.sync.get('chatSkin');
      isApplied = chatSkin === `custom:${savedId}`;
    } catch {
      notice('themeSaveError', true);
      return;
    } finally {
      setBusy(false);
    }
    showExtensionDialog({
      message: `${message('themeDeleteConfirm')}${isApplied ? ` ${message('themeDeleteAppliedNote')}` : ''}\n\n${themes.find((theme) => theme.id === savedId)?.name || draft.name}`,
      actions: [
        { label: message('close'), onClick: closeExtensionDialog },
        {
          label: message('themeDelete'),
          className: 'popup-reset-dialog-confirm',
          onClick: () => {
            closeExtensionDialog();
            void (async () => {
              setBusy(true);
              try {
                await deleteCustomTheme(savedId);
                await refreshLibrary();
                selectTheme('');
              } catch {
                notice('themeSaveError', true);
              } finally {
                setBusy(false);
              }
            })();
          }
        }
      ]
    });
  }
  function undoEdit(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.shiftKey ||
      !(event.ctrlKey || event.metaKey) ||
      event.key.toLowerCase() !== 'z'
    )
      return;
    const target = event.target as HTMLElement | null;
    // Text fields in the sample chat keep their native text-editing undo.
    if (
      target?.ownerDocument !== document &&
      target?.closest?.('input, textarea, [contenteditable]')
    )
      return;
    event.preventDefault();
    if (busy || document.querySelector('[aria-modal="true"]')) return;
    const label = history.undo();
    if (!label) {
      notice('themeNothingToUndo');
      return;
    }
    const focusedField = document.activeElement?.getAttribute('data-theme-field');
    name.value = draft.name;
    name.setCustomValidity('');
    changed(true);
    status.textContent = message('themeUndone', label);
    if (focusedField)
      fields
        .querySelector<HTMLElement>(`[data-theme-field="${focusedField}"]`)
        ?.focus({ preventScroll: true });
  }
  window.addEventListener('keydown', undoEdit);
  frame.addEventListener('load', () =>
    frame.contentDocument?.addEventListener('keydown', undoEdit)
  );
  window.addEventListener('beforeunload', (event) => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.chatSkin) {
      const skin = changes.chatSkin.newValue;
      appliedId = selectedThemeId(skin);
    } else if (area === 'local' && changes[APPLIED_CUSTOM_THEME_KEY]) {
      appliedSnapshot = JSON.stringify(
        normalizeCustomTheme(changes[APPLIED_CUSTOM_THEME_KEY].newValue)
      );
    } else {
      return;
    }
    updateButtons();
  });
  setBusy(true);
  void Promise.all([
    loadCustomThemes(),
    chrome.storage.sync.get('chatSkin'),
    chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY)
  ])
    .then(([library, stored, local]) => {
      themes = library;
      appliedId = selectedThemeId(stored.chatSkin);
      appliedSnapshot = JSON.stringify(normalizeCustomTheme(local[APPLIED_CUSTOM_THEME_KEY]));
      selectTheme(appliedId);
    })
    .catch(() => notice('themeSaveError', true))
    .finally(() => setBusy(false));
}
