/**
 * Mock YouTube browser scenarios.
 *
 * Keep this file as a thin environment binding. Add feature coverage under
 * `tests/browser/scenarios/` so mock and live tests stay aligned.
 */
import { mockTest as test } from '../../helpers/browser-fixtures';
import {
  loggedOutScenarios,
  loggedInScenarios
} from '../../scenarios';
import { createMockScenarioTest } from '../scenario-specs';

for (const scenario of loggedInScenarios) {
  test(`logged-in mock: ${scenario.name}`, createMockScenarioTest('logged-in', scenario));
}

for (const scenario of loggedOutScenarios) {
  test(`logged-out mock: ${scenario.name}`, createMockScenarioTest('logged-out', scenario));
}
