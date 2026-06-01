import { describe, expect, it } from 'vitest';
import {
  isExtensionManagedElement,
  markExtensionManagedElement,
  ytcqCreateElement
} from './managed-dom';

describe('managed DOM helpers', () => {
  it('marks created extension UI roots and descendants as managed', () => {
    const root = ytcqCreateElement('section');
    const child = document.createElement('button');
    root.append(child);

    expect(root.dataset.ytcqManaged).toBe('true');
    expect(isExtensionManagedElement(root)).toBe(true);
    expect(isExtensionManagedElement(child)).toBe(true);
  });

  it('can mark existing elements without recreating them', () => {
    const element = document.createElement('div');

    expect(markExtensionManagedElement(element)).toBe(element);
    expect(isExtensionManagedElement(element)).toBe(true);
  });
});
