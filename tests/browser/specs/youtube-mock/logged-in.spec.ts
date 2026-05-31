/**
 * Signed-in mock YouTube browser scenarios.
 *
 * Runs the same signed-in scenario group as the real YouTube live smoke test,
 * including composer-only checks that never send a chat message.
 */
import { mockTest as test } from '../../helpers/browser-fixtures';
import { signedInScenarios } from '../../scenarios';

for (const scenario of signedInScenarios) {
  test(`signed-in mock: ${scenario.name}`, async ({ mockSignedInSession }) => {
    await scenario.run({
      chat: mockSignedInSession.page,
      context: mockSignedInSession.context,
      extensionId: null
    });
  });
}
