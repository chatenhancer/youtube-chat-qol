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
