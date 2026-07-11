import { describe, expect, it, vi } from 'vitest';
import type { LiteChatAction, LiteChatMessageRecord } from './protocol';
import { createLiteChatStore } from './store';

describe('Lite chat store', () => {
  it('dedupes upserts by ID and preserves message order for updates', () => {
    const store = createLiteChatStore();
    store.apply([
      { type: 'upsert', record: createRecord('first', 'First') },
      { type: 'upsert', record: createRecord('second', 'Second') }
    ]);

    const change = store.apply([
      { type: 'upsert', record: createRecord('first', 'Updated first') }
    ]);

    expect(store.getRecords().map((record) => record.id)).toEqual(['first', 'second']);
    expect(store.get('first')?.plainText).toBe('Updated first');
    expect(change).toMatchObject({ addedIds: [], updatedIds: ['first'] });
  });

  it('ignores byte-identical upserts without notifying or erasing row state', () => {
    const store = createLiteChatStore();
    const listener = vi.fn();
    const record = createRecord('same', 'Same');
    store.apply([upsert(record)]);
    store.subscribe(listener);

    const unchanged = store.apply([upsert({
      ...record,
      author: record.author ? { ...record.author, badges: [...record.author.badges] } : undefined,
      runs: record.runs.map((run) => ({ ...run }))
    })]);
    expect(unchanged).toEqual({
      addedIds: [],
      removedIds: [],
      reset: false,
      updatedIds: []
    });
    expect(listener).not.toHaveBeenCalled();

    store.apply([upsert(createRecord('same', 'Changed'))]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].updatedIds).toEqual(['same']);
  });

  it('applies message, author, and reset removals', () => {
    const store = createLiteChatStore();
    store.apply([
      upsert(createRecord('one', 'One', 'channel-a')),
      upsert(createRecord('two', 'Two', 'channel-b')),
      upsert(createRecord('three', 'Three', 'channel-a'))
    ]);

    store.apply([{ type: 'remove-author', channelId: 'channel-a' }]);
    expect(store.getRecords().map((record) => record.id)).toEqual(['two']);

    store.apply([{ type: 'remove', id: 'two' }]);
    expect(store.getSize()).toBe(0);

    const change = store.apply([
      upsert(createRecord('after', 'After')),
      { type: 'reset' },
      upsert(createRecord('fresh', 'Fresh'))
    ]);
    expect(change.reset).toBe(true);
    expect(store.getRecords().map((record) => record.id)).toEqual(['fresh']);
  });

  it('keeps bounded history and exposes a smaller latest render window', () => {
    const store = createLiteChatStore({ renderLimit: 3, storeLimit: 5 });
    store.apply(Array.from({ length: 7 }, (_value, index) => (
      upsert(createRecord(`message-${index}`, `Message ${index}`))
    )));

    expect(store.getRecords().map((record) => record.id)).toEqual([
      'message-2',
      'message-3',
      'message-4',
      'message-5',
      'message-6'
    ]);
    expect(store.getLatest().map((record) => record.id)).toEqual([
      'message-4',
      'message-5',
      'message-6'
    ]);
  });

  it('notifies subscribers once per changed action batch', () => {
    const store = createLiteChatStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.apply([upsert(createRecord('one', 'One')), upsert(createRecord('two', 'Two'))]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].addedIds).toEqual(['one', 'two']);

    unsubscribe();
    store.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

function upsert(record: LiteChatMessageRecord): LiteChatAction {
  return { type: 'upsert', record };
}

function createRecord(id: string, plainText: string, channelId = 'channel'): LiteChatMessageRecord {
  return {
    id,
    kind: 'text',
    author: {
      badges: [],
      channelId,
      name: `@${channelId}`
    },
    plainText,
    runs: [{ type: 'text', text: plainText }]
  };
}
