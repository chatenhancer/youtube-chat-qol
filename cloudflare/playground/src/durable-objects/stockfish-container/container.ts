import { Container, type StopParams } from '@cloudflare/containers';
import { getLogErrorType, logPlaygroundEvent } from '../../logging';
import type { Env } from '../../types';

export class StockfishContainer extends Container<Env> {
  defaultPort = 8080;
  enableInternet = false;
  pingEndpoint = 'localhost/health';
  sleepAfter = '10m';

  override onStart(): void {
    logPlaygroundEvent('stockfish_container_started');
  }

  override onStop(params: StopParams): void {
    logPlaygroundEvent('stockfish_container_stopped', {
      exitCode: params.exitCode,
      reason: params.reason
    });
  }

  override onError(error: unknown): never {
    logPlaygroundEvent('stockfish_container_error', {
      errorMessage: getErrorMessage(error),
      errorType: getLogErrorType(error)
    }, 'error');
    throw error;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
