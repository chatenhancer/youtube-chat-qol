/**
 * Logged-out mock YouTube browser scenarios.
 *
 * Runs the same logged-out scenario group as the real YouTube live smoke test,
 * but against a deterministic local YouTube-shaped chat fixture.
 */
import { mockTest as test } from '../../helpers/browser-fixtures';
import { loggedOutScenarios } from '../../scenarios';

for (const scenario of loggedOutScenarios) {
  test(`logged-out mock: ${scenario.name}`, async ({ mockLoggedOutSession }) => {
    await scenario.run({
      chat: mockLoggedOutSession.page,
      context: mockLoggedOutSession.context
    });
  });
}
