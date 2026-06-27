import { describe, expect, it } from 'vitest';
import {
  createSafariExportOptionsPlist,
  getSafariExportProvisioningArgs
} from './safari-export-options.mjs';

describe('Safari export options', () => {
  it('uses automatic signing by default', () => {
    const plist = createSafariExportOptionsPlist({
      developmentTeam: 'TEAM123',
      env: {}
    });

    expect(plist).toContain('<key>method</key>\n\t<string>app-store-connect</string>');
    expect(plist).toContain('<key>signingStyle</key>\n\t<string>automatic</string>');
    expect(plist).toContain('<key>teamID</key>\n\t<string>TEAM123</string>');
    expect(plist).not.toContain('<key>provisioningProfiles</key>');
    expect(getSafariExportProvisioningArgs({ env: {} })).toEqual(['-allowProvisioningUpdates']);
  });

  it('adds manual signing certificates and provisioning profiles when configured', () => {
    const env = {
      YTCQ_SAFARI_EXPORT_SIGNING_STYLE: 'manual',
      YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES: JSON.stringify({
        'com.chatenhancer.safari': 'Chat Enhancer macOS AppStore',
        'com.chatenhancer.safari.Extension': 'Chat Enhancer Extension AppStore'
      })
    };
    const plist = createSafariExportOptionsPlist({
      developmentTeam: 'TEAM123',
      env
    });

    expect(plist).toContain('<key>signingStyle</key>\n\t<string>manual</string>');
    expect(plist).toContain('<key>signingCertificate</key>\n\t<string>Mac App Distribution</string>');
    expect(plist).toContain(
      '<key>installerSigningCertificate</key>\n\t<string>Mac Installer Distribution</string>'
    );
    expect(plist).toContain('<key>provisioningProfiles</key>');
    expect(plist).toContain(
      '<key>com.chatenhancer.safari</key>\n\t\t<string>Chat Enhancer macOS AppStore</string>'
    );
    expect(plist).toContain(
      '<key>com.chatenhancer.safari.Extension</key>\n\t\t<string>Chat Enhancer Extension AppStore</string>'
    );
    expect(getSafariExportProvisioningArgs({ env })).toEqual([]);
  });

  it('rejects manual signing without provisioning profiles', () => {
    expect(() => createSafariExportOptionsPlist({
      developmentTeam: 'TEAM123',
      env: {
        YTCQ_SAFARI_EXPORT_SIGNING_STYLE: 'manual'
      }
    })).toThrow(/YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES/);
  });

  it('rejects invalid signing styles', () => {
    expect(() => createSafariExportOptionsPlist({
      developmentTeam: 'TEAM123',
      env: {
        YTCQ_SAFARI_EXPORT_SIGNING_STYLE: 'cloud'
      }
    })).toThrow(/automatic.*manual/);
  });
});
