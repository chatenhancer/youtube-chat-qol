import { expect, test } from '@playwright/test';
import { getExtensionId, getExtensionServiceWorker } from '../support/extension';
import type { ExtensionScenario } from './types';

export const themeUndoScenario: ExtensionScenario = async ({ context }) => {
  const extensionId = await getExtensionId(context);
  const worker = await getExtensionServiceWorker(context);
  const editor = await context.newPage();
  const storedThemes = () => worker.evaluate(() => chrome.storage.local.get([
    'ytcqCustomThemes:v1', 'ytcqAppliedCustomTheme:v1'
  ]));
  try {
    await editor.setViewportSize({ width: 1280, height: 960 });
    await editor.goto(`chrome-extension://${extensionId}/themes.html`);
    const name = editor.locator('#themeName');
    const status = editor.locator('.theme-status');
    const accent = editor.locator('[data-theme-field="accent"]');
    const font = editor.locator('[data-theme-field="font"]');
    const preview = editor.frameLocator('#themePreview');
    await expect(name).toBeEnabled();
    await expect(editor.locator('#themeSaveApply')).toHaveText('Save and use');
    await editor.locator('[data-theme-mode="light"]').click();
    const initialStorage = await storedThemes();

    await test.step('Name and palette changes undo locally; preview modes do not create edits', async () => {
      await name.pressSequentially('Undo example');
      await name.press('Meta+z');
      await expect(name).toHaveValue('');
      await expect(status).toHaveText('Undid: Theme name.');
      await expect(editor.locator('#themeSave')).toBeDisabled();
      await name.fill('Undo example');
      await accent.fill('#123456');
      await accent.fill('#654321');
      await editor.locator('[data-theme-mode="dark"]').click();
      await expect(accent).toHaveValue('#654321');
      await editor.keyboard.press('Control+z');
      await expect(accent).toHaveValue('#123456');
      await expect(status).toHaveText('Undid: Accent.');
      await editor.locator('[data-theme-mode="light"]').click();
      await expect(accent).toHaveValue('#123456');
      expect(await storedThemes()).toEqual(initialStorage);
    });

    await test.step('Slider gestures form one undo step and preview text keeps native undo', async () => {
      const chatDraft = preview.locator('#previewDraft');
      await chatDraft.pressSequentially('Preview text');
      await chatDraft.press('ControlOrMeta+z');
      await expect(chatDraft).toHaveValue('');
      await expect(status).toHaveText('Undid: Accent.');
      await editor.getByRole('tab', { name: 'Style', exact: true }).click();
      await editor.locator('[data-theme-details="style"] summary').click();
      const radius = editor.locator('[data-theme-field="radius"]');
      await radius.scrollIntoViewIfNeeded();
      const bounds = (await radius.boundingBox())!;
      await editor.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height / 2);
      await editor.mouse.down();
      await editor.mouse.move(bounds.x + bounds.width * .9, bounds.y + bounds.height / 2, { steps: 8 });
      await editor.mouse.up();
      expect(Number(await radius.inputValue())).toBeGreaterThan(12);
      await preview.locator('#previewMenuButton').press('Meta+z');
      await expect(radius).toHaveValue('12');
      await expect(status).toHaveText('Undid: Corner radius.');
    });

    await test.step('Finish defaults undo together and preserve custom corner radii', async () => {
      const finish = editor.locator('[data-theme-field="finish"]');
      const radius = editor.locator('[data-theme-field="radius"]');
      await finish.selectOption('glass');
      await expect(radius).toHaveValue('4');
      await expect(preview.locator('#input-container')).toHaveCSS('border-radius', '6px');
      await editor.keyboard.press('Control+z');
      await expect(finish).toHaveValue('flat');
      await expect(radius).toHaveValue('12');
      await expect(status).toHaveText('Undid: Finish style.');
      await radius.fill('9');
      await finish.selectOption('glass');
      await expect(radius).toHaveValue('9');
      await editor.keyboard.press('Meta+z');
      await expect(finish).toHaveValue('flat');
      await expect(radius).toHaveValue('9');
      await editor.keyboard.press('Meta+z');
      await expect(radius).toHaveValue('12');
      expect(await storedThemes()).toEqual(initialStorage);
    });

    await test.step('Reset and clear are reversible, and reset uses a saved version when available', async () => {
      await editor.locator('#themeReset').click();
      await expect(name).toHaveValue('Undo example');
      await expect(accent).toHaveValue('#3ea6ff');
      await expect(status).toHaveText('Theme reset to defaults. Not saved; you can undo this.');
      await editor.keyboard.press('Control+z');
      await expect(accent).toHaveValue('#123456');
      await editor.locator('#themeDelete').click();
      await expect(name).toHaveValue('');
      await editor.keyboard.press('Meta+z');
      await expect(name).toHaveValue('Undo example');
      await expect(accent).toHaveValue('#123456');
      expect(await storedThemes()).toEqual(initialStorage);
      await editor.locator('#themeSaveApply').click();
      await expect(status).toHaveText('Theme saved and applied.');
      const saved = await storedThemes();
      await name.fill('Unsaved rename');
      await editor.getByRole('tab', { name: 'Colors', exact: true }).click();
      await accent.fill('#654321');
      await editor.getByRole('tab', { name: 'Style', exact: true }).click();
      await font.selectOption('playful');
      await editor.locator('#themeReset').click();
      await expect(name).toHaveValue('Undo example');
      await expect(accent).toHaveValue('#123456');
      await expect(font).toHaveValue('default');
      await expect(editor.locator('#themeSave')).toBeDisabled();
      await expect(status).toHaveText('Restored the saved version of this theme. You can undo this.');
      await editor.keyboard.press('Meta+z');
      await expect(name).toHaveValue('Unsaved rename');
      await expect(accent).toHaveValue('#654321');
      await expect(font).toHaveValue('playful');
      expect(await storedThemes()).toEqual(saved);
    });

    await test.step('Saving keeps undo local and switching themes clears undo history', async () => {
      await editor.locator('#themeReset').click();
      await font.selectOption('mono');
      await editor.locator('#themeSave').click();
      await expect(status).toHaveText('Theme saved. The applied theme is unchanged.');
      const saved = await storedThemes();
      await editor.keyboard.press('Control+z');
      await expect(font).toHaveValue('default');
      expect(await storedThemes()).toEqual(saved);
      await editor.locator('#themeEditorPicker').selectOption('');
      await expect(editor.locator('.popup-reset-dialog')).toBeVisible();
      await editor.keyboard.press('Control+z');
      await expect(font).toHaveValue('default');
      await editor.getByRole('button', { name: 'Discard', exact: true }).click();
      await name.press('Meta+z');
      await expect(status).toHaveText('Nothing to undo.');
      await editor.locator('#themeEditorPicker').selectOption({ label: 'Undo example' });
      await name.press('Control+z');
      await expect(status).toHaveText('Nothing to undo.');
      await expect(font).toHaveValue('mono');
    });
    await test.step('Renaming saves a new theme, while saving the same name updates that copy', async () => {
      await expect(editor.locator('#themeReset')).toBeDisabled();
      const sourceId = await editor.locator('#themeEditorPicker').inputValue();
      const before = await storedThemes();
      const source = before['ytcqCustomThemes:v1'].find((theme: { id: string }) => theme.id === sourceId);
      await name.fill('First copy');
      await editor.locator('#themeSave').click();
      await expect(status).toHaveText('Theme saved. The applied theme is unchanged.');
      const copyId = await editor.locator('#themeEditorPicker').inputValue();
      expect(copyId).not.toBe(sourceId);
      const copied = await storedThemes();
      expect(copied['ytcqCustomThemes:v1']).toHaveLength(before['ytcqCustomThemes:v1'].length + 1);
      expect(copied['ytcqCustomThemes:v1'].find((theme: { id: string }) => theme.id === sourceId)).toEqual(source);
      expect(copied['ytcqCustomThemes:v1'].find((theme: { id: string }) => theme.id === copyId)).toEqual({ ...source, id: copyId, name: 'First copy' });
      expect(copied['ytcqAppliedCustomTheme:v1']).toEqual(before['ytcqAppliedCustomTheme:v1']);

      await name.fill('Second copy');
      await editor.locator('#themeSaveApply').click();
      await expect(status).toHaveText('Theme saved and applied.');
      const appliedId = await editor.locator('#themeEditorPicker').inputValue();
      expect(appliedId).not.toBe(copyId);
      const applied = await storedThemes();
      expect(applied['ytcqCustomThemes:v1']).toHaveLength(copied['ytcqCustomThemes:v1'].length + 1);
      expect(applied['ytcqCustomThemes:v1']).toEqual(expect.arrayContaining(copied['ytcqCustomThemes:v1']));
      expect(applied['ytcqAppliedCustomTheme:v1']).toEqual({ ...source, id: appliedId, name: 'Second copy' });

      await name.fill('  Second copy  ');
      await expect(editor.locator('#themeSave')).toBeDisabled();

      await editor.locator('[data-theme-field="font"]').selectOption('playful');
      await editor.locator('#themeSave').click();
      await expect(status).toHaveText('Theme saved. The applied theme is unchanged.');
      await expect(editor.locator('#themeEditorPicker')).toHaveValue(appliedId);
      const updated = await storedThemes();
      expect(updated['ytcqCustomThemes:v1']).toHaveLength(applied['ytcqCustomThemes:v1'].length);
      expect(updated['ytcqCustomThemes:v1'].find((theme: { id: string }) => theme.id === appliedId).font).toBe('playful');
      expect(updated['ytcqAppliedCustomTheme:v1']).toEqual(applied['ytcqAppliedCustomTheme:v1']);
    });
  } finally {
    await editor.close();
  }
};
