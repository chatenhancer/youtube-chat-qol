/**
 * Logged-out real YouTube live chat browser tests.
 *
 * Runs the same logged-out scenario group as the deterministic mock fixture,
 * but against a real YouTube livestream.
 */
import { liveTest as test } from '../../helpers/browser-fixtures';
import { loggedOutScenarios } from '../../scenarios';

for (const scenario of loggedOutScenarios) {
  test(`logged-out live: ${scenario.name}`, async ({ liveLoggedOutSession }) => {
    const { chat, context, extensionId } = liveLoggedOutSession;
    await scenario.run({
      chat,
      context,
      extensionId
    });
  });
}
