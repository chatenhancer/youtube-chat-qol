/**
 * Small shared SVG factories for extension-owned UI.
 */
export function createSvgIcon(viewBox: string, pathData: string): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', viewBox);
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  icon.append(path);

  return icon;
}

export function createCloseIcon(): SVGSVGElement {
  return createSvgIcon(
    '0 0 24 24',
    'M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z'
  );
}
