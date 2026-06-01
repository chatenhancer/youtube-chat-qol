import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('current-user mention detection', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
  });

  it('derives mention candidates from the signed-in chat identity surface', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');

    mentionDetection.initMentionDetection();

    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@currentviewer');
    expect(mentionDetection.isCurrentUserAuthorName('@CurrentViewer')).toBe(true);
    expect(mentionDetection.isCurrentUserAuthorName('@OtherViewer')).toBe(false);
  });

  it('detects messages that mention the current user without matching self-authored messages', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();

    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', 'hello @CurrentViewer'),
      'ytcqMentionChecked',
      onMention
    );
    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@CurrentViewer', 'hello @CurrentViewer'),
      'ytcqMentionChecked',
      onMention
    );

    expect(onMention).toHaveBeenCalledOnce();
  });

  it('waits for identity discovery before flushing pending mention messages', async () => {
    const mentionDetection = await import('./mention-detection');
    const processor = vi.fn();
    const message = createMessage('@OtherViewer', 'hello @CurrentViewer');

    mentionDetection.registerMentionProcessor(processor);
    mentionDetection.processPotentialMentionForConsumer(message, 'ytcqMentionChecked', vi.fn());

    expect(processor).not.toHaveBeenCalled();

    document.body.append(createIdentitySurface('@CurrentViewer'));
    mentionDetection.initMentionDetection();

    expect(processor).toHaveBeenCalledWith(message);
  });

  it('does not match handles embedded inside longer handle text', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();

    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', 'hello @CurrentViewerExtra'),
      'ytcqMentionChecked',
      onMention
    );

    expect(onMention).not.toHaveBeenCalled();
  });

  it('ignores already-checked and disconnected messages', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();
    const checked = createMessage('@OtherViewer', 'hello @CurrentViewer');
    checked.dataset.ytcqMentionChecked = 'true';
    const disconnected = createMessage('@OtherViewer', 'hello @CurrentViewer');
    disconnected.remove();

    mentionDetection.processPotentialMentionForConsumer(checked, 'ytcqMentionChecked', onMention);
    mentionDetection.processPotentialMentionForConsumer(disconnected, 'ytcqMentionChecked', onMention);

    expect(onMention).not.toHaveBeenCalled();
  });

  it('does not flush disconnected pending mention messages after identity discovery', async () => {
    const mentionDetection = await import('./mention-detection');
    const processor = vi.fn();
    const message = createMessage('@OtherViewer', 'hello @CurrentViewer');

    mentionDetection.registerMentionProcessor(processor);
    mentionDetection.processPotentialMentionForConsumer(message, 'ytcqMentionChecked', vi.fn());
    message.remove();
    document.body.append(createIdentitySurface('@CurrentViewer'));
    mentionDetection.initMentionDetection();

    expect(processor).not.toHaveBeenCalled();
  });
});

function createIdentitySurface(authorName: string): HTMLElement {
  const surface = document.createElement('yt-live-chat-message-input-renderer');
  surface.innerHTML = `<span id="author-name">${authorName}</span>`;
  return surface;
}

function createMessage(authorName: string, text: string): HTMLElement & {
  data?: {
    authorName: { simpleText: string };
    message: { runs: { text: string }[] };
  };
} {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: {
      authorName: { simpleText: string };
      message: { runs: { text: string }[] };
    };
  };
  message.data = {
    authorName: { simpleText: authorName },
    message: { runs: [{ text }] }
  };
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}
