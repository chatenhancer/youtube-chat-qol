export {};

declare global {
  interface Window {
    __ytcqDemoCamera?: { scale: number; x: number; y: number };
    __ytcqDemoChatScrollTop?: number;
    __ytcqDemoClearStartupEffect?: () => void;
    __ytcqDemoCloseMenus?: () => void;
    __ytcqDemoCursorHotspot?: { x: number; y: number };
    __ytcqDemoCursorImages?: Partial<Record<'hand' | 'pointer', string>>;
    __ytcqDemoCursorPosition?: { x: number; y: number };
    __ytcqDemoDrawStartupEffect?: (progress: number) => void;
    __ytcqDemoManualScroll?: boolean;
    __ytcqDemoMaskInstalled?: boolean;
    __ytcqDemoOpenMessageMenu?: (key: string) => boolean;
    __ytcqDemoPresentationInstalled?: boolean;
    __ytcqDemoRenderTranslation?: (key: string, display?: string) => boolean;
    __ytcqDemoSetChatScrollTop?: (scrollTop: number) => void;
    __ytcqDemoStabilizeChat?: () => void;
    __ytcqDemoWatchBrandingInstalled?: boolean;
    ytInitialPlayerResponse?: {
      videoDetails?: {
        videoId?: string;
      };
    };
    ytcfg?: {
      data_?: Record<string, unknown>;
      get?: (key: string) => unknown;
    };
  }
}
