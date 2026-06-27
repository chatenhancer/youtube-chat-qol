import { describe, expect, it } from 'vitest';
import {
  readSafariProductBundleIdentifiers,
  rewriteSafariProductBundleIdentifiers
} from './safari-xcode-project.mjs';

describe('Safari Xcode project helpers', () => {
  it('forces generated Safari app and extension bundle identifiers', () => {
    const project = `
				PRODUCT_BUNDLE_IDENTIFIER = com.chatenhancer.Chat-Enhancer-for-YouTube.Extension;
				PRODUCT_BUNDLE_IDENTIFIER = com.chatenhancer.Chat-Enhancer-for-YouTube;
				PRODUCT_BUNDLE_IDENTIFIER = "com.chatenhancer.Chat Enhancer for YouTube.Extension";
				PRODUCT_BUNDLE_IDENTIFIER = "com.chatenhancer.Chat Enhancer for YouTube";
`;

    const nextProject = rewriteSafariProductBundleIdentifiers(
      project,
      'com.chatenhancer.safari'
    );

    expect(readSafariProductBundleIdentifiers(nextProject)).toEqual([
      'com.chatenhancer.safari',
      'com.chatenhancer.safari.Extension'
    ]);
  });

  it('requires a configured app bundle identifier', () => {
    expect(() => rewriteSafariProductBundleIdentifiers('', '')).toThrow(
      /bundle identifier is required/
    );
  });
});
