import { describe, expect, it } from 'vitest';
import {
  readSafariProductBundleIdentifiers,
  rewriteSafariManualCodeSigningSettings,
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

  it('configures manual signing for generated macOS app and extension targets', () => {
    const project = `
		1AC7503B2FF1D53600D0A23D /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = TEAM123;
				PRODUCT_BUNDLE_IDENTIFIER = com.chatenhancer.safari.Extension;
				SDKROOT = iphoneos;
			};
			name = Release;
		};
		1AC750422FF1D53600D0A23D /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = TEAM123;
				PRODUCT_BUNDLE_IDENTIFIER = com.chatenhancer.safari.Extension;
				SDKROOT = macosx;
			};
			name = Release;
		};
		1AC750462FF1D53600D0A23D /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = TEAM123;
				PRODUCT_BUNDLE_IDENTIFIER = com.chatenhancer.safari;
				SDKROOT = macosx;
			};
			name = Release;
		};
`;

    const nextProject = rewriteSafariManualCodeSigningSettings(project, {
      bundleIdentifier: 'com.chatenhancer.safari',
      developmentTeam: 'TEAM123',
      provisioningProfiles: {
        'com.chatenhancer.safari': 'Chat Enhancer Safari App Store',
        'com.chatenhancer.safari.Extension': 'Chat Enhancer Safari Extension App Store'
      },
      signingCertificate: 'ABCD1234'
    });

    expect(nextProject).toContain('SDKROOT = iphoneos;');
    expect(nextProject).toContain('CODE_SIGN_STYLE = Automatic;');
    expect(nextProject).toContain('CODE_SIGN_STYLE = Manual;');
    expect(nextProject).toContain('CODE_SIGN_IDENTITY = ABCD1234;');
    expect(nextProject).toContain(
      'PROVISIONING_PROFILE_SPECIFIER = "Chat Enhancer Safari Extension App Store";'
    );
    expect(nextProject).toContain(
      'PROVISIONING_PROFILE_SPECIFIER = "Chat Enhancer Safari App Store";'
    );
  });

  it('requires manual signing profiles for both macOS bundles', () => {
    expect(() => rewriteSafariManualCodeSigningSettings('', {
      bundleIdentifier: 'com.chatenhancer.safari',
      developmentTeam: 'TEAM123',
      provisioningProfiles: {
        'com.chatenhancer.safari': 'Chat Enhancer Safari App Store'
      },
      signingCertificate: 'ABCD1234'
    })).toThrow(/com\.chatenhancer\.safari\.Extension/);
  });
});
