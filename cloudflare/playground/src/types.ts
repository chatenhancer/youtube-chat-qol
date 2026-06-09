export interface Env {
  ALLOWED_ORIGINS?: string;
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
