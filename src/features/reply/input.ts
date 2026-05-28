/**
 * Reply input insertion.
 *
 * Performs mention and quote insertion with short recovery retries for cases
 * where YouTube is switching panels or late-rendering the chat input.
 */
import { t } from '../../shared/i18n';
import { showToast } from '../../shared/toast';
import {
  insertIntoChatInput,
  replaceChatInput,
  replaceNodesInChatInput,
  returnToChatInputPanel
} from '../../youtube/chat-input';

const CHAT_INPUT_RETRY_DELAYS = [80, 180, 360, 600];

export function insertMentionText(text: string): void {
  insertWithChatInputRecovery(() => insertIntoChatInput(text));
}

export function replaceInputWithQuoteText(text: string): void {
  insertWithChatInputRecovery(() => replaceChatInput(text));
}

export function replaceInputWithQuoteNodes(nodes: Node[], fallbackText: string, trailingText = ''): void {
  insertWithChatInputRecovery(() => replaceNodesInChatInput(nodes, fallbackText, trailingText));
}

function insertWithChatInputRecovery(insert: () => boolean): void {
  if (!insert()) {
    if (!returnToChatInputPanel()) {
      showToast(t('couldNotFindChatInput'));
      return;
    }

    retryInsertMentionContent(insert, 0);
  }
}

function retryInsertMentionContent(insert: () => boolean, attempt: number): void {
  const delay = CHAT_INPUT_RETRY_DELAYS[attempt];
  if (delay === undefined) {
    showToast(t('couldNotFindChatInput'));
    return;
  }

  window.setTimeout(() => {
    if (insert()) return;
    retryInsertMentionContent(insert, attempt + 1);
  }, delay);
}
