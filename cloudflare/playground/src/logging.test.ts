import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hashLogValue,
  logPlaygroundEvent,
  shortLogId
} from './logging';

describe('playground logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs structured events without empty fields', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logPlaygroundEvent('game_started', {
      game: 'game_123',
      room: hashLogValue('stream-id'),
      user: undefined
    });

    expect(info).toHaveBeenCalledWith('[Chat Enhancer Playground] game_started', {
      event: 'game_started',
      game: 'game_123',
      room: hashLogValue('stream-id'),
      service: 'chat-enhancer-playground'
    });
  });

  it('uses warning and error console levels', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logPlaygroundEvent('origin_rejected', {}, 'warn');
    logPlaygroundEvent('room_fetch_failed', {}, 'error');

    expect(warn).toHaveBeenCalledWith('[Chat Enhancer Playground] origin_rejected', {
      event: 'origin_rejected',
      service: 'chat-enhancer-playground'
    });
    expect(error).toHaveBeenCalledWith('[Chat Enhancer Playground] room_fetch_failed', {
      event: 'room_fetch_failed',
      service: 'chat-enhancer-playground'
    });
  });

  it('hashes values and shortens generated ids for logs', () => {
    expect(hashLogValue('stream-id')).toMatch(/^h_[a-z0-9]+$/);
    expect(hashLogValue('stream-id')).toBe(hashLogValue('stream-id'));
    expect(hashLogValue('stream-id')).not.toBe('stream-id');
    expect(shortLogId('game_1234567890abcdef_extra')).toBe('game_1234567890abc');
  });
});
