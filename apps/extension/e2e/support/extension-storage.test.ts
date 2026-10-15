import type { BrowserContext, Worker } from '@playwright/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getExtensionServiceWorker } from './extension';
import { withExtensionStorageValues } from './extension-storage';

vi.mock('./extension', () => ({ getExtensionServiceWorker: vi.fn() }));

describe('temporary extension storage', () => {
  const evaluate = vi.fn();
  const context = {} as BrowserContext;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getExtensionServiceWorker).mockResolvedValue({ evaluate } as unknown as Worker);
    evaluate.mockResolvedValueOnce({
      requestedKeys: ['liteModeEnabled'],
      existingKeys: [],
      values: {}
    }).mockResolvedValueOnce(undefined);
  });

  it('returns the scenario result when storage restoration succeeds', async () => {
    evaluate.mockResolvedValueOnce(undefined);
    await expect(withExtensionStorageValues(context, 'sync', { liteModeEnabled: true }, async () => 'result'))
      .resolves.toBe('result');
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it('preserves the scenario error when storage restoration succeeds', async () => {
    const failure = new Error('Extension toggle did not change');
    evaluate.mockResolvedValueOnce(undefined);
    await expect(withExtensionStorageValues(context, 'sync', { liteModeEnabled: true }, async () => {
      throw failure;
    })).rejects.toBe(failure);
  });

  it('reports both failures with the scenario error as the cause when cleanup also fails', async () => {
    const failure = new Error('Extension toggle did not change');
    const cleanupFailure = new Error('Extension worker did not restart');
    evaluate.mockRejectedValueOnce(cleanupFailure);
    const result = withExtensionStorageValues(context, 'sync', { liteModeEnabled: true }, async () => {
      throw failure;
    });
    await expect(result).rejects.toMatchObject({
      name: 'AggregateError',
      cause: failure,
      errors: [failure, cleanupFailure]
    });
  });

  it('fails on a cleanup error even when the scenario passed', async () => {
    const cleanupFailure = new Error('Extension worker did not restart');
    evaluate.mockRejectedValueOnce(cleanupFailure);
    await expect(withExtensionStorageValues(context, 'sync', { liteModeEnabled: true }, async () => 'result'))
      .rejects.toBe(cleanupFailure);
  });
});
