import { jsx, el } from '../shared/jsx-dom';
import { createThemeStyleCache, customThemeFontFace } from '../features/custom-themes/styles';
import { drawEdgeShimmerFrame, EDGE_SHIMMER_DURATION_MS } from '../shared/edge-shimmer';
import type { ChatSkinTheme } from '../shared/chat-skins';
import type { CustomTheme, ThemeArea } from '../shared/custom-themes';

/** The onboarding frame is extension-owned. Drafts never leave this page. */
export function createThemePreview(frame: HTMLIFrameElement): {
  update: (theme: CustomTheme, mode: ChatSkinTheme) => void;
  setAppearance: (mode: ChatSkinTheme) => void;
  showArea: (area: ThemeArea) => void;
} {
  let draft: CustomTheme | null = null;
  let appearance: ChatSkinTheme = 'light';
  let area: ThemeArea = 'header';
  let activeHighlight: HTMLSpanElement | null = null;
  const themeStyles = createThemeStyleCache(render);
  function render(): void {
    const doc = frame.contentDocument;
    const preview = doc?.querySelector<HTMLElement>('#chatPreview');
    if (!draft || !doc || !preview) return;
    let style = doc.querySelector<HTMLStyleElement>('#themePreviewValues');
    if (!style) {
      style = el<HTMLStyleElement>(<style id="themePreviewValues" />);
      doc.head.append(style);
    }
    const css = `${customThemeFontFace(draft)}:root{${themeStyles(draft, appearance)}}`;
    if (style.textContent !== css) style.textContent = css;
    doc.documentElement.setAttribute('data-ytcq-chat-skin', 'custom');
    doc.documentElement.setAttribute('data-ytcq-theme-finish', draft.finish);
    doc.documentElement.setAttribute('data-ytcq-chat-skin-theme', appearance);
    doc.documentElement.removeAttribute('data-ytcq-preview-default-font');
    doc.documentElement.toggleAttribute('dark', appearance === 'dark');
    preview.dataset.chatSkin = 'custom';
    preview.dataset.chatTheme = appearance;
  }
  function showArea(): void {
    const doc = frame.contentDocument;
    if (!doc || !draft) return;
    activeHighlight?.remove();
    activeHighlight = null;
    doc.querySelector<HTMLButtonElement>('.preview-inbox-card .ytcq-profile-card-close')?.click();
    doc.querySelector<HTMLButtonElement>('.preview-profile-card .ytcq-profile-card-close')?.click();
    const win = doc.defaultView;
    if (!win || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const selector = {
      header: 'yt-live-chat-header-renderer',
      chat: 'yt-live-chat-item-list-renderer',
      composer: 'yt-live-chat-message-input-renderer'
    }[area];
    const target = doc.querySelector<HTMLElement>(selector);
    if (!target) return;
    const highlight = el<HTMLSpanElement>(
      <span class="theme-area-highlight" aria-hidden="true">
        <canvas />
      </span>
    );
    target.append(highlight);
    activeHighlight = highlight;
    const canvas = highlight.querySelector('canvas')!;
    const gradientHeight = doc.querySelector('.preview-chat-feed')?.getBoundingClientRect().height;
    const startedAt = win.performance.now();
    const requestFrame = win.requestAnimationFrame.bind(win);
    function draw(now: number): void {
      if (activeHighlight !== highlight || !highlight.isConnected) return;
      const progress = Math.min((now - startedAt) / EDGE_SHIMMER_DURATION_MS, 1);
      drawEdgeShimmerFrame(canvas, progress, gradientHeight);
      if (progress < 1) {
        requestFrame(draw);
      } else {
        highlight.remove();
        activeHighlight = null;
      }
    }
    requestFrame(draw);
  }
  frame.addEventListener('load', () => {
    render();
    showArea();
  });
  return {
    update(theme, mode) {
      // The editor mutates its draft in place. A new identity invalidates both cached appearances.
      draft = { ...theme };
      appearance = mode;
      render();
    },
    setAppearance(mode) {
      appearance = mode;
      render();
    },
    showArea(value) {
      area = value;
      showArea();
    }
  };
}
