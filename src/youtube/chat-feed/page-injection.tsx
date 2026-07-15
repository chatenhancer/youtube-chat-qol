import { jsx, el, UNMANAGED } from '../../shared/jsx-dom';

const CHAT_FEED_PAGE_SCRIPT_ID = 'ytcq-chat-feed-page-transport';
let chatFeedPageInjectionStarted = false;

export function injectYouTubeChatFeedPage(): void {
  const shouldInject =
    (globalThis as { YTCQ_INJECT_CHAT_FEED_PAGE?: boolean }).YTCQ_INJECT_CHAT_FEED_PAGE === true;
  if (!shouldInject) return;
  if (chatFeedPageInjectionStarted) return;
  if (document.getElementById(CHAT_FEED_PAGE_SCRIPT_ID)) return;

  chatFeedPageInjectionStarted = true;
  const scriptUrl = chrome.runtime.getURL('chat-feed-page.js');
  void fetch(scriptUrl)
    .then((response) =>
      response.ok ? response.text() : Promise.reject(new Error(`Failed to load ${scriptUrl}`))
    )
    .then((source) => {
      injectInlineScript(`${source}\n//# sourceURL=${scriptUrl}`);
    })
    .catch(() => {
      injectExternalScript(scriptUrl);
    });
}

function injectInlineScript(source: string): void {
  if (document.getElementById(CHAT_FEED_PAGE_SCRIPT_ID)) return;

  const script = el<HTMLScriptElement>(<script id={CHAT_FEED_PAGE_SCRIPT_ID} />, UNMANAGED);
  const nonce = getDocumentScriptNonce();
  if (nonce) script.nonce = nonce;
  script.text = getTrustedScript(source) as string;
  (document.head || document.documentElement).append(script);
}

function injectExternalScript(scriptUrl: string): void {
  if (document.getElementById(CHAT_FEED_PAGE_SCRIPT_ID)) return;

  const script = el<HTMLScriptElement>(
    <script id={CHAT_FEED_PAGE_SCRIPT_ID} async={false} />,
    UNMANAGED
  );
  const nonce = getDocumentScriptNonce();
  if (nonce) script.nonce = nonce;
  script.src = getTrustedScriptUrl(scriptUrl) as string;
  script.addEventListener(
    'error',
    () => {
      chatFeedPageInjectionStarted = false;
      script.remove();
    },
    { once: true }
  );
  (document.head || document.documentElement).append(script);
}

function getDocumentScriptNonce(): string {
  const script = document.querySelector<HTMLScriptElement>('script[nonce]');
  return script?.nonce || script?.getAttribute('nonce') || '';
}

function getTrustedScript(code: string): string | unknown {
  const trustedTypes = (
    window as Window & {
      trustedTypes?: {
        createPolicy: (
          name: string,
          rules: { createScript: (value: string) => string }
        ) => { createScript: (value: string) => unknown };
      };
    }
  ).trustedTypes;

  if (!trustedTypes) return code;

  try {
    const policy = trustedTypes.createPolicy(`ytcqChatFeedInline${Date.now()}`, {
      createScript: (value) => value
    });
    return policy.createScript(code);
  } catch {
    return code;
  }
}

function getTrustedScriptUrl(url: string): string | unknown {
  const trustedTypes = (
    window as Window & {
      trustedTypes?: {
        createPolicy: (
          name: string,
          rules: { createScriptURL: (value: string) => string }
        ) => { createScriptURL: (value: string) => unknown };
      };
    }
  ).trustedTypes;

  if (!trustedTypes) return url;

  try {
    const policy = trustedTypes.createPolicy(`ytcqChatFeedPage${Date.now()}`, {
      createScriptURL: (value) => value
    });
    return policy.createScriptURL(url);
  } catch {
    return url;
  }
}
