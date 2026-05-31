/**
 * Signed-in real YouTube live chat browser tests.
 *
 * Runs the same signed-in scenario group as the deterministic mock fixture,
 * but against a real headed YouTube livestream. These tests may write local
 * draft text, but they never press Enter or click YouTube's send button.
 */
import {
  liveTest as test,
  skipIfSignedInLiveUnavailable
} from '../../helpers/browser-fixtures';
import { signedInScenarios } from '../../scenarios';

for (const scenario of signedInScenarios) {
  test(`signed-in live: ${scenario.name}`, async ({ liveSignedInSession }) => {
    skipIfSignedInLiveUnavailable(test, liveSignedInSession);

    const { chat, context } = liveSignedInSession;
    await scenario.run({
      chat,
      context
    });
  });
}
