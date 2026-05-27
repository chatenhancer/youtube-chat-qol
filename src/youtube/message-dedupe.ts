import { cleanText } from '../shared/text';

export interface LiveMessageRecordRef {
  messageId?: string;
  messageRef?: WeakRef<HTMLElement>;
}

export function findMatchingLiveMessageRecordIndex<T extends LiveMessageRecordRef>(
  records: T[],
  incoming: LiveMessageRecordRef
): number {
  // Do not fall back to content/timestamp matching here: repeated identical
  // chat messages are valid messages and should stay visible.
  const messageId = cleanText(incoming.messageId);
  if (messageId) {
    const messageIdIndex = records.findIndex((record) => cleanText(record.messageId) === messageId);
    if (messageIdIndex >= 0) return messageIdIndex;
  }

  const incomingMessage = getLiveRecordMessage(incoming);
  if (!incomingMessage) return -1;

  return records.findIndex((record) => getLiveRecordMessage(record) === incomingMessage);
}

function getLiveRecordMessage(record: LiveMessageRecordRef): HTMLElement | null {
  const message = record.messageRef?.deref() || null;
  return message?.isConnected ? message : null;
}
