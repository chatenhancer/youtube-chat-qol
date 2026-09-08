/** Rate-limit metadata shared by the background bridge and its callers. */
export class TranslationRateLimitError extends Error {
  readonly retryAt: number;

  constructor(retryAt: number) {
    super('Translate request failed with 429');
    this.retryAt = retryAt;
  }
}

export function createTranslationError(response?: {
  code?: string;
  error?: string;
  retryAt?: number;
}): Error {
  if (response?.code === 'rate_limited' && typeof response.retryAt === 'number' && Number.isFinite(response.retryAt)) {
    return new TranslationRateLimitError(response.retryAt);
  }
  return new Error(response?.error || 'Translate request failed.');
}
