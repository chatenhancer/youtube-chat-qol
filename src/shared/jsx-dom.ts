/**
 * Tiny JSX-to-DOM factory.
 *
 * This is intentionally not a UI runtime. JSX compiles to calls to `jsx()`,
 * and each call immediately returns DOM nodes created with the extension's
 * managed DOM helpers.
 */
import {
  markExtensionManagedElement,
  unmarkExtensionManagedElement,
  ytcqCreateElement
} from './managed-dom';

type JsxComponent = (props: Record<string, unknown>) => JsxChild;
type JsxTag = string | JsxComponent;
type JsxProps = Record<string, unknown> | null;
type JsxChild = Node | string | number | boolean | null | undefined | JsxChild[];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const UNMANAGED = Symbol('ytcq.unmanaged');
const SVG_TAG_NAMES = new Set([
  'circle',
  'clipPath',
  'defs',
  'ellipse',
  'g',
  'line',
  'linearGradient',
  'mask',
  'path',
  'polygon',
  'polyline',
  'rect',
  'stop',
  'svg',
  'text',
  'use'
]);
const HTML_PROPERTY_NAMES = new Set([
  'referrerPolicy'
]);
const HTML_ATTRIBUTE_NAMES = new Set([
  'sizes'
]);

export function jsx(tag: JsxTag, props: JsxProps, ...children: JsxChild[]): Node {
  if (typeof tag === 'function') {
    const componentProps = {
      ...(props || {}),
      children: children.length <= 1 ? children[0] : children
    };
    return childToNode(tag(componentProps));
  }

  const element = createManagedJsxElement(tag);
  const ref = props?.ref;

  Object.entries(props || {}).forEach(([name, value]) => {
    if (name === 'children' || name === 'ref') return;
    applyJsxProp(element, name, value);
  });

  appendJsxChildren(element, children);
  if (typeof ref === 'function') ref(element);
  return element;
}

export function Fragment({ children }: { children?: JsxChild }): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendJsxChildren(fragment, [children]);
  return fragment;
}

/** Create a typed JSX element or a comment placeholder from text. */
export function el<T extends Element | Comment = HTMLElement>(
  node: T extends Comment ? string : Node,
  mode?: T extends Comment ? never : typeof UNMANAGED
): T {
  if (typeof node === 'string') return document.createComment(node) as unknown as T;
  if (node instanceof Element) {
    return (mode === UNMANAGED
      ? unmarkExtensionManagedElement(node)
      : node) as unknown as T;
  }

  throw new Error('Expected JSX to create an Element or comment text');
}

function createManagedJsxElement(tagName: string): HTMLElement | SVGElement {
  if (SVG_TAG_NAMES.has(tagName)) {
    return markExtensionManagedElement(document.createElementNS(SVG_NAMESPACE, tagName));
  }

  return ytcqCreateElement(tagName as keyof HTMLElementTagNameMap);
}

function applyJsxProp(element: Element, name: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (name.startsWith('__')) return;
  if (name === 'class' || name === 'className') {
    setClassName(element, value);
    return;
  }
  if (name === 'style') {
    setStyle(element, value);
    return;
  }
  if (name.startsWith('on') && typeof value === 'function') {
    addJsxEventListener(element, name, value as EventListener);
    return;
  }
  if (name.startsWith('aria-') || name.startsWith('data-')) {
    element.setAttribute(name, String(value));
    return;
  }
  if (HTML_ATTRIBUTE_NAMES.has(name)) {
    element.setAttribute(name, String(value));
    return;
  }
  if ((name in element || HTML_PROPERTY_NAMES.has(name)) && !(element instanceof SVGElement)) {
    try {
      (element as unknown as Record<string, unknown>)[name] = value;
      return;
    } catch {
      // Fall through for read-only DOM properties.
    }
  }
  if (value === false) return;
  if (typeof value === 'object') {
    throw new Error(`Unsupported object value for JSX prop "${name}"`);
  }
  element.setAttribute(name, value === true ? '' : String(value));
}

function setClassName(element: Element, value: unknown): void {
  if (value === false) return;
  if (element instanceof SVGElement) {
    element.setAttribute('class', String(value));
    return;
  }

  element.className = String(value);
}

function setStyle(element: Element, value: unknown): void {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return;
  if (typeof value === 'string') {
    element.setAttribute('style', value);
    return;
  }
  if (!value || typeof value !== 'object') return;

  Object.entries(value as Record<string, string | number | null | undefined>).forEach(([property, styleValue]) => {
    if (styleValue === null || styleValue === undefined) return;
    if (property.includes('-')) {
      element.style.setProperty(property, String(styleValue));
    } else {
      (element.style as unknown as Record<string, string>)[property] = String(styleValue);
    }
  });
}

function addJsxEventListener(element: Element, propName: string, listener: EventListener): void {
  const capture = propName.endsWith('Capture');
  const eventName = propName
    .slice(2, capture ? -7 : undefined)
    .replace(/^[A-Z]/, (letter) => letter.toLowerCase())
    .toLowerCase();

  element.addEventListener(eventName, listener, capture);
}

function appendJsxChildren(parent: Node, children: JsxChild[]): void {
  children.forEach((child) => appendJsxChild(parent, child));
}

function appendJsxChild(parent: Node, child: JsxChild): void {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) {
    appendJsxChildren(parent, child);
    return;
  }
  parent.appendChild(childToNode(child));
}

function childToNode(child: JsxChild): Node {
  if (child === null || child === undefined || child === false || child === true) {
    return document.createDocumentFragment();
  }
  if (child instanceof Node) return child;
  if (Array.isArray(child)) {
    const fragment = document.createDocumentFragment();
    appendJsxChildren(fragment, child);
    return fragment;
  }

  return document.createTextNode(String(child));
}

declare global {
  namespace JSX {
    type Element = Node;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicElements {
      [tagName: string]: Record<string, unknown>;
    }
  }
}
