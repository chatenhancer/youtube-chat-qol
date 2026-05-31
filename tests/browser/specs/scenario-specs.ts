/**
 * Shared Playwright test bodies for browser scenario groups.
 *
 * Scenario implementations live under `tests/browser/scenarios`. These helpers
 * bind one scenario to mock or live fixtures. The spec files still call
 * Playwright's `test()` directly so reports point at the environment spec.
 */
import {
  liveTest,
  type LiveSession,
  type MockSession,
  skipIfLoggedInLiveUnavailable
} from '../helpers/browser-fixtures';
import type { BrowserScenario } from '../scenarios/types';

type ScenarioAuthState = 'logged-in' | 'logged-out';

interface MockScenarioFixtures {
  mockLoggedOutSession: MockSession;
  mockLoggedInSession: MockSession;
}

interface LiveScenarioFixtures {
  liveLoggedOutSession: LiveSession;
  liveLoggedInSession: LiveSession | null;
}

export function createMockScenarioTest(
  authState: ScenarioAuthState,
  scenario: BrowserScenario
): ({ mockLoggedOutSession, mockLoggedInSession }: MockScenarioFixtures) => Promise<void> {
  return async ({ mockLoggedOutSession, mockLoggedInSession }) => {
    const session = authState === 'logged-in' ? mockLoggedInSession : mockLoggedOutSession;
    await scenario.run({
      chat: session.page,
      context: session.context
    });
  };
}

export function createLiveScenarioTest(
  authState: ScenarioAuthState,
  scenario: BrowserScenario
): ({ liveLoggedOutSession, liveLoggedInSession }: LiveScenarioFixtures) => Promise<void> {
  return async ({ liveLoggedOutSession, liveLoggedInSession }) => {
    if (authState === 'logged-in') {
      skipIfLoggedInLiveUnavailable(liveTest, liveLoggedInSession);
      await scenario.run({
        chat: liveLoggedInSession.chat,
        context: liveLoggedInSession.context
      });
      return;
    }

    await scenario.run({
      chat: liveLoggedOutSession.chat,
      context: liveLoggedOutSession.context
    });
  };
}
