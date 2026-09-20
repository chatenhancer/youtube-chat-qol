import { themeUndoScenario } from '../../scenarios/theme-undo';
import { themeEditorFeaturesScenario } from '../../scenarios/theme-editor-features';
import { themePaletteScenario } from '../../scenarios/theme-palette';
import { extensionScenarioTest as test } from '../../support/scenario-fixtures';

test('extension themes: undo edits locally with Ctrl+Z and Cmd+Z', themeUndoScenario);
test('extension themes: presets, controls, and preview feedback', themeEditorFeaturesScenario);
test('extension themes: organized palette, materials, and background placement', themePaletteScenario);
