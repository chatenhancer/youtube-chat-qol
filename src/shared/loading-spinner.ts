/**
 * Shared extension loading spinner element.
 *
 * Each UI surface owns its CSS bundle, but using one factory keeps markup,
 * accessibility defaults, and class naming consistent.
 */
import { ytcqCreateElement } from './managed-dom';

export const LOADING_SPINNER_CLASS = 'ytcq-loading-spinner';

export function createLoadingSpinner(extraClassName = ''): HTMLElement {
  const spinner = ytcqCreateElement('span');
  spinner.className = extraClassName
    ? `${LOADING_SPINNER_CLASS} ${extraClassName}`
    : LOADING_SPINNER_CLASS;
  spinner.setAttribute('aria-hidden', 'true');
  return spinner;
}
