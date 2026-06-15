declare module 'cloudflare:workers' {
  export class DurableObject<Env = unknown> {
    ctx: {
      container?: {
        start?: (options?: unknown) => Promise<void>;
      };
      id?: {
        toString(): string;
      };
      storage?: unknown;
      waitUntil?: (promise: Promise<unknown>) => void;
    };
    env: Env;
    constructor(ctx: unknown, env: Env);
  }

  export class WorkerEntrypoint<Env = unknown, Props = unknown> {
    ctx: unknown;
    env: Env;
    props: Props;
    constructor(ctx: unknown, env: Env, props: Props);
  }
}

declare global {
  interface DurableObjectId {
    toString(): string;
  }

  interface DurableObjectNamespace<T = unknown> {
    readonly __durableObjectNamespaceBrand?: T;
    get(id: DurableObjectId): DurableObjectStub<T>;
    idFromName(name: string): DurableObjectId;
  }

  interface DurableObjectStub<T = unknown> {
    readonly __durableObjectStubBrand?: T;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }
}

export {};
