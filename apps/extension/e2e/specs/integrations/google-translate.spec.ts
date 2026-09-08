/** Google Translate contract kept separate from YouTube DOM compatibility. */
import { realBatchTranslationProviderScenario } from '../../scenarios/translation/provider';
import { realComposerTranslationScenario } from '../../scenarios/translation/composer';
import {
  extensionScenarioTest,
  mockLiveLoggedInTest
} from '../../support/scenario-fixtures';

extensionScenarioTest(
  'Google Translate integration: incoming translation batches reach the real provider',
  realBatchTranslationProviderScenario
);

mockLiveLoggedInTest(
  'Google Translate integration: English composer drafts reach the real provider and become Japanese',
  realComposerTranslationScenario
);
