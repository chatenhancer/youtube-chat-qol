/** Escape chat text for Google's HTML API without exposing emoji or mention contents. */
export function encodeTranslationHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/§(\d+)§/g, '<span translate="no">[$1]</span>');
}

/** The worker has no DOM; accept only our inert placeholder markup and decode text once. */
export function decodeTranslationHtml(html: string, source: string): string {
  const text = html.replace(/<span\s+translate=["']no["']>\[(\d+)\]<\/span>/gi, '§$1§');
  if (/<[^>]*>/u.test(text)) throw new Error('Translate response contained unexpected markup.');
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0'
  };
  const decoded = text.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (_match, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
    const hexadecimal = entity[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return String.fromCodePoint(codePoint);
  });
  const tokens = (value: string) => (value.match(/§\d+§/g) || []).sort().join(',');
  if (tokens(decoded) !== tokens(source)) throw new Error('Translate response did not preserve protected text.');
  if (!decoded.trim()) throw new Error('Translate response was empty.');
  return decoded;
}
