declare module 'stockfish/bin/stockfish-18-lite-single.js' {
  interface StockfishModuleConfig {
    ccall?: (
      name: string,
      returnType: null,
      argTypes: ['string'],
      args: [string],
      options?: { async?: boolean }
    ) => unknown;
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance) => void
    ) => WebAssembly.Exports | Record<string, never>;
    listener?: (line: string) => void;
  }

  type StockfishModule = StockfishModuleConfig & {
    ccall: NonNullable<StockfishModuleConfig['ccall']>;
  };

  type StockfishModuleFactory = (config: StockfishModuleConfig) => Promise<StockfishModule>;

  export default function createStockfishModuleFactory(): StockfishModuleFactory;
}

declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
