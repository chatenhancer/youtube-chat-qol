/** Real YouTube surface diagnostics used by Lite Aero and participant scenarios. */
import { expect, test } from '@playwright/test';
import type { ChatSurface } from '../types';
import { closeOpenMenus, openChatEnhancerMenu } from '../../support/menu-openers';

const LITE_BATCH_EVENT = 'ytcq:lite-chat-batch';
const LITE_FALLBACK_EVENT = 'ytcq:lite-mode-fallback';

export const SHOULD_CAPTURE_AERO_SCREENSHOTS =
  process.env.YTCQ_CAPTURE_LIVE_AERO_SCREENSHOTS === '1';

export interface RealYouTubeSurfaceAudit {
  batchCount: number;
  fallbackReason: string;
  participantChildMutations: number;
  participantMutationCount: number;
}

interface HeaderIconSnapshot {
  active: boolean;
  buttonColor: string;
  headerBackgroundColor: string;
  headerBackgroundImage: string;
  headerBoxShadow: string;
  headerPosition: string;
  headerZIndex: string;
  svgColor: string;
  svgFill: string;
  svgFilter: string;
  theme: 'dark' | 'light';
}

export interface AeroEvidence {
  activeIcons: HeaderIconSnapshot[];
  inactiveIcons: HeaderIconSnapshot[];
  liteMessageCount: number;
  startupMs: number;
}

export async function installRealYouTubeSurfaceAudit(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(
    (_body, eventNames) => {
      const auditWindow = window as Window & {
        __ytcqRealYouTubeSurfaceAudit?: RealYouTubeSurfaceAudit;
        __ytcqRealYouTubeSurfaceAuditAbort?: AbortController;
        __ytcqRealYouTubeSurfaceAuditObserver?: MutationObserver;
      };
      auditWindow.__ytcqRealYouTubeSurfaceAuditAbort?.abort();
      auditWindow.__ytcqRealYouTubeSurfaceAuditObserver?.disconnect();
      const controller = new AbortController();
      const audit: RealYouTubeSurfaceAudit = {
        batchCount: 0,
        fallbackReason: '',
        participantChildMutations: 0,
        participantMutationCount: 0
      };
      auditWindow.__ytcqRealYouTubeSurfaceAudit = audit;
      auditWindow.__ytcqRealYouTubeSurfaceAuditAbort = controller;
      window.addEventListener(
        eventNames.batch,
        () => {
          audit.batchCount += 1;
        },
        { signal: controller.signal }
      );
      window.addEventListener(
        eventNames.fallback,
        (event) => {
          if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
          try {
            const detail = JSON.parse(event.detail) as { reason?: unknown };
            if (typeof detail.reason === 'string') audit.fallbackReason = detail.reason;
          } catch {
            audit.fallbackReason = 'invalid-fallback-detail';
          }
        },
        { signal: controller.signal }
      );
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target =
            mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
          const participantMutation =
            Boolean(target?.closest('yt-live-chat-participant-list-renderer')) ||
            [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
              return (
                node instanceof Element &&
                (node.matches('yt-live-chat-participant-list-renderer') ||
                  Boolean(node.querySelector('yt-live-chat-participant-list-renderer')))
              );
            });
          if (!participantMutation) continue;
          audit.participantMutationCount += 1;
          if (mutation.type === 'childList') audit.participantChildMutations += 1;
        }
      });
      observer.observe(document.documentElement, {
        attributeFilter: ['aria-hidden', 'aria-selected', 'class', 'hidden', 'selected'],
        attributes: true,
        childList: true,
        subtree: true
      });
      auditWindow.__ytcqRealYouTubeSurfaceAuditObserver = observer;
    },
    { batch: LITE_BATCH_EVENT, fallback: LITE_FALLBACK_EVENT }
  );
}

export async function getRealYouTubeSurfaceAudit(
  chat: ChatSurface
): Promise<RealYouTubeSurfaceAudit> {
  return chat.locator('body').evaluate(() => {
    return (
      (window as Window & { __ytcqRealYouTubeSurfaceAudit?: RealYouTubeSurfaceAudit })
        .__ytcqRealYouTubeSurfaceAudit || {
        batchCount: 0,
        fallbackReason: '',
        participantChildMutations: 0,
        participantMutationCount: 0
      }
    );
  });
}

export async function uninstallRealYouTubeSurfaceAudit(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(() => {
    const auditWindow = window as Window & {
      __ytcqRealYouTubeSurfaceAudit?: RealYouTubeSurfaceAudit;
      __ytcqRealYouTubeSurfaceAuditAbort?: AbortController;
      __ytcqRealYouTubeSurfaceAuditObserver?: MutationObserver;
    };
    auditWindow.__ytcqRealYouTubeSurfaceAuditAbort?.abort();
    auditWindow.__ytcqRealYouTubeSurfaceAuditObserver?.disconnect();
    delete auditWindow.__ytcqRealYouTubeSurfaceAudit;
    delete auditWindow.__ytcqRealYouTubeSurfaceAuditAbort;
    delete auditWindow.__ytcqRealYouTubeSurfaceAuditObserver;
  });
}

export async function sampleMenuIconThemes(
  chat: ChatSurface,
  active: boolean,
  captureScreenshots = false
): Promise<HeaderIconSnapshot[]> {
  const snapshots: HeaderIconSnapshot[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await chat.locator('html').evaluate((element, value) => {
      element.setAttribute('data-ytcq-chat-skin', 'aero');
      element.setAttribute('data-ytcq-chat-skin-theme', value);
    }, theme);
    const menu = await openChatEnhancerMenu(chat);
    const snapshot = await chat
      .locator('[data-ytcq-setting="liteModeEnabled"] .ytcq-paper-item')
      .first()
      .evaluate(
        (button, values) => {
          const header = document.querySelector('yt-live-chat-header-renderer');
          const svg = button.querySelector('svg');
          if (!header || !svg) {
            throw new Error('Lite menu icon or native header is missing.');
          }
          const buttonStyle = getComputedStyle(button);
          const headerStyle = getComputedStyle(header);
          const svgStyle = getComputedStyle(svg);
          return {
            active: values.active,
            buttonColor: buttonStyle.color,
            headerBackgroundColor: headerStyle.backgroundColor,
            headerBackgroundImage: headerStyle.backgroundImage,
            headerBoxShadow: headerStyle.boxShadow,
            headerPosition: headerStyle.position,
            headerZIndex: headerStyle.zIndex,
            svgColor: svgStyle.color,
            svgFill: svgStyle.fill,
            svgFilter: svgStyle.filter,
            theme: values.theme
          };
        },
        { active, theme }
      );
    snapshots.push(snapshot);
    await expect(menu.locator('[data-ytcq-setting="liteModeEnabled"]')).toHaveAttribute('aria-checked', String(active));
    if (captureScreenshots) {
      const screenshot = await chat
        .locator('yt-live-chat-renderer')
        .screenshot({ animations: 'disabled' })
        .catch(() => null);
      if (screenshot) {
        await test.info().attach(`lite-aero-${theme}`, {
          body: screenshot,
          contentType: 'image/png'
        });
      }
    }
  }
  await closeOpenMenus(chat);
  return snapshots;
}
