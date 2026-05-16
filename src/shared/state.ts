/**
 * Content-script option cache.
 *
 * chrome.storage remains the source of truth, but feature modules need cheap
 * synchronous reads during DOM event handlers. The main content script keeps
 * this cache updated when storage changes.
 */
import { DEFAULT_OPTIONS, type Options } from './options';

let options: Options = { ...DEFAULT_OPTIONS };

export function getOptions(): Options {
  return options;
}

export function setOptions(nextOptions: Options): void {
  options = nextOptions;
}
