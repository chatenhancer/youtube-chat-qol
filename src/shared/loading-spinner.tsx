/**
 * Shared extension loading spinner element.
 *
 * Each UI surface owns its CSS bundle, but using one factory keeps markup,
 * accessibility defaults, and class naming consistent.
 */
import { jsx, el } from './jsx-dom';

export const LOADING_SPINNER_CLASS = 'ytcq-loading-spinner';

export function createLoadingSpinner(extraClassName = ''): HTMLElement {
  return el<HTMLSpanElement>(
    <span
      class={extraClassName ? `${LOADING_SPINNER_CLASS} ${extraClassName}` : LOADING_SPINNER_CLASS}
      aria-hidden="true"
    />
  );
}
