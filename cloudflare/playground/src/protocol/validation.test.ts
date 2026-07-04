import { describe, expect, it } from 'vitest';
import { PLAYGROUND_PROTOCOL_VERSION } from './messages';
import {
  parseClientMessage,
  ProtocolError,
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
    expect(() => parseClientMessage(JSON.stringify({}))).toThrowError(new ProtocolError(
      'invalid_field',
      'type must be a non-empty string.'
    ));
  });

  it('parses a signed hello message for game availability', () => {
    const message = parseClientMessage(JSON.stringify({
      availableGames: ['chess', 'replay-trivia'],
      displayName: '  Luna Chat  ',
      identity: {
        publicKeyJwk: {
          crv: 'P-256',
          kty: 'EC',
          x: 'x-value',
          y: 'y-value'
        },
        signature: 'signature'
      },
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }));

    expect(message).toMatchObject({
      availableGames: ['chess', 'replay-trivia'],
      displayName: 'Luna Chat',
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

    expect(() => parseClientMessage(JSON.stringify({
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }))).toThrowError(new ProtocolError('identity_required', 'Signed identity is required.'));

    expect(() => parseClientMessage(JSON.stringify({
      identity: {
        publicKeyJwk: 'not-a-key',
        signature: 'signature'
      },
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }))).toThrowError(new ProtocolError('invalid_public_key', 'Public key must be a JWK object.'));
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
    }))).toThrowError(new ProtocolError('unsupported_game', 'Unsupported game.'));

    expect(parseClientMessage(JSON.stringify({
      availableGames: 'chess',
      type: 'setAvailability'
    }))).toEqual({
      availableGames: [],
      type: 'setAvailability'
    });
  });

  it('validates display name updates', () => {
    expect(parseClientMessage(JSON.stringify({
      displayName: '  Luna   Chat  ',
      type: 'setDisplayName'
    }))).toEqual({
      displayName: 'Luna Chat',
      type: 'setDisplayName'
    });

    expect(() => parseClientMessage(JSON.stringify({
      displayName: 'Computer',
      type: 'setDisplayName'
    }))).toThrowError(new ProtocolError('invalid_field', 'displayName must be a valid Playground display name.'));

    expect(() => parseClientMessage(JSON.stringify({
      displayName: 'https://example.com',
      type: 'setDisplayName'
    }))).toThrowError(new ProtocolError('invalid_field', 'displayName must be a valid Playground display name.'));
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

    expect(parseClientMessage(JSON.stringify({
      action: 'leave',
      gameId: 'game_1',
      type: 'gameAction'
    }))).toEqual({
      action: 'leave',
      gameId: 'game_1',
      payload: undefined,
      type: 'gameAction'
    });
  });

  it('validates invites, invite responses, and ping ids', () => {
    expect(parseClientMessage(JSON.stringify({
      gameId: 'chess',
      toUserId: 'target-user',
      type: 'invite'
    }))).toEqual({
      gameId: 'chess',
      toUserId: 'target-user',
      type: 'invite'
    });
    expect(parseClientMessage(JSON.stringify({
      gameId: 'chess',
      toUserId: 'target-user',
      type: 'cancelInvite'
    }))).toEqual({
      gameId: 'chess',
      toUserId: 'target-user',
      type: 'cancelInvite'
    });
    expect(() => parseClientMessage(JSON.stringify({
      gameId: 'chess',
      toUserId: '   ',
      type: 'invite'
    }))).toThrowError(new ProtocolError('invalid_field', 'toUserId must be a non-empty string.'));
    expect(() => parseClientMessage(JSON.stringify({
      gameId: 'chess',
      toUserId: '   ',
      type: 'cancelInvite'
    }))).toThrowError(new ProtocolError('invalid_field', 'toUserId must be a non-empty string.'));
    expect(parseClientMessage(JSON.stringify({
      accept: false,
      inviteId: 'invite-1',
      type: 'respondInvite'
    }))).toEqual({
      accept: false,
      inviteId: 'invite-1',
      type: 'respondInvite'
    });
    expect(() => parseClientMessage(JSON.stringify({
      accept: 'yes',
      inviteId: 'invite-1',
      type: 'respondInvite'
    }))).toThrowError(new ProtocolError('invalid_field', 'accept must be a boolean.'));

    const message = parseClientMessage(JSON.stringify({
      id: 'x'.repeat(120),
      type: 'ping'
    }));

    expect(message).toEqual({
      id: 'x'.repeat(80),
      type: 'ping'
    });
    expect(parseClientMessage(JSON.stringify({
      type: 'ping'
    }))).toEqual({
      id: undefined,
      type: 'ping'
    });
  });

  it('sanitizes stream keys', () => {
    expect(sanitizeStreamKey('abc_123-Z')).toBe('abc_123-Z');
    expect(() => sanitizeStreamKey('../abc')).toThrowError(new ProtocolError(
      'invalid_stream',
      'Stream key must be a YouTube-style video ID.'
    ));
  });
});
