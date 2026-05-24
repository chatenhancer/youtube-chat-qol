const DEFAULT_LOCALE = 'en';
const LANGUAGE_COOKIE = 'ce_lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SUPPORTED_LOCALES = new Set([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt',
  'ru',
  'tr',
  'zh-CN'
]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!shouldHandleRequest(request, url)) {
      return fetch(request);
    }

    const explicitLocale = normalizeLocale(url.searchParams.get('lang') || url.searchParams.get('hl'));
    if (explicitLocale) {
      return redirectWithLocaleCookie(request, url, explicitLocale);
    }

    const cookieLocale = normalizeLocale(getCookie(request, LANGUAGE_COOKIE));
    const headerLocale = pickAcceptLanguage(request.headers.get('Accept-Language'));
    const preferredLocale = cookieLocale || headerLocale;

    if (!preferredLocale || preferredLocale === DEFAULT_LOCALE) {
      return fetch(request);
    }

    return redirectIfLocalePageExists(request, url, preferredLocale);
  }
};

function shouldHandleRequest(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (url.pathname !== '/' && url.pathname !== '/index.html') return false;
  if (isBot(request.headers.get('User-Agent'))) return false;
  return true;
}

async function redirectWithLocaleCookie(request, url, locale) {
  const destinationPath = locale === DEFAULT_LOCALE ? '/' : `/${locale}/`;
  const destinationUrl = new URL(destinationPath, url);
  destinationUrl.search = '';

  if (locale !== DEFAULT_LOCALE) {
    const localePageExists = await localePageExistsAt(request, destinationUrl);
    if (!localePageExists) {
      return fetch(request);
    }
  }

  return createRedirect(destinationUrl, locale);
}

async function redirectIfLocalePageExists(request, url, locale) {
  const destinationUrl = new URL(`/${locale}/`, url);
  const localePageExists = await localePageExistsAt(request, destinationUrl);
  if (!localePageExists) return fetch(request);

  return createRedirect(destinationUrl, locale);
}

async function localePageExistsAt(request, destinationUrl) {
  const probeRequest = new Request(destinationUrl.toString(), {
    method: 'HEAD',
    headers: createForwardHeaders(request)
  });

  try {
    const response = await fetch(probeRequest);
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

function createRedirect(destinationUrl, locale) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destinationUrl.toString(),
      'Set-Cookie': createLanguageCookie(locale),
      Vary: 'Accept-Language, Cookie'
    }
  });
}

function createForwardHeaders(request) {
  const headers = new Headers(request.headers);
  headers.set('Accept', 'text/html,*/*;q=0.8');
  headers.delete('Cookie');
  return headers;
}

function pickAcceptLanguage(header) {
  if (!header) return '';

  return header
    .split(',')
    .map(parseLanguagePreference)
    .filter((entry) => entry.locale)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.locale)
    .find(Boolean) || '';
}

function parseLanguagePreference(part) {
  const [rawLocale, ...params] = part.trim().split(';');
  const qualityParam = params.find((param) => param.trim().startsWith('q='));
  const quality = qualityParam ? Number(qualityParam.trim().slice(2)) : 1;

  return {
    locale: normalizeLocale(rawLocale),
    quality: Number.isFinite(quality) ? quality : 1
  };
}

function normalizeLocale(value) {
  const locale = decodeURIComponent(String(value || '')).trim().toLowerCase().replace('_', '-');
  if (!locale) return '';
  if (
    locale === 'zh' ||
    locale.startsWith('zh-cn') ||
    locale.startsWith('zh-hans') ||
    locale.startsWith('zh-sg')
  ) {
    return 'zh-CN';
  }

  const baseLocale = locale.split('-')[0];
  return SUPPORTED_LOCALES.has(baseLocale) ? baseLocale : '';
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? cookie.slice(name.length + 1) : '';
}

function createLanguageCookie(locale) {
  return `${LANGUAGE_COOKIE}=${encodeURIComponent(locale)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
}

function isBot(userAgent) {
  return /\b(bot|crawler|spider|crawling|facebookexternalhit|slurp|duckduckbot|bingpreview)\b/i.test(userAgent || '');
}
