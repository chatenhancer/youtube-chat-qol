/**
 * Minimal Cloudflare Worker and Durable Object types used by tests and source.
 *
 * Keeping these local avoids coupling the rest of the backend to a broader
 * runtime type surface than it needs.
 */
export interface Env {
  ALLOWED_ORIGIN_PATTERNS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  STREAM_ROOMS: DurableObjectNamespace;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface DurableObjectId {
  toString(): string;
}

export interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectState {
  id: DurableObjectId;
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
}

export interface DurableObjectStorage {
  deleteAll(): Promise<void>;
}

export interface ServerWebSocket extends WebSocket {
  accept(): void;
}

export interface WebSocketPairConstructor {
  new(): {
    0: WebSocket;
    1: ServerWebSocket;
  };
}

declare global {
  const WebSocketPair: WebSocketPairConstructor;
}
