// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleExtensionInstalled } from './onboarding';

describe('onboarding install behavior', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    vi.mocked(chrome.tabs.create).mockClear();
    vi.mocked(chrome.runtime.getURL).mockClear();
  });

  it('opens onboarding for a new installation', async () => {
    await handleExtensionInstalled({
      id: 'test-extension',
      previousVersion: undefined,
      reason: 'install'
    });

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('onboarding.html');
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/onboarding.html'
    });
  });

  it('does not reopen onboarding when Safari reports another install after re-enabling', async () => {
    await handleExtensionInstalled({ reason: 'install' });
    await handleExtensionInstalled({ reason: 'install' });

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });

  it('preserves existing installations that have no onboarding marker', async () => {
    const savedOptions = { targetLanguage: 'ja', liteModeEnabled: true };
    await chrome.storage.sync.set(savedOptions);

    await handleExtensionInstalled({ reason: 'install' });

    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(await chrome.storage.sync.get(null)).toEqual(savedOptions);
  });

  it('does not interrupt extension updates or subsequent re-enabling', async () => {
    await handleExtensionInstalled({
      id: 'test-extension',
      previousVersion: '1.0.0',
      reason: 'update'
    });
    await handleExtensionInstalled({ reason: 'install' });

    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
