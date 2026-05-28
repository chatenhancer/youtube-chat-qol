/**
 * Keyword command parsing.
 *
 * Parses /watch and /unwatch arguments, preserving quoted phrases while
 * splitting unquoted text into individual watched terms.
 */
import { t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';

export function parseKeywordCommandArguments(value: string): {
  error: string;
  ok: false;
} | {
  ok: true;
  values: string[];
} {
  const text = cleanText(value);
  if (!text) {
    return {
      ok: false,
      error: t('addKeywordOrPhrase')
    };
  }

  const values: string[] = [];
  let current = '';
  let quoted = false;

  const pushCurrent = (): void => {
    const keyword = cleanText(current);
    if (keyword) values.push(keyword);
    current = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted) {
        pushCurrent();
        quoted = false;
      } else {
        pushCurrent();
        quoted = true;
      }
      continue;
    }

    if (!quoted && /\s/.test(char)) {
      pushCurrent();
      continue;
    }

    current += char;
  }

  if (quoted) {
    return {
      ok: false,
      error: t('closeQuotedKeywordPhrase')
    };
  }

  pushCurrent();
  if (!values.length) {
    return {
      ok: false,
      error: t('addKeywordOrPhrase')
    };
  }

  return {
    ok: true,
    values
  };
}

export function formatWatchKeywordResult(added: string[], duplicates: string[]): string {
  if (!added.length && duplicates.length) {
    return t('alreadyWatchingKeywords', { keywords: formatCommandList(duplicates) });
  }
  if (added.length && duplicates.length) {
    return t('watchingKeywordsWithDuplicates', {
      added: formatCommandList(added),
      duplicates: formatCommandList(duplicates)
    });
  }
  return added.length
    ? t('watchingKeywords', { keywords: formatCommandList(added) })
    : t('noKeywordsAdded');
}

export function formatUnwatchKeywordResult(removed: string[], missing: string[]): string {
  if (!removed.length && missing.length) {
    return t('keywordNotFound', { keywords: formatCommandList(missing) });
  }
  if (removed.length && missing.length) {
    return t('removedKeywordsWithMissing', {
      missing: formatCommandList(missing),
      removed: formatCommandList(removed)
    });
  }
  return removed.length
    ? t('removedKeywords', { keywords: formatCommandList(removed) })
    : t('noKeywordsRemoved');
}

export function formatCommandList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(', ');
}
