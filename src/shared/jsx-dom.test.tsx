import { describe, expect, it, vi } from 'vitest';
import { Fragment, jsx, el, toSVGElement } from './jsx-dom';
import { isExtensionManagedElement } from './managed-dom';

describe('jsx-dom', () => {
  it('creates managed HTML elements with attributes, text, and listeners', () => {
    const onClick = vi.fn((event: Event) => event.preventDefault());
    const button = el<HTMLButtonElement>(
      <button
        type="button"
        class="ytcq-test-button"
        data-ytcq-owner="test"
        aria-expanded={false}
        onClick={onClick}
      >
        Save
      </button>
    );

    button.click();

    expect(button.type).toBe('button');
    expect(button.className).toBe('ytcq-test-button');
    expect(button.dataset.ytcqOwner).toBe('test');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toBe('Save');
    expect(isExtensionManagedElement(button)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('supports refs and fragments', () => {
    let ref: HTMLSpanElement | null = null;
    const wrapper = el<HTMLDivElement>(
      <div>
        <>
          <span ref={(element: HTMLSpanElement) => (ref = element)}>One</span>
          <span>Two</span>
        </>
      </div>
    );

    expect(wrapper.children).toHaveLength(2);
    expect(ref).toBe(wrapper.firstElementChild);
  });

  it('creates managed SVG elements', () => {
    const icon = toSVGElement<SVGSVGElement>(
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M0 0h1v1H0z" />
      </svg>
    );

    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.firstElementChild?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(isExtensionManagedElement(icon)).toBe(true);
  });
});
