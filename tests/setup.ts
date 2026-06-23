import { vi } from 'vitest';

vi.mock('@cloudflare/containers', () => ({
  Container: class {},
  getContainer: (binding: ContainerTestNamespace, name = 'cf-singleton-container') => binding.get(binding.idFromName(name)),
  getRandom: (binding: ContainerTestNamespace, _instances = 3) => Promise.resolve(binding.get(binding.idFromName('instance-0')))
}));

type ContainerTestNamespace = {
  get(id: { toString(): string }): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  idFromName(name: string): { toString(): string };
};

const localStorageArea = createStorageArea();
const syncStorageArea = createStorageArea();

const chromeMock = {
  action: {
    getTitle: vi.fn((_details: unknown, callback?: (title: string) => void) => {
      callback?.('');
    }),
    setIcon: vi.fn((_details: unknown, callback?: () => void) => {
      callback?.();
    }),
    setTitle: vi.fn((_details: unknown, callback?: () => void) => {
      callback?.();
    })
  },
  i18n: {
    getMessage: vi.fn((key: string, substitutions?: string | string[]) => {
      if (key === 'close') return 'Close';
      const suffix = Array.isArray(substitutions) ? substitutions.join(',') : substitutions || '';
      return suffix ? `${key}:${suffix}` : key;
    }),
    getUILanguage: vi.fn(() => 'en')
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    getManifest: vi.fn(() => ({ version: '0.0.0' })),
    lastError: undefined,
    onConnect: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    sendMessage: vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ ok: true, sourceLanguage: 'es', translatedText: 'translated text' });
    })
  },
  storage: {
    local: localStorageArea,
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    sync: syncStorageArea
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn((_queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
      callback([]);
    }),
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    sendMessage: vi.fn((_tabId: number, _message: unknown, callback?: () => void) => {
      callback?.();
    })
  }
} as unknown as typeof chrome;

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: chromeMock
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn()
  }))
});

Object.defineProperty(window, 'requestAnimationFrame', {
  configurable: true,
  writable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  configurable: true,
  writable: true,
  value: (handle: number) => window.clearTimeout(handle)
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn((contextId: string) => {
    if (contextId !== '2d') return null;

    return {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: false,
      lineWidth: 1,
      setTransform: vi.fn(),
      strokeRect: vi.fn(),
      strokeStyle: ''
    } as unknown as CanvasRenderingContext2D;
  })
});

function createStorageArea(): chrome.storage.StorageArea {
  const values = new Map<string, unknown>();

  return {
    clear: vi.fn((callback?: () => void) => {
      values.clear();
      callback?.();
      return Promise.resolve();
    }),
    get: vi.fn((keys?: string | string[] | Record<string, unknown> | null, callback?: (items: Record<string, unknown>) => void) => {
      const result = readStorageValues(values, keys);
      callback?.(result);
      return Promise.resolve(result);
    }),
    getBytesInUse: vi.fn((_keys?: string | string[] | null, callback?: (bytesInUse: number) => void) => {
      callback?.(0);
      return Promise.resolve(0);
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => values.delete(key));
      callback?.();
      return Promise.resolve();
    }),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.entries(items).forEach(([key, value]) => values.set(key, value));
      callback?.();
      return Promise.resolve();
    })
  } as unknown as chrome.storage.StorageArea;
}

function readStorageValues(values: Map<string, unknown>, keys?: string | string[] | Record<string, unknown> | null): Record<string, unknown> {
  if (keys === undefined || keys === null) {
    return Object.fromEntries(values.entries());
  }

  if (typeof keys === 'string') {
    return values.has(keys) ? { [keys]: values.get(keys) } : {};
  }

  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.filter((key) => values.has(key)).map((key) => [key, values.get(key)]));
  }

  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, values.has(key) ? values.get(key) : fallback])
  );
}
