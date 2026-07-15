import { afterEach, describe, expect, it, vi } from 'vitest';
import { jumpToChatMessage } from '../message-jump';
import type { YouTubeChatMessageRecord } from '../../youtube/chat-feed/protocol';
import { argbToCss, createLiteChatRenderer, createLiteChatMessageRow } from './renderer';
import { createLiteChatStore } from './store';

describe('Lite chat renderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders native-compatible slots, safe links, and custom emoji metadata', () => {
    const row = createLiteChatMessageRow({
      ...createRecord('message-one', 'Hello custom emoji'),
      author: {
        avatarUrl: 'https://yt3.ggpht.com/avatar',
        badges: [{ label: 'Moderator', iconUrl: 'https://www.youtube.com/badge.png' }],
        channelId: 'UCExample',
        name: '@Example'
      },
      runs: [
        { type: 'text', text: 'Open ', href: 'https://example.com/path' },
        {
          type: 'emoji',
          alt: ':wave:',
          emojiId: 'wave-id',
          imageUrl: 'https://www.youtube.com/emoji.png',
          shortcuts: [':wave:']
        },
        { type: 'text', text: ' unsafe', href: 'javascript:alert(1)' }
      ]
    });

    expect(row.classList.contains('ytcq-lite-message')).toBe(true);
    expect(row.dataset.messageId).toBe('message-one');
    expect(row.querySelector<HTMLImageElement>('#author-photo img')).toMatchObject({
      height: 24,
      width: 24
    });
    expect(row.querySelector('#author-name')?.textContent).toBe('@Example');
    expect(row.querySelector('#message-container #message')).not.toBeNull();
    expect(row.querySelector<HTMLAnchorElement>('#message a')?.href).toBe(
      'https://example.com/path'
    );
    expect(row.querySelectorAll('#message a')).toHaveLength(1);
    expect(row.querySelector<HTMLImageElement>('.ytcq-lite-emoji')).toMatchObject({
      alt: ':wave:',
      height: 24,
      title: ':wave:',
      width: 24
    });
    expect(row.querySelector('.ytcq-lite-emoji')?.getAttribute('data-emoji-id')).toBe('wave-id');
  });

  it('renders a native-style moderator shield instead of badge text', () => {
    const row = createLiteChatMessageRow({
      ...createRecord('moderator-message', 'Hello'),
      author: {
        badges: [{ kind: 'moderator', label: 'Moderator' }],
        channelId: 'UCModerator',
        name: '@Moderator'
      }
    });

    expect(row.querySelector('.ytcq-lite-moderator-badge-icon path')?.getAttribute('d')).toContain(
      'M3 4.998'
    );
    expect(row.querySelector('.ytcq-lite-author-badge')?.textContent).toBe('');
    expect(row.querySelector('.ytcq-lite-author-badge')?.getAttribute('aria-label')).toBe(
      'Moderator'
    );
    expect(row.querySelector('#author-name')?.nextElementSibling?.id).toBe('chat-badges');
    expect(row.querySelector('#chat-badges')?.parentElement?.classList).toContain(
      'ytcq-lite-author-chip'
    );
  });

  it('renders owner and verified author-chip styling with the badge inside the handle', () => {
    const row = createLiteChatMessageRow({
      ...createRecord('owner-message', 'Hello'),
      author: {
        badges: [{ kind: 'verified', label: 'Verified' }],
        channelId: 'UCOwner',
        isOwner: true,
        name: '@Owner'
      }
    });

    const author = row.querySelector<HTMLElement>('#author-name')!;
    expect(author.classList.contains('owner')).toBe(true);
    expect(author.querySelector('#chip-badges')).not.toBeNull();
    expect(author.querySelector('.ytcq-lite-verified-badge-icon path')?.getAttribute('d')).toContain(
      'M9 16.2'
    );
    expect(row.querySelector('#chat-badges')?.childElementCount).toBe(0);
  });

  it('formats timestampUsec when the transport does not include display text', () => {
    const row = createLiteChatMessageRow({
      ...createRecord('timestamp-message', 'Hello'),
      timestampUsec: '1782000000000000'
    });

    expect(row.querySelector('#timestamp')?.textContent).toMatch(/\d/);
  });

  it('shows paid, sticker, membership, and gift records distinctly', () => {
    const paid = createLiteChatMessageRow({
      ...createRecord('paid', 'Thank you'),
      kind: 'paid',
      paid: { amountText: '$10.00' }
    });
    const sticker = createLiteChatMessageRow({
      ...createRecord('sticker', ''),
      kind: 'sticker',
      sticker: {
        alt: 'Celebration sticker',
        amountText: '$5.00',
        imageUrl: 'https://www.youtube.com/sticker.png'
      }
    });
    const membership = createLiteChatMessageRow({
      ...createRecord('membership', 'Hello members'),
      kind: 'membership',
      membership: { headerText: 'New member', subtext: 'Member for one month' }
    });
    const gift = createLiteChatMessageRow({
      ...createRecord('gift', ''),
      kind: 'gift',
      gift: { giftType: 'purchase', headerText: 'Gifted memberships', count: 5 }
    });

    expect(paid.querySelector('.ytcq-lite-paid-amount')?.textContent).toBe('$10.00');
    expect(sticker.querySelector<HTMLImageElement>('.ytcq-lite-sticker img')?.alt).toBe(
      'Celebration sticker'
    );
    expect(membership.querySelector('.ytcq-lite-membership-header')?.textContent).toContain(
      'New member'
    );
    expect(gift.querySelector('.ytcq-lite-gift-header')?.textContent).toContain('×5');
    expect(sticker.querySelector('#message')).toBeNull();
    expect(membership.querySelectorAll('#message')).toHaveLength(1);
    expect(membership.querySelector('#message')?.textContent).toBe('Hello members');
    expect(gift.querySelectorAll('#message')).toHaveLength(1);
    expect(membership.getAttribute('aria-label')).toContain('New member');
    expect(gift.getAttribute('aria-label')).toContain('×5');
    expect(gift.getAttribute('aria-label')?.match(/Gifted memberships/g)).toHaveLength(1);
  });

  it('mounts only the bounded latest window and recreates clean rows for updates', () => {
    const store = createLiteChatStore({ renderLimit: 3, storeLimit: 10 });
    const onRowRendered = vi.fn();
    const renderer = createLiteChatRenderer(store, { renderLimit: 3, onRowRendered });
    document.body.append(renderer.root);

    store.apply(
      Array.from({ length: 5 }, (_value, index) => ({
        type: 'upsert' as const,
        record: createRecord(`message-${index}`, `Message ${index}`)
      }))
    );
    expect(renderer.root.querySelectorAll('.ytcq-lite-message')).toHaveLength(3);
    expect(
      Array.from(renderer.root.querySelectorAll('.ytcq-lite-message')).map(
        (row) => (row as HTMLElement).dataset.messageId
      )
    ).toEqual(['message-2', 'message-3', 'message-4']);

    const existing = renderer.getMessageElement('message-4');
    existing!.dataset.ytcqAuthorMentionWired = 'true';
    existing!.dataset.ytcqTranslationKey = 'stale-translation';
    store.apply([
      {
        type: 'upsert',
        record: createRecord('message-4', 'Updated message')
      }
    ]);
    const updated = renderer.getMessageElement('message-4');
    expect(updated).not.toBe(existing);
    expect(updated?.querySelector('[id="message"]')?.textContent).toBe('Updated message');
    expect(updated?.dataset.ytcqAuthorMentionWired).toBeUndefined();
    expect(updated?.dataset.ytcqTranslationKey).toBeUndefined();
    expect(onRowRendered).toHaveBeenCalledWith(
      updated,
      expect.objectContaining({ id: 'message-4' }),
      'changed'
    );

    renderer.destroy();
  });

  it('reveals a retained message outside the mounted window', () => {
    const store = createLiteChatStore({ renderLimit: 4, storeLimit: 20 });
    store.apply(Array.from({ length: 10 }, (_value, index) => ({
      type: 'upsert' as const,
      record: createRecord(`message-${index}`, `Message ${index}`)
    })));
    const renderer = createLiteChatRenderer(store, { renderLimit: 4 });
    document.body.append(renderer.root);

    expect(renderer.getMessageElement('message-2')).toBeNull();
    const target = renderer.revealMessage('message-2');

    expect(target?.dataset.messageId).toBe('message-2');
    expect(getRenderedMessageIds(renderer.root)).toEqual([
      'message-0',
      'message-1',
      'message-2',
      'message-3'
    ]);
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');
    expect(renderer.root.querySelector<HTMLButtonElement>('.ytcq-lite-new-messages')?.hidden).toBe(
      false
    );
    expect(renderer.revealMessage('missing')).toBeNull();
    renderer.destroy();
  });

  it('pages backward through retained records while keeping the mounted window bounded', async () => {
    const store = createLiteChatStore({ renderLimit: 4, storeLimit: 20 });
    store.apply(Array.from({ length: 10 }, (_value, index) => ({
      type: 'upsert' as const,
      record: createRecord(`message-${index}`, `Message ${index}`)
    })));
    const renderer = createLiteChatRenderer(store, { renderLimit: 4 });
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scrollReaderTo(scroller, 0);
    await waitForAnimationFrame();

    expect(getRenderedMessageIds(renderer.root)).toEqual([
      'message-4',
      'message-5',
      'message-6',
      'message-7'
    ]);
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');

    const getRecords = vi.spyOn(store, 'getRecords');
    store.apply([{ type: 'upsert', record: createRecord('message-10', 'Message 10') }]);
    expect(getRecords).not.toHaveBeenCalled();
    expect(getRenderedMessageIds(renderer.root)).toEqual([
      'message-4',
      'message-5',
      'message-6',
      'message-7'
    ]);
    expect(renderer.root.querySelectorAll('.ytcq-lite-message')).toHaveLength(4);
    renderer.destroy();
  });

  it('classifies preloaded and initial-reset rows as existing', () => {
    const preloadedStore = createLiteChatStore();
    preloadedStore.apply([
      { type: 'upsert', record: createRecord('preloaded', 'Preloaded message') }
    ]);
    const onPreloadedRow = vi.fn();
    const preloadedRenderer = createLiteChatRenderer(preloadedStore, {
      onRowRendered: onPreloadedRow
    });
    expect(onPreloadedRow).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'preloaded' }),
      'existing'
    );

    const initialStore = createLiteChatStore();
    const onInitialRow = vi.fn();
    const initialRenderer = createLiteChatRenderer(initialStore, {
      onRowRendered: onInitialRow
    });
    const initialActions = [
      { type: 'reset' as const },
      { type: 'upsert' as const, record: createRecord('initial', 'Initial message') }
    ];
    initialRenderer.rememberActionSources(initialActions, 'initial');
    initialStore.apply(initialActions);
    expect(onInitialRow).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'initial' }),
      'existing'
    );

    preloadedRenderer.destroy();
    initialRenderer.destroy();
  });

  it('marks only newly received rows for entrance motion', () => {
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('existing', 'Existing') }]);
    const renderer = createLiteChatRenderer(store);

    expect(renderer.getMessageElement('existing')?.classList.contains('ytcq-lite-message-enter'))
      .toBe(false);

    const addedActions = [
      { type: 'upsert' as const, record: createRecord('added', 'Added') }
    ];
    renderer.rememberActionSources(addedActions, 'live');
    store.apply(addedActions);
    expect(renderer.getMessageElement('added')?.classList.contains('ytcq-lite-message-enter'))
      .toBe(true);

    const changedActions = [
      { type: 'upsert' as const, record: createRecord('added', 'Changed') }
    ];
    renderer.rememberActionSources(changedActions, 'live');
    store.apply(changedActions);
    expect(renderer.getMessageElement('added')?.classList.contains('ytcq-lite-message-enter'))
      .toBe(false);
    renderer.destroy();
  });

  it('renders a busy live batch without translating the whole feed', () => {
    const store = createLiteChatStore();
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const actions = Array.from({ length: 22 }, (_value, index) => ({
      type: 'upsert' as const,
      record: createRecord(`busy-${index}`, `Busy ${index}`)
    }));

    renderer.rememberActionSources(actions, 'live');
    store.apply(actions);

    const items = renderer.root.querySelector<HTMLElement>('.ytcq-lite-items')!;
    const rows = renderer.root.querySelectorAll('.ytcq-lite-message');
    expect(rows).toHaveLength(22);
    expect(Array.from(rows).every((row) => row.classList.contains('ytcq-lite-message-enter')))
      .toBe(true);
    expect(items.classList).not.toContain('ytcq-lite-items-flowing');
    expect(items.style.transform).toBe('');
    renderer.destroy();
  });

  it('preserves live row origin while frozen and reports later revisions as changed', async () => {
    const store = createLiteChatStore({ renderLimit: 2, storeLimit: 10 });
    store.apply([
      { type: 'upsert', record: createRecord('first', 'First') },
      { type: 'upsert', record: createRecord('second', 'Second') }
    ]);
    const onRowRendered = vi.fn();
    const renderer = createLiteChatRenderer(store, { renderLimit: 2, onRowRendered });
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scrollReaderTo(scroller, 200);
    await waitForAnimationFrame();

    const liveActions = [{ type: 'upsert' as const, record: createRecord('third', 'Third') }];
    renderer.rememberActionSources(liveActions, 'live');
    store.apply(liveActions);
    expect(renderer.getMessageElement('third')).toBeNull();

    renderer.scrollToLiveEdge();
    expect(onRowRendered).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'third' }),
      'added'
    );

    const changedActions = [
      { type: 'upsert' as const, record: createRecord('third', 'Third revised') }
    ];
    renderer.rememberActionSources(changedActions, 'live');
    store.apply(changedActions);
    expect(onRowRendered).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'third', plainText: 'Third revised' }),
      'changed'
    );
    renderer.destroy();
  });

  it('does not force a reader back to live when a reset snapshot arrives', async () => {
    const store = createLiteChatStore({ renderLimit: 3, storeLimit: 20 });
    const initialActions = Array.from({ length: 5 }, (_value, index) => ({
      type: 'upsert' as const,
      record: createRecord(`message-${index}`, `Message ${index}`)
    }));
    store.apply(initialActions);
    const renderer = createLiteChatRenderer(store, { renderLimit: 3 });
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scrollReaderTo(scroller, 200);
    await waitForAnimationFrame();

    const resetActions = [
      { type: 'reset' as const },
      ...Array.from({ length: 7 }, (_value, index) => ({
        type: 'upsert' as const,
        record: createRecord(`message-${index}`, `Refreshed ${index}`)
      }))
    ];
    renderer.rememberActionSources(resetActions, 'live');
    store.apply(resetActions);

    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');
    expect(renderer.root.getAttribute('aria-live')).toBe('off');
    expect(renderer.root.querySelector<HTMLButtonElement>('.ytcq-lite-new-messages')?.hidden).toBe(
      false
    );
    renderer.destroy();
  });

  it('does not move stable rows when a busy batch only adds new messages', () => {
    const store = createLiteChatStore({ renderLimit: 5, storeLimit: 10 });
    const renderer = createLiteChatRenderer(store, { renderLimit: 5 });
    document.body.append(renderer.root);
    store.apply([
      { type: 'upsert', record: createRecord('one', 'One') },
      { type: 'upsert', record: createRecord('two', 'Two') }
    ]);

    const items = renderer.root.querySelector<HTMLElement>('.ytcq-lite-items')!;
    const stableRows = Array.from(items.querySelectorAll('.ytcq-lite-message'));
    const insertBefore = vi.spyOn(items, 'insertBefore');
    store.apply([{ type: 'upsert', record: createRecord('three', 'Three') }]);

    expect(insertBefore).toHaveBeenCalledTimes(1);
    expect(Array.from(items.querySelectorAll('.ytcq-lite-message')).slice(0, 2)).toEqual(
      stableRows
    );
    renderer.destroy();
  });

  it('uses the whole surface for chat without an extra Lite mode toolbar', () => {
    const renderer = createLiteChatRenderer(createLiteChatStore());
    expect(renderer.root.querySelector('.ytcq-lite-toolbar')).toBeNull();
    expect(renderer.root.querySelector('.ytcq-lite-exit')).toBeNull();
    expect(renderer.root.querySelector('.ytcq-lite-scroller')?.lastElementChild?.classList).toContain(
      'ytcq-lite-scroll-anchor'
    );
  });

  it('exposes connection and timestamp display state without changing feed markup', () => {
    const renderer = createLiteChatRenderer(createLiteChatStore());
    const spinner = renderer.root.querySelector<HTMLElement>('.ytcq-lite-loading-spinner')!;
    const emptyState = renderer.root.querySelector<HTMLElement>('.ytcq-lite-empty-state')!;

    expect(renderer.root.dataset.ytcqConnectionState).toBe('connecting');
    expect(renderer.root.getAttribute('aria-busy')).toBe('true');
    expect(spinner.hidden).toBe(false);
    expect(emptyState.textContent).toContain('Waiting for chat');
    expect(emptyState.textContent).not.toContain('…');
    expect(renderer.root.dataset.ytcqShowTimestamps).toBe('false');

    renderer.setConnectionState('connected');
    renderer.setTimestampsVisible(true);
    expect(renderer.root.dataset.ytcqConnectionState).toBe('connected');
    expect(renderer.root.getAttribute('aria-busy')).toBe('false');
    expect(spinner.hidden).toBe(true);
    expect(emptyState.textContent).toContain('No messages yet');
    expect(renderer.root.dataset.ytcqShowTimestamps).toBe('true');
    renderer.destroy();
  });

  it('stops live announcements while reading older messages and offers a bounded jump', async () => {
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scrollReaderTo(scroller, 200);
    await waitForAnimationFrame();
    expect(renderer.root.getAttribute('aria-live')).toBe('off');

    store.apply([{ type: 'upsert', record: createRecord('second', 'Second') }]);
    const jump = renderer.root.querySelector<HTMLButtonElement>('.ytcq-lite-new-messages')!;
    expect(jump.hidden).toBe(false);

    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }));
    scroller.scrollTop = 400;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    expect(renderer.root.getAttribute('aria-live')).toBe('polite');
    expect(jump.hidden).toBe(true);
    renderer.destroy();
  });

  it('uses upward wheel intent to cancel a queued live-edge correction', async () => {
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    store.apply([{ type: 'upsert', record: createRecord('second', 'Second') }]);
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }));
    await waitForAnimationFrame();
    expect(renderer.root.getAttribute('aria-live')).toBe('off');

    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(scroller.scrollTop).toBe(200);
    expect(renderer.root.getAttribute('aria-live')).toBe('off');
    renderer.destroy();
  });

  it('does not treat a scripted scroll as reader intent', async () => {
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    store.apply([{ type: 'upsert', record: createRecord('second', 'Second') }]);
    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(scroller.scrollTop).toBe(400);
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('true');
    expect(renderer.root.getAttribute('aria-live')).toBe('polite');
    renderer.destroy();
  });

  it('lets jump to message scroll upward without being pinned back to live', async () => {
    const store = createLiteChatStore();
    store.apply([
      { type: 'upsert', record: createRecord('first', 'First') },
      { type: 'upsert', record: createRecord('second', 'Second') }
    ]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    const target = renderer.getMessageElement('first')!;
    const scrollTo = vi.fn<HTMLElement['scrollTo']>((options) => {
      if (typeof options === 'object') scroller.scrollTop = options.top || 0;
    });
    Object.defineProperty(scroller, 'scrollTo', {
      configurable: true,
      value: scrollTo
    });
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect({
      height: 100,
      left: 0,
      top: 0,
      width: 300
    }));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect({
      height: 20,
      left: 0,
      top: -200,
      width: 300
    }));
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    jumpToChatMessage(target);
    await waitForAnimationFrame();

    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'smooth', top: 112 });
    expect(scroller.scrollTop).toBe(112);
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');
    renderer.destroy();
  });

  it('stays detached while scrolling farther from the live edge', async () => {
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scrollReaderTo(scroller, 390);
    await waitForAnimationFrame();
    scroller.scrollTop = 300;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(scroller.scrollTop).toBe(300);
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');
    expect(renderer.root.getAttribute('aria-live')).toBe('off');
    renderer.destroy();
  });

  it('stays pinned when layout growth changes the live-edge distance without upward scrolling', async () => {
    let onResize: ResizeObserverCallback = () => undefined;
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        onResize = callback;
      }

      disconnect(): void {}

      observe(): void {}

      unobserve(): void {}
    });
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500, writable: true },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      value: 600,
      writable: true
    });
    onResize([], {} as ResizeObserver);
    await waitForAnimationFrame();

    expect(renderer.root.getAttribute('aria-live')).toBe('polite');
    expect(renderer.root.querySelector<HTMLButtonElement>('.ytcq-lite-new-messages')?.hidden).toBe(
      true
    );
    expect(scroller.scrollTop).toBe(500);
    renderer.destroy();
  });

  it('waits for a layout correction before leaving the live edge', async () => {
    let onResize: ResizeObserverCallback = () => undefined;
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        onResize = callback;
      }

      disconnect(): void {}

      observe(): void {}

      unobserve(): void {}
    });
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500, writable: true },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 600, writable: true },
      scrollTop: { configurable: true, value: 300, writable: true }
    });
    scroller.dispatchEvent(new Event('scroll'));
    onResize([], {} as ResizeObserver);
    await waitForAnimationFrame();

    expect(renderer.root.getAttribute('aria-live')).toBe('polite');
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('true');
    expect(scroller.scrollTop).toBe(500);
    renderer.destroy();
  });

  it('does not swallow a small upward wheel step at the live edge', async () => {
    const store = createLiteChatStore();
    store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
    const renderer = createLiteChatRenderer(store);
    document.body.append(renderer.root);
    const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true }
    });

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }));
    scroller.scrollTop = 380;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(renderer.root.getAttribute('aria-live')).toBe('off');
    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');
    expect(scroller.scrollTop).toBe(380);
    renderer.destroy();
  });

  it('does not treat an ordinary pointer press plus a layout shift as reader scrolling', async () => {
    const { renderer, scroller } = createScrollableRenderer();

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scroller.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientY: 100,
      pointerId: 1
    }));
    scroller.scrollTop = 300;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('true');
    expect(scroller.scrollTop).toBe(400);
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    renderer.destroy();
  });

  it('clears pointer drag tracking when the pointer is released outside the scroller', async () => {
    const { renderer, scroller } = createScrollableRenderer();

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scroller.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientY: 100,
      pointerId: 2
    }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 80, pointerId: 2 }));
    document.body.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 2
    }));
    scroller.scrollTop = 300;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('true');
    expect(scroller.scrollTop).toBe(400);
    renderer.destroy();
  });

  it('releases the live edge after a pointer drag actually scrolls upward', async () => {
    const { renderer, scroller } = createScrollableRenderer();

    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();
    scroller.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientY: 100,
      pointerId: 3
    }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 80, pointerId: 3 }));
    scroller.scrollTop = 300;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForAnimationFrame();

    expect(renderer.root.dataset.ytcqFollowingLiveEdge).toBe('false');
    expect(scroller.scrollTop).toBe(300);
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3 }));
    renderer.destroy();
  });

  it('converts bounded ARGB values to CSS without accepting arbitrary values', () => {
    expect(argbToCss(0xff336699)).toBe('rgba(51, 102, 153, 1)');
    expect(argbToCss(-1)).toBe('');
    expect(argbToCss(Number.NaN)).toBe('');
  });
});

