import { jsx, el } from '../shared/jsx-dom';
import { createThemeStyleCache, customThemeFontFace } from '../features/custom-themes/styles';
import { luminance, themeAppearance } from '../features/custom-themes/appearance';
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
    doc.querySelector<HTMLButtonElement>('.preview-inbox-card .ytcq-profile-card-close')?.click();
    doc.querySelector<HTMLButtonElement>('.preview-profile-card .ytcq-profile-card-close')?.click();
    const selector = {
      header: 'yt-live-chat-header-renderer',
      chat: 'yt-live-chat-item-list-renderer',
      composer: 'yt-live-chat-message-input-renderer'
    }[area];
    const target = doc.querySelector<HTMLElement>(selector);
    if (!target) return;
    const previous = doc.querySelector('.theme-area-highlight');
    previous?.getAnimations().forEach((animation) => animation.cancel());
    previous?.remove();
    const highlight = el<HTMLSpanElement>(<span class="theme-area-highlight" aria-hidden="true" />);
    // White would disappear against a pale surface, so choose the contrasting wash.
    highlight.style.backgroundColor =
      luminance(themeAppearance(draft, appearance).surfaces[area].color) > 0.45
        ? 'rgb(0 0 0 / 0.16)'
        : 'rgb(255 255 255 / 0.12)';
    target.append(highlight);
    // One gentle pulse; reduced motion keeps a steady wash before fading.
    const reduced = frame.contentWindow?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = highlight.animate(
      [
        { opacity: reduced ? 1 : 0 },
        { opacity: 1, offset: 0.3 },
        { opacity: 1, offset: reduced ? 0.9 : 0.45 },
        { opacity: 0 }
      ],
      { duration: reduced ? 1000 : 900, easing: 'ease-in-out' }
    );
    animation.id = 'theme-area-highlight';
    animation.onfinish = animation.oncancel = () => highlight.remove();
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
