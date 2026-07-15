/** Logged-in mock YouTube Studio live chat coverage. */
import { expect } from '@playwright/test';
import {
  inboxOpensFromHeaderScenario,
  inboxRecordCreationAndJumpScenario
} from '../scenarios/inbox';
import { loggedInMockStudioTest as test } from '../support/scenario-fixtures';

test('logged-in mock Studio: inbox opens from the chat header', inboxOpensFromHeaderScenario);
test(
  'logged-in mock Studio: inbox saves normalized feed matches and jumps back to chat',
  inboxRecordCreationAndJumpScenario
);
test('logged-in mock Studio: Lite mode remains unavailable', async ({ chat }) => {
  await expect(chat.locator('.ytcq-lite-mode-button')).toHaveCount(0);
});
