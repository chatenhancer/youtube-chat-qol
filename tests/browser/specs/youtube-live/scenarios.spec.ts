/**
 * Real YouTube live chat browser scenarios.
 *
 * Logged-in scenarios may write local draft text, but they never press Enter or
 * click YouTube's send button.
 *
 * Keep this file as a thin environment binding. Add feature coverage under
 * `tests/browser/scenarios/` so mock and live tests stay aligned.
 */
import { liveTest as test } from '../../helpers/browser-fixtures';
import {
  loggedOutScenarios,
  loggedInScenarios
} from '../../scenarios';
import { createLiveScenarioTest } from '../scenario-specs';

for (const scenario of loggedInScenarios) {
  test(`logged-in live: ${scenario.name}`, createLiveScenarioTest('logged-in', scenario));
}

for (const scenario of loggedOutScenarios) {
  test(`logged-out live: ${scenario.name}`, createLiveScenarioTest('logged-out', scenario));
}
