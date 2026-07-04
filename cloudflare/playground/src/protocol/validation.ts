import {
  isValidPlaygroundDisplayName,
  normalizePlaygroundDisplayName
} from '../../../../src/shared/playground/identity';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  SUPPORTED_GAMES,
  type ClientMessage,
  type GameId
} from './messages';

export class ProtocolError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function parseClientMessage(text: string): ClientMessage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProtocolError('invalid_json', 'Message must be valid JSON.');
  }

  if (!isRecord(value)) throw new ProtocolError('invalid_message', 'Message must be an object.');
  const type = getString(value, 'type');

  switch (type) {
    case 'hello':
      return parseHelloMessage(value);
    case 'setAvailability':
      return {
        availableGames: parseGameList(value.availableGames),
        type
      };
    case 'setDisplayName':
      return {
        displayName: parseDisplayName(value.displayName),
        type
      };
    case 'invite':
      return {
        gameId: parseGameId(value.gameId),
        toUserId: getString(value, 'toUserId'),
        type
      };
    case 'cancelInvite':
      return {
        gameId: parseGameId(value.gameId),
        toUserId: getString(value, 'toUserId'),
        type
      };
    case 'respondInvite':
      return {
        accept: getBoolean(value, 'accept'),
        inviteId: getString(value, 'inviteId'),
        type
      };
    case 'gameAction':
      return {
        action: getString(value, 'action'),
        gameId: getString(value, 'gameId'),
        payload: parseActionPayload(value.payload),
        type
      };
    case 'ping':
      return {
        id: typeof value.id === 'string' ? value.id.slice(0, 80) : undefined,
        type
      };
    default:
      throw new ProtocolError('unsupported_message', `Unsupported message type: ${type || '(missing)'}.`);
  }
}

export function sanitizeStreamKey(value: string): string {
  const streamKey = value.trim();
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(streamKey)) {
    throw new ProtocolError('invalid_stream', 'Stream key must be a YouTube-style video ID.');
  }
  return streamKey;
}

function parseHelloMessage(value: Record<string, unknown>): ClientMessage {
  if (value.protocolVersion !== PLAYGROUND_PROTOCOL_VERSION) {
    throw new ProtocolError('protocol_version', `Expected protocol version ${PLAYGROUND_PROTOCOL_VERSION}.`);
  }

  const identity = value.identity;
  if (!isRecord(identity)) throw new ProtocolError('identity_required', 'Signed identity is required.');

  return {
    availableGames: parseGameList(value.availableGames || []),
    displayName: parseOptionalDisplayName(value.displayName),
    identity: {
      publicKeyJwk: parsePublicKey(identity.publicKeyJwk),
      signature: getString(identity, 'signature')
    },
    languageCode: normalizeOptionalLanguageCode(value.languageCode, 'languageCode') || 'en',
    locale: normalizeOptionalLanguageCode(value.locale, 'locale'),
    protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
    type: 'hello'
  };
}

function parseOptionalDisplayName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return parseDisplayName(value);
}

function parseDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !isValidPlaygroundDisplayName(value)) {
    throw new ProtocolError('invalid_field', 'displayName must be a valid Playground display name.');
  }
  return normalizePlaygroundDisplayName(value);
}

function parsePublicKey(value: unknown): JsonWebKey {
  if (!isRecord(value)) throw new ProtocolError('invalid_public_key', 'Public key must be a JWK object.');
  if (value.kty !== 'EC' || value.crv !== 'P-256' || typeof value.x !== 'string' || typeof value.y !== 'string') {
    throw new ProtocolError('invalid_public_key', 'Public key must be a P-256 EC JWK.');
  }

  return {
    crv: 'P-256',
    ext: true,
    key_ops: ['verify'],
    kty: 'EC',
    x: value.x,
    y: value.y
  };
}

function parseGameList(value: unknown): GameId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(parseGameId))];
}

function parseGameId(value: unknown): GameId {
  if (SUPPORTED_GAMES.includes(value as GameId)) return value as GameId;
  throw new ProtocolError('unsupported_game', 'Unsupported game.');
}

function parseActionPayload(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ProtocolError('invalid_payload', 'Action payload must be an object.');
  return value;
}

function getString(value: Record<string, unknown>, key: string): string {
  const text = value[key];
  if (typeof text !== 'string' || !text.trim()) {
    throw new ProtocolError('invalid_field', `${key} must be a non-empty string.`);
  }
  return text.trim();
}

function getBoolean(value: Record<string, unknown>, key: string): boolean {
  if (typeof value[key] !== 'boolean') throw new ProtocolError('invalid_field', `${key} must be a boolean.`);
  return value[key];
}

function normalizeOptionalLanguageCode(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ProtocolError('invalid_field', `${key} must be a string.`);

  const code = value.trim();
  if (!code) return undefined;
  if (!/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})?$/.test(code)) {
    throw new ProtocolError('invalid_field', `${key} must be a valid language or locale code.`);
  }
  return code.replace('_', '-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
