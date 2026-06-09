import { describe, expect, it } from 'vitest';
import { PLAYGROUND_PROTOCOL_VERSION } from './messages';
import {
  parseClientMessage,
  ProtocolError,
  sanitizeAvatarUrl,
  sanitizeDisplayName,
  sanitizeStreamKey
} from './validation';

describe('playground protocol validation', () => {
  it('rejects invalid JSON, missing types, and unsupported message types', () => {
    expect(() => parseClientMessage('{')).toThrowError(new ProtocolError(
      'invalid_json',
      'Message must be valid JSON.'
    ));
    expect(() => parseClientMessage('[]')).toThrowError(new ProtocolError(
      'invalid_message',
      'Message must be an object.'
    ));
    expect(() => parseClientMessage(JSON.stringify({ type: 'unknown' }))).toThrowError(new ProtocolError(
      'unsupported_message',
      'Unsupported message type: unknown.'
    ));
  });

  it('parses a signed hello message for chess availability', () => {
    const message = parseClientMessage(JSON.stringify({
      availableGames: ['chess'],
      identity: {
        publicKeyJwk: {
          crv: 'P-256',
          kty: 'EC',
          x: 'x-value',
          y: 'y-value'
        },
        signature: 'signature'
      },
      profile: {
        avatarUrl: 'https://example.com/avatar.png',
        displayName: '  Example   player  '
      },
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }));

    expect(message).toMatchObject({
      availableGames: ['chess'],
      profile: {
        avatarUrl: 'https://example.com/avatar.png',
        displayName: 'Example player'
      },
      type: 'hello'
    });
  });

  it('rejects hello messages with invalid protocol version or public key', () => {
    expect(() => parseClientMessage(JSON.stringify({
      identity: {},
      protocolVersion: 999,
      type: 'hello'
    }))).toThrowError(new ProtocolError('protocol_version', `Expected protocol version ${PLAYGROUND_PROTOCOL_VERSION}.`));

    expect(() => parseClientMessage(JSON.stringify({
      identity: {
        publicKeyJwk: {
          crv: 'P-384',
          kty: 'EC',
          x: 'x-value',
          y: 'y-value'
        },
        signature: 'signature'
      },
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }))).toThrowError(new ProtocolError('invalid_public_key', 'Public key must be a P-256 EC JWK.'));
  });

  it('deduplicates supported games and rejects unsupported games', () => {
    expect(parseClientMessage(JSON.stringify({
      availableGames: ['chess', 'chess'],
      type: 'setAvailability'
    }))).toEqual({
      availableGames: ['chess'],
      type: 'setAvailability'
    });

    expect(() => parseClientMessage(JSON.stringify({
      availableGames: ['tic-tac-toe'],
      type: 'setAvailability'
    }))).toThrowError(new ProtocolError('unsupported_game', 'Only chess is supported.'));
  });

  it('validates game action envelopes without knowing game rules', () => {
    expect(parseClientMessage(JSON.stringify({
      action: 'move',
      gameId: 'game_1',
      payload: {
        from: 'E2',
        promotion: 'q',
        to: 'e4'
      },
      type: 'gameAction'
    }))).toEqual({
      action: 'move',
      gameId: 'game_1',
      payload: {
        from: 'E2',
        promotion: 'q',
        to: 'e4'
      },
      type: 'gameAction'
    });

    expect(() => parseClientMessage(JSON.stringify({
      action: 'move',
      gameId: 'game_1',
      payload: 'e2e4',
      type: 'gameAction'
    }))).toThrowError(new ProtocolError('invalid_payload', 'Action payload must be an object.'));
  });

  it('truncates ping ids to a small echo value', () => {
    const message = parseClientMessage(JSON.stringify({
      id: 'x'.repeat(120),
      type: 'ping'
    }));

    expect(message).toEqual({
      id: 'x'.repeat(80),
      type: 'ping'
    });
  });

  it('sanitizes stream keys and profile display values', () => {
    expect(sanitizeStreamKey('abc_123-Z')).toBe('abc_123-Z');
    expect(() => sanitizeStreamKey('../abc')).toThrowError(new ProtocolError(
      'invalid_stream',
      'Stream key must be a YouTube-style video ID.'
    ));

    expect(sanitizeDisplayName('  A   player  ')).toBe('A player');
    expect(sanitizeDisplayName('')).toBe('Player');
    expect(sanitizeAvatarUrl('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
    expect(sanitizeAvatarUrl('http://example.com/avatar.png')).toBeUndefined();
  });
});
