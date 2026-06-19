/**
 * Playground identity helpers shared by the popup and background bridge.
 *
 * The private key stays in chrome.storage.local. UI surfaces only need the
 * stable public fingerprint and a local display label.
 */
export const PLAYGROUND_DISPLAY_NAME_STORAGE_KEY = 'ytcqPlaygroundDisplayName:v1';
export const PLAYGROUND_IDENTITY_STORAGE_KEY = 'ytcqPlaygroundIdentity:v1';
export const PLAYGROUND_PROFILE_MESSAGE_TYPE = 'ytcq:playground:get-profile';
export const PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE = 'ytcq:playground:update-profile';
export const PLAYGROUND_PROFILE_STATS_ROUTE = '/v1/player-stats';
export const PLAYGROUND_DISPLAY_NAME_MAX_LENGTH = 24;

export interface StoredPlaygroundIdentity {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
}

export interface PlaygroundProfile {
  customDisplayName: string;
  displayName: string;
  generatedDisplayName: string;
  userId: string;
  wins: number;
}

export interface PlaygroundAvatarIdentity {
  displayName: string;
  userId?: string;
}

export interface PlaygroundAvatarPresentation {
  backgroundColor: string;
  foregroundColor: string;
  initial: string;
}

const PLAYGROUND_AVATAR_COLORS = [
  'hsl(188 64% 30%)',
  'hsl(28 68% 34%)',
  'hsl(262 46% 38%)',
  'hsl(115 40% 30%)',
  'hsl(340 58% 34%)',
  'hsl(210 62% 34%)',
  'hsl(55 65% 28%)',
  'hsl(300 42% 35%)',
  'hsl(150 48% 29%)',
  'hsl(12 63% 35%)',
  'hsl(235 45% 38%)',
  'hsl(85 45% 30%)',
  'hsl(175 55% 29%)',
  'hsl(45 70% 30%)',
  'hsl(2 57% 36%)',
  'hsl(270 45% 36%)',
  'hsl(146 48% 30%)',
  'hsl(205 62% 34%)',
  'hsl(24 64% 35%)',
  'hsl(324 52% 34%)',
  'hsl(255 45% 37%)',
  'hsl(286 46% 36%)',
  'hsl(192 61% 31%)',
  'hsl(350 57% 35%)',
  'hsl(224 51% 36%)',
  'hsl(72 48% 29%)',
  'hsl(312 47% 35%)',
  'hsl(132 45% 30%)',
  'hsl(242 43% 37%)',
  'hsl(18 66% 34%)',
  'hsl(276 45% 35%)',
  'hsl(104 43% 30%)'
] as const;

export interface PlaygroundProfileMessage {
  type: typeof PLAYGROUND_PROFILE_MESSAGE_TYPE;
}

export interface PlaygroundProfileUpdateMessage {
  displayName: string;
  type: typeof PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE;
}

export type PlaygroundProfileResponse =
  | {
    ok: true;
    profile: PlaygroundProfile;
  }
  | {
    error: string;
    ok: false;
  };

export type PlaygroundProfileUpdateResponse = PlaygroundProfileResponse;

export async function getPlaygroundUserId(publicKeyJwk: JsonWebKey): Promise<string> {
  const canonicalKey = JSON.stringify({
    crv: publicKeyJwk.crv,
    kty: publicKeyJwk.kty,
    x: publicKeyJwk.x,
    y: publicKeyJwk.y
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalKey));
  return encodeBase64Url(new Uint8Array(digest)).slice(0, 32);
}

export function getPlaygroundDisplayName(userId: string, customDisplayName = ''): string {
  return normalizePlaygroundDisplayName(customDisplayName) || getGeneratedPlaygroundDisplayName(userId);
}

export function getGeneratedPlaygroundDisplayName(userId: string): string {
  const code = userId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
  return `Player ${code || '0000'}`;
}

export function normalizePlaygroundDisplayName(value: unknown): string {
  const displayName = normalizePlaygroundDisplayNameText(value);
  return isAllowedPlaygroundDisplayName(displayName) ? displayName : '';
}

export function isValidPlaygroundDisplayName(value: unknown): boolean {
  const displayName = normalizePlaygroundDisplayNameText(value);
  return Boolean(displayName) && isAllowedPlaygroundDisplayName(displayName);
}

