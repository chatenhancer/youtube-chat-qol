import { afterEach, describe, expect, it, vi } from 'vitest';

interface PlaygroundBackendGlobal {
  YTCQ_PLAYGROUND_BACKEND_ORIGIN?: string;
}

describe('playground protocol backend origin', () => {
  afterEach(() => {
    delete (globalThis as PlaygroundBackendGlobal).YTCQ_PLAYGROUND_BACKEND_ORIGIN;
  });

  it('uses the production playground backend by default', async () => {
    vi.resetModules();

    const protocol = await import('./protocol');

    expect(protocol.PLAYGROUND_BACKEND_ORIGIN).toBe('https://playground.chatenhancer.com');
  });

  it('normalizes a local playground backend override', async () => {
    vi.resetModules();
    (globalThis as PlaygroundBackendGlobal).YTCQ_PLAYGROUND_BACKEND_ORIGIN = 'http://127.0.0.1:8787/';

    const protocol = await import('./protocol');

    expect(protocol.PLAYGROUND_BACKEND_ORIGIN).toBe('http://127.0.0.1:8787');
  });

  it('ignores invalid playground backend overrides', async () => {
    vi.resetModules();
    (globalThis as PlaygroundBackendGlobal).YTCQ_PLAYGROUND_BACKEND_ORIGIN = 'ws://127.0.0.1:8787';

    const protocol = await import('./protocol');

    expect(protocol.PLAYGROUND_BACKEND_ORIGIN).toBe('https://playground.chatenhancer.com');
  });

  it('recognizes game-scoped computer player ids', async () => {
    vi.resetModules();

    const protocol = await import('./protocol');

    expect(protocol.isPlaygroundComputerUserId('server:computer:chess:club')).toBe(true);
    expect(protocol.isPlaygroundComputerUserId('server:computer:bounty-hunting')).toBe(true);
    expect(protocol.isPlaygroundComputerUserId('server:computer')).toBe(false);
    expect(protocol.isPlaygroundComputerUserId('human-user')).toBe(false);
  });

  it('matches game versions exactly and treats missing versions as version one', async () => {
    vi.resetModules();

    const protocol = await import('./protocol');

    expect(protocol.PLAYGROUND_PROTOCOL_VERSION).toBe(1);
    expect(protocol.PLAYGROUND_GAME_VERSIONS).toEqual({
      'bounty-hunting': 2,
      chess: 1,
      'replay-trivia': 2,
      'stick-around': 1
    });
    expect(protocol.isPlaygroundGameVersionCompatible('bounty-hunting')).toBe(false);
    expect(protocol.isPlaygroundGameVersionCompatible('chess')).toBe(true);
    expect(protocol.isPlaygroundGameVersionCompatible('bounty-hunting', {
      'bounty-hunting': 2
    })).toBe(true);
    expect(protocol.isPlaygroundGameVersionCompatible('bounty-hunting', {
      'bounty-hunting': 3
    })).toBe(false);
    expect(protocol.isPlaygroundGameVersionCompatible('replay-trivia')).toBe(false);
    expect(protocol.isPlaygroundGameVersionCompatible('replay-trivia', {
      'replay-trivia': 2
    })).toBe(true);
    expect(protocol.filterCompatiblePlaygroundGames(['chess', 'bounty-hunting'], undefined)).toEqual(['chess']);
  });
});
