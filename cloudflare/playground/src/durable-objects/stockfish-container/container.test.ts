import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cloudflare/containers', () => ({
  Container: class {}
}));

import { StockfishContainer } from './container';

describe('StockfishContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forcefully destroys the stateless container when activity expires', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const destroy = vi.fn().mockResolvedValue(undefined);

    await StockfishContainer.prototype.onActivityExpired.call(
      { destroy } as unknown as StockfishContainer
    );

    expect(destroy).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(
      '[playground] stockfish_container_activity_expired',
      {
        event: 'stockfish_container_activity_expired',
        service: 'chat-enhancer-playground'
      }
    );
  });
});
