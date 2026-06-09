import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import {
  appendVary,
  createLanguageCookie,
  getCookie,
  isBot,
  normalizeLocale,
  pickAcceptLanguage,
  shouldHandleRequest
} from './index';

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('language redirect worker helpers', () => {
  it('normalizes supported locale aliases', () => {
    expect(normalizeLocale('ES-mx')).toBe('es');
    expect(normalizeLocale('pt_BR')).toBe('pt');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hant')).toBe('zh-TW');
    expect(normalizeLocale('unknown')).toBe('');
  });

  it('picks the highest quality supported accept-language locale', () => {
    expect(pickAcceptLanguage('fr-CA;q=0.7, es;q=0.9, en;q=0.8')).toBe('es');
    expect(pickAcceptLanguage('xx;q=1, de;q=0.2')).toBe('de');
    expect(pickAcceptLanguage(null)).toBe('');
  });

  it('handles only homepage GET and HEAD requests from non-bots', () => {
    expect(shouldHandleRequest(
      new Request('https://chatenhancer.com/'),
      new URL('https://chatenhancer.com/')
    )).toBe(true);
    expect(shouldHandleRequest(
      new Request('https://chatenhancer.com/index.html', { method: 'HEAD' }),
      new URL('https://chatenhancer.com/index.html')
    )).toBe(true);
    expect(shouldHandleRequest(
      new Request('https://chatenhancer.com/styles.css'),
      new URL('https://chatenhancer.com/styles.css')
    )).toBe(false);
    expect(shouldHandleRequest(
      new Request('https://chatenhancer.com/', { method: 'POST' }),
      new URL('https://chatenhancer.com/')
    )).toBe(false);
  });

  it('detects crawler user agents', () => {
    expect(isBot('Mozilla/5.0 Googlebot/2.1')).toBe(true);
    expect(isBot('Mozilla/5.0 Safari/605.1.15')).toBe(false);
  });

  it('reads and writes the language cookie', () => {
    const request = new Request('https://chatenhancer.com/', {
      headers: {
        Cookie: 'theme=dark; ce_lang=ja; other=value'
      }
    });

    expect(getCookie(request, 'ce_lang')).toBe('ja');
    expect(createLanguageCookie('zh-CN')).toContain('ce_lang=zh-CN');
    expect(createLanguageCookie('zh-CN')).toContain('SameSite=Lax; Secure');
  });

  it('appends Vary values once', () => {
    const headers = new Headers({
      Vary: 'Accept-Encoding'
    });

    appendVary(headers, 'Accept-Language');
    appendVary(headers, 'Accept-Language');

    expect(headers.get('Vary')).toBe('Accept-Encoding, Accept-Language');
  });
});

describe('language redirect worker fetch', () => {
  it('redirects explicit supported locales and sets the locale cookie', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const response = await worker.fetch(new Request('https://chatenhancer.com/?lang=ja'));

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://chatenhancer.com/ja/');
    expect(response.headers.get('Set-Cookie')).toContain('ce_lang=ja');
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({
      method: 'HEAD'
    }));
  });

  it('falls back to the homepage when a locale page does not exist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('homepage', {
        headers: {
          Vary: 'Accept-Encoding'
        },
        status: 200
      }));
    globalThis.fetch = fetchMock;

    const response = await worker.fetch(new Request('https://chatenhancer.com/?lang=ja'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('homepage');
    expect(response.headers.get('Vary')).toBe('Accept-Encoding, Accept-Language, Cookie');
  });

  it('uses cookie locale before Accept-Language locale', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const response = await worker.fetch(new Request('https://chatenhancer.com/', {
      headers: {
        'Accept-Language': 'fr;q=1',
        Cookie: 'ce_lang=es'
      }
    }));

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://chatenhancer.com/es/');
  });

  it('passes through assets without language redirect handling', async () => {
    const fetchMock = vi.fn(async () => new Response('asset', { status: 200 }));
    globalThis.fetch = fetchMock;
    const request = new Request('https://chatenhancer.com/styles.css');

    const response = await worker.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('asset');
    expect(fetchMock).toHaveBeenCalledWith(request);
  });
});
