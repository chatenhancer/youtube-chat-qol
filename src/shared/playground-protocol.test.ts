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

    const protocol = await import('./playground-protocol');

    expect(protocol.PLAYGROUND_BACKEND_ORIGIN).toBe('https://playground.chatenhancer.com');
  });

  it('normalizes a local playground backend override', async () => {
    vi.resetModules();
    (globalThis as PlaygroundBackendGlobal).YTCQ_PLAYGROUND_BACKEND_ORIGIN = 'http://127.0.0.1:8787/';

    const protocol = await import('./playground-protocol');

    expect(protocol.PLAYGROUND_BACKEND_ORIGIN).toBe('http://127.0.0.1:8787');
  });

  it('ignores invalid playground backend overrides', async () => {
    vi.resetModules();
    (globalThis as PlaygroundBackendGlobal).YTCQ_PLAYGROUND_BACKEND_ORIGIN = 'ws://127.0.0.1:8787';

    const protocol = await import('./playground-protocol');

    expect(protocol.PLAYGROUND_BACKEND_ORIGIN).toBe('https://playground.chatenhancer.com');
  });
});
