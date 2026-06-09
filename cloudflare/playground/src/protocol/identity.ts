import type { SignedClientIdentity } from './messages';
import { ProtocolError } from './validation';

const SIGNATURE_PREFIX = 'chat-enhancer-playground:';

export interface VerifiedIdentity {
  userId: string;
}

export function createChallenge(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export function createSignaturePayload(challenge: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(`${SIGNATURE_PREFIX}${challenge}`));
}

export async function verifySignedIdentity(challenge: string, identity: SignedClientIdentity): Promise<VerifiedIdentity> {
  const key = await crypto.subtle.importKey(
    'jwk',
    identity.publicKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  const signature = decodeBase64Url(identity.signature);
  const isValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    createSignaturePayload(challenge)
  );

  if (!isValid) throw new ProtocolError('invalid_signature', 'Signed identity could not be verified.');

  return {
    userId: await getPublicKeyFingerprint(identity.publicKeyJwk)
  };
}

export async function getPublicKeyFingerprint(publicKeyJwk: JsonWebKey): Promise<string> {
  const canonicalKey = JSON.stringify({
    crv: publicKeyJwk.crv,
    kty: publicKeyJwk.kty,
    x: publicKeyJwk.x,
    y: publicKeyJwk.y
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalKey));
  return encodeBase64Url(new Uint8Array(digest)).slice(0, 32);
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

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary = '';
  try {
    binary = atob(base64);
  } catch {
    throw new ProtocolError('invalid_signature', 'Signature must be base64url encoded.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return toArrayBuffer(bytes);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
