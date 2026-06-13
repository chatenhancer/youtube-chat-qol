/**
 * Playground identity helpers shared by the popup and background bridge.
 *
 * The private key stays in chrome.storage.local. UI surfaces only need the
 * stable public fingerprint and the backend-compatible Player XXXX label.
 */
export const PLAYGROUND_IDENTITY_STORAGE_KEY = 'ytcqPlaygroundIdentity:v1';
export const PLAYGROUND_PROFILE_MESSAGE_TYPE = 'ytcq:playground:get-profile';

export interface StoredPlaygroundIdentity {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
}

export interface PlaygroundProfile {
  displayName: string;
  userId: string;
}

export interface PlaygroundProfileMessage {
  type: typeof PLAYGROUND_PROFILE_MESSAGE_TYPE;
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

export function getPlaygroundDisplayName(userId: string): string {
  const code = userId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
  return `Player ${code || '0000'}`;
}

export function isPlaygroundProfileMessage(value: unknown): value is PlaygroundProfileMessage {
  return isRecord(value) && value.type === PLAYGROUND_PROFILE_MESSAGE_TYPE;
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
