import { describe, expect, it } from 'vitest';
import {
  createChallenge,
  createSignaturePayload,
  encodeBase64Url,
  getPublicKeyFingerprint,
  verifySignedIdentity
} from './identity';
import type { SignedClientIdentity } from './messages';

describe('playground signed identity', () => {
  it('verifies a P-256 signed identity and derives a stable user id', async () => {
    const challenge = createChallenge();
    const { identity, publicKeyJwk } = await createSignedIdentity(challenge);

    const verified = await verifySignedIdentity(challenge, identity);

    expect(verified.userId).toBe(await getPublicKeyFingerprint(publicKeyJwk));
  });

  it('rejects a signature for a different challenge', async () => {
    const { identity } = await createSignedIdentity(createChallenge());

    await expect(verifySignedIdentity(createChallenge(), identity)).rejects.toThrow('Signed identity could not be verified.');
  });

  it('rejects signatures that are not base64url encoded', async () => {
    const { identity } = await createSignedIdentity(createChallenge());

    await expect(verifySignedIdentity(createChallenge(), {
      ...identity,
      signature: 'not valid base64url!'
    })).rejects.toThrow('Signature must be base64url encoded.');
  });

  it('creates compact random challenges', () => {
    const first = createChallenge();
    const second = createChallenge();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

async function createSignedIdentity(challenge: string): Promise<{
  identity: SignedClientIdentity;
  publicKeyJwk: JsonWebKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const signature = new Uint8Array(await crypto.subtle.sign(
    {
      hash: 'SHA-256',
      name: 'ECDSA'
    },
    keyPair.privateKey,
    createSignaturePayload(challenge)
  ));

  return {
    identity: {
      publicKeyJwk,
      signature: encodeBase64Url(signature)
    },
    publicKeyJwk
  };
}