function createRecord(id: string, plainText: string): YouTubeChatMessageRecord {
  return {
    id,
    kind: 'text',
    author: {
      badges: [],
      channelId: 'UCExample',
      name: '@Example'
    },
    plainText,
    runs: plainText ? [{ type: 'text', text: plainText }] : []
  };
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function createScrollableRenderer(): {
  renderer: ReturnType<typeof createLiteChatRenderer>;
  scroller: HTMLElement;
} {
  const store = createLiteChatStore();
  store.apply([{ type: 'upsert', record: createRecord('first', 'First') }]);
  const renderer = createLiteChatRenderer(store);
  document.body.append(renderer.root);
  const scroller = renderer.root.querySelector<HTMLElement>('.ytcq-lite-scroller')!;
  Object.defineProperties(scroller, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 500 },
    scrollTop: { configurable: true, value: 400, writable: true }
  });
  return { renderer, scroller };
}

function scrollReaderTo(scroller: HTMLElement, scrollTop: number): void {
  scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }));
  scroller.scrollTop = scrollTop;
  scroller.dispatchEvent(new Event('scroll'));
}

function getRenderedMessageIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.ytcq-lite-message'))
    .map((row) => row.dataset.messageId || '');
}

function rect({
  height,
  left,
  top,
  width
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}
