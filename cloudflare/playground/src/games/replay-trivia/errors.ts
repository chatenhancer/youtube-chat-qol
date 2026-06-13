/**
 * Replay Trivia domain error.
 *
 * Carries the public error code and HTTP status that the route handler should
 * return without exposing provider or transcript internals.
 */
export class ReplayTriviaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}
