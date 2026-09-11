/** Extension-only onboarding rendering, interaction, and persistence coverage. */
import {
  onboardingFeaturePreviewScenario,
  onboardingInboxPreviewScenario,
  onboardingProfileInfoScenario,
  onboardingProfilePreviewScenario,
  onboardingRenderingScenario,
  onboardingTooltipScenario,
  onboardingTranslationPreviewScenario
} from '../../scenarios/onboarding/index';
import { extensionScenarioTest as test } from '../../support/scenario-fixtures';

test(
  'extension onboarding: localized layout and initial preview render',
  onboardingRenderingScenario
);
test('extension onboarding: preview tooltips explain controls', onboardingTooltipScenario);
test('extension onboarding: avatars open interactive sample profiles', onboardingProfilePreviewScenario);
test('extension onboarding: profile icons explain their actions', onboardingProfileInfoScenario);
test('extension onboarding: Inbox preview shows a watched keyword', onboardingInboxPreviewScenario);
test(
  'extension onboarding: translation settings update the preview',
  onboardingTranslationPreviewScenario
);
test(
  'extension onboarding: feature settings update the Aero preview and persist',
  onboardingFeaturePreviewScenario
);
