import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDeferredChromeIssueBody,
  compareSemverVersions,
  deferredChromeIssueTitle,
  getDeferredChromeIssueTitle,
  parseDeferredChromeRelease,
  queueDeferredChromeRelease
} from './deferred-chrome-release.mjs';

const config = {
  apiBaseUrl: 'https://api.github.test',
  repository: 'owner/repo',
  token: 'token'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deferred Chrome release state', () => {
  it('parses the release JSON from the issue body', () => {
    const release = {
      tag: 'v1.2.5',
      version: '1.2.5',
      chrome_asset_name: 'youtube-chat-qol-1.2.5-chrome.zip'
    };

    expect(parseDeferredChromeRelease(buildDeferredChromeIssueBody(release))).toEqual(release);
    expect(getDeferredChromeIssueTitle(release)).toBe('Deferred Chrome Web Store release: v1.2.5');
  });

  it('compares semver versions', () => {
    expect(compareSemverVersions('1.2.5', '1.2.4')).toBe(1);
    expect(compareSemverVersions('v1.2.4', '1.2.5')).toBe(-1);
    expect(compareSemverVersions('1.2.5', 'v1.2.5')).toBe(0);
  });

  it('keeps a newer deferred release when an older job finishes later', async () => {
    const issue = createIssue({
      tag: 'v1.2.5',
      version: '1.2.5',
      chrome_asset_name: 'youtube-chat-qol-1.2.5-chrome.zip'
    }, deferredChromeIssueTitle);
    const fetchMock = vi.fn(async () => jsonResponse([issue]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await queueDeferredChromeRelease({
      config,
      release: {
        tag: 'v1.2.4',
        version: '1.2.4',
        chrome_asset_name: 'youtube-chat-qol-1.2.4-chrome.zip'
      }
    });

    expect(result.action).toBe('kept');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updates the deferred release issue when a newer tag arrives', async () => {
    const issue = createIssue({
      tag: 'v1.2.4',
      version: '1.2.4',
      chrome_asset_name: 'youtube-chat-qol-1.2.4-chrome.zip'
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([issue]))
      .mockImplementationOnce(async (...args) => {
        const options = args[1];
        return jsonResponse({
          ...issue,
          body: JSON.parse(options.body).body
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await queueDeferredChromeRelease({
      config,
      release: {
        tag: 'v1.2.5',
        version: '1.2.5',
        chrome_asset_name: 'youtube-chat-qol-1.2.5-chrome.zip'
      }
    });

    expect(result.action).toBe('updated');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    const updateBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(updateBody.title).toBe('Deferred Chrome Web Store release: v1.2.5');
    expect(parseDeferredChromeRelease(updateBody.body).tag).toBe('v1.2.5');
  });
});

function createIssue(release, title = getDeferredChromeIssueTitle(release)) {
  return {
    number: 12,
    title,
    pull_request: null,
    body: buildDeferredChromeIssueBody(release)
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
