type ExtensionAction = Pick<typeof chrome.action, 'getTitle' | 'setIcon' | 'setTitle'>;

export function getExtensionAction(): ExtensionAction {
  const runtimeChrome = chrome as typeof chrome & {
    browserAction?: ExtensionAction;
  };
  return (runtimeChrome.action || runtimeChrome.browserAction) as ExtensionAction;
}

export function isBrowserActionOnly(): boolean {
  const runtimeChrome = chrome as typeof chrome & {
    browserAction?: ExtensionAction;
  };
  return !runtimeChrome.action && Boolean(runtimeChrome.browserAction);
}
