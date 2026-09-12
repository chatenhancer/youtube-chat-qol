import { jsx, el } from '../../shared/jsx-dom';
import { t } from '../../shared/i18n';
import { createSvgIcon } from '../../shared/icons';

export const PIP_ICON_PATH =
  'M8 3h10a3 3 0 0 1 3 3v10 M6 8h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z';

/** Reuse YouTube's current player styles, including styles inserted at runtime. */
export function copyPageStyles(target: Document): void {
  for (const sheet of document.styleSheets) {
    if (sheet.disabled) continue;
    try {
      target.head.append(
        el<HTMLStyleElement>(
          <style media={sheet.media.mediaText}>
            {Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')}
          </style>
        )
      );
    } catch {
      // Cross-origin sheets cannot expose cssRules; load their original URL.
      if (!sheet.href) continue;
      target.head.append(
        el<HTMLLinkElement>(
          <link rel="stylesheet" href={sheet.href} media={sheet.media.mediaText} />
        )
      );
    }
  }
}

export function createPipStyles(): HTMLStyleElement {
  return el<HTMLStyleElement>(
    <style>{`
    :root { color-scheme: light dark; background: #000; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
    body { display: grid; grid-template-rows: min(42vh, 56.25vw) minmax(0, 1fr); }
    body > #movie_player, body > iframe {
      box-sizing: border-box !important; position: relative !important;
      width: 100% !important; height: 100% !important;
      min-width: 0 !important; min-height: 0 !important;
      max-width: none !important; max-height: none !important;
      margin: 0 !important; border: 0 !important; transform: none !important;
    }
    body > #movie_player { background: #000 !important; }
    body > iframe {
      background: var(--yt-live-chat-background-color, #0f0f0f);
      border-top: var(--yt-live-chat-header-bottom-border, 1px solid rgba(128, 128, 128, 0.24)) !important;
    }
    #movie_player .html5-video-container { width: 100% !important; height: 100% !important; }
    #movie_player video {
      width: 100% !important; height: 100% !important;
      left: 0 !important; top: 0 !important; object-fit: contain !important;
    }
    #movie_player .ytp-chrome-bottom { width: calc(100% - 24px) !important; }
    #movie_player .ytp-miniplayer-button, #movie_player .ytp-size-button,
    #movie_player .ytp-fullscreen-button, #movie_player .ytp-pip-button { display: none !important; }
    @media (min-width: 680px) and (min-aspect-ratio: 4/3) {
      body { grid-template-rows: minmax(0, 1fr); grid-template-columns: minmax(0, 1fr) clamp(280px, 38vw, 380px); }
      body > iframe { border-top: 0 !important; border-left: var(--yt-live-chat-header-bottom-border, 1px solid rgba(128, 128, 128, 0.24)) !important; }
    }
  `}</style>
  );
}

export function createPipPlaceholder(
  onReturn: () => void,
  surface: 'video' | 'chat'
): HTMLDivElement {
  const icon = createSvgIcon('0 0 24 24', PIP_ICON_PATH, 2);
  icon.setAttribute('style', 'width:24px;height:24px;fill:currentColor;flex:none');
  return el<HTMLDivElement>(
    <div class={`ytcq-pip-placeholder ytcq-pip-${surface}-placeholder`}>
      {surface === 'video' && (
        <style>{`
        .ytcq-pip-placeholder {
          position: absolute; inset: 0; z-index: 60; display: flex;
          flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; padding: 24px; box-sizing: border-box; border-radius: inherit;
          background: #fff; color: #0f0f0f;
          font: 14px Roboto, Arial, sans-serif; text-align: center;
        }
        html[dark] .ytcq-pip-placeholder { background: #0f0f0f; color: #f1f1f1; }
      `}</style>
      )}
      <span>{t('playingInPip')}</span>
      <button
        type="button"
        class="ytcq-pip-return-button ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconLeading ytSpecButtonShapeNextEnableBackdropFilterExperiment ytSpecButtonShapeNextMainstageIconSize ytSpecButtonShapeNextMainstagePadding"
        style="max-width:100%;height:40px;flex:0 0 auto"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          onReturn();
        }}
      >
        <div
          aria-hidden="true"
          class="ytSpecButtonShapeNextIcon ytSpecButtonShapeNextElevatedContent"
        >
          {icon}
        </div>
        <div class="ytSpecButtonShapeNextButtonTextContent ytSpecButtonShapeNextElevatedContent">
          <span class="ytAttributedStringHost ytAttributedStringWhiteSpaceNoWrap">
            {t('returnVideoChat')}
          </span>
        </div>
        <yt-touch-feedback-shape
          aria-hidden="true"
          class="ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse"
        >
          <div class="ytSpecTouchFeedbackShapeStroke" />
          <div class="ytSpecTouchFeedbackShapeFill" />
        </yt-touch-feedback-shape>
      </button>
    </div>
  );
}
