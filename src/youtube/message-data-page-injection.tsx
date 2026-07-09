import { jsx, el, UNMANAGED } from '../shared/jsx-dom';

const MESSAGE_DATA_PAGE_SCRIPT_ID = 'ytcq-message-data-page-adapter';
let messageDataPageInjectionStarted = false;

export function injectYouTubeMessageDataPage(): void {
  const shouldInject =
    (globalThis as { YTCQ_INJECT_MESSAGE_DATA_PAGE?: boolean }).YTCQ_INJECT_MESSAGE_DATA_PAGE ===
    true;
  if (!shouldInject) return;
  if (messageDataPageInjectionStarted) return;
  if (document.getElementById(MESSAGE_DATA_PAGE_SCRIPT_ID)) return;

  messageDataPageInjectionStarted = true;
  const scriptUrl = chrome.runtime.getURL('message-data-page.js');
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
  if (document.getElementById(MESSAGE_DATA_PAGE_SCRIPT_ID)) return;

  const script = el<HTMLScriptElement>(<script id={MESSAGE_DATA_PAGE_SCRIPT_ID} />, UNMANAGED);
  const nonce = getDocumentScriptNonce();
  if (nonce) script.nonce = nonce;
  script.text = getTrustedScript(source) as string;
  (document.head || document.documentElement).append(script);
}

function injectExternalScript(scriptUrl: string): void {
  if (document.getElementById(MESSAGE_DATA_PAGE_SCRIPT_ID)) return;

  const script = el<HTMLScriptElement>(
    <script id={MESSAGE_DATA_PAGE_SCRIPT_ID} async={false} />,
    UNMANAGED
  );
  const nonce = getDocumentScriptNonce();
  if (nonce) script.nonce = nonce;
  script.src = getTrustedScriptUrl(scriptUrl) as string;
  script.addEventListener(
    'error',
    () => {
      messageDataPageInjectionStarted = false;
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
    const policy = trustedTypes.createPolicy(`ytcqMessageDataInline${Date.now()}`, {
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
    const policy = trustedTypes.createPolicy(`ytcqMessageDataPage${Date.now()}`, {
      createScriptURL: (value) => value
    });
    return policy.createScriptURL(url);
  } catch {
    return url;
  }
}