export function getPlaygroundAvatarInitial(displayName: string, userId = ''): string {
  const normalized = displayName.replace(/^@/, '').trim();
  const generatedPlayerCode = /^Player\s+([a-z0-9]{4})$/i.exec(normalized)?.[1] || '';
  if (generatedPlayerCode) {
    return getFirstAsciiLetter(generatedPlayerCode) ||
      getFirstAsciiLetter(userId) ||
      getStableAsciiLetter(userId || generatedPlayerCode);
  }
  const computerProfileLabel = getComputerProfileLabel(normalized, userId);
  if (computerProfileLabel) {
    return getFirstAsciiLetter(computerProfileLabel) ||
      getStableAsciiLetter(computerProfileLabel);
  }
  return (normalized[0] || '?').toUpperCase();
}

export function getPlaygroundAvatarPresentation(identity: PlaygroundAvatarIdentity): PlaygroundAvatarPresentation {
  const seed = getPlaygroundAvatarColorSeed(identity);
  return {
    backgroundColor: getPlaygroundAvatarColor(seed),
    foregroundColor: '#fff',
    initial: getPlaygroundAvatarInitial(identity.displayName, identity.userId || '')
  };
}

export function getPlaygroundAvatarColor(seed: string): string {
  return PLAYGROUND_AVATAR_COLORS[getStablePaletteIndex(seed)];
}

export function isPlaygroundProfileMessage(value: unknown): value is PlaygroundProfileMessage {
  return isRecord(value) && value.type === PLAYGROUND_PROFILE_MESSAGE_TYPE;
}

export function isPlaygroundProfileUpdateMessage(value: unknown): value is PlaygroundProfileUpdateMessage {
  return isRecord(value) &&
    value.type === PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE &&
    typeof value.displayName === 'string';
}

export function isStoredPlaygroundIdentity(value: unknown): value is StoredPlaygroundIdentity {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<StoredPlaygroundIdentity>;
  return isP256PrivateKey(candidate.privateKeyJwk) && isP256PublicKey(candidate.publicKeyJwk);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function isP256PrivateKey(value: unknown): value is JsonWebKey {
  return isRecord(value) &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    typeof value.y === 'string' &&
    typeof value.d === 'string';
}

function isP256PublicKey(value: unknown): value is JsonWebKey {
  return isRecord(value) &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    typeof value.y === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePlaygroundDisplayNameText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return replaceControlCharacters(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceControlCharacters(value: string): string {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    normalized += code <= 0x1f || code === 0x7f ? ' ' : value[index];
  }
  return normalized;
}

function isAllowedPlaygroundDisplayName(displayName: string): boolean {
  return displayName.length > 0 &&
    displayName.length <= PLAYGROUND_DISPLAY_NAME_MAX_LENGTH &&
    !isReservedPlaygroundDisplayName(displayName) &&
    !looksLikeUrl(displayName);
}

function isReservedPlaygroundDisplayName(displayName: string): boolean {
  return /^(?:computer(?:\s*\([^)]*\))?|beginner|club|master)$/i.test(displayName);
}

function looksLikeUrl(displayName: string): boolean {
  return /(?:https?:\/\/|www\.)/i.test(displayName);
}

function getFirstAsciiLetter(value: string): string {
  return value.match(/[a-z]/i)?.[0].toUpperCase() || '';
}

function getStableAsciiLetter(seed: string): string {
  return String.fromCharCode(65 + (getStableHash(seed) % 26));
}

function getPlaygroundAvatarColorSeed(identity: PlaygroundAvatarIdentity): string {
  const computerProfileLabel = getComputerProfileLabel(identity.displayName, identity.userId || '');
  if (computerProfileLabel) return `computer:${computerProfileLabel.toLowerCase()}`;
  return identity.userId || identity.displayName;
}

function getComputerProfileLabel(displayName: string, userId = ''): string {
  if (!userId.startsWith('server:computer:')) return '';
  const normalized = displayName.replace(/^@/, '').trim();
  return /^Computer\s+\(([^()]+)\)$/i.exec(normalized)?.[1]?.trim() || '';
}

function getStablePaletteIndex(seed: string): number {
  return getAvatarColorHash(seed) % PLAYGROUND_AVATAR_COLORS.length;
}

function getAvatarColorHash(seed: string): number {
  let hash = getStableHash(seed);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function getStableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}
