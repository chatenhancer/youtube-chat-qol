# Playground backend

This worker is the opt-in realtime backend for Playground features.

Playground is separate from the normal extension features. Users must opt in
before the extension connects to this backend. Chess is the only game module for
now.

## Architecture

The backend is organized around stream-local rooms.

- The worker accepts extension clients and routes them to the correct stream
  room.
- A Durable Object owns each room's presence, invites, and active game state.
- A Cloudflare Container runs Stockfish for the server-owned chess computer so
  engine search cannot consume stream-room Durable Object CPU.
- Shared protocol types keep the extension and backend aligned.
- Game-specific rules live in game modules instead of the room transport.

This keeps the room layer focused on realtime delivery while each game owns its
own state transitions and validation.

## Identity and privacy

The backend does not use YouTube OAuth and does not trust YouTube handles as
identity.

Clients use a locally generated keypair to sign a short server challenge. The
backend verifies the signature and derives a pseudonymous user ID from the
public key. This gives one browser install a stable Playground identity without
sending YouTube cookies or credentials.

Playground traffic is scoped to the current stream. It can include presence,
available games, invites, invite responses, and game actions such as chess
moves. It should not include live chat message text, YouTube handles, or
YouTube avatar URLs.

## Room model

Rooms expose only what the extension needs for a compact lobby:

- available users in the same stream
- pending invites
- active game summaries
- private game updates for the players in a game

The extension can reconnect a dropped WebSocket after the user retries, then
re-authenticate with the same local identity.

## Adding games

New games should be added as independent modules behind the game registry. The
stream room should remain transport and lobby infrastructure, not a growing
switch statement for every game.

Game modules should own:

- game creation
- public snapshots
- action validation
- end-state handling

## Operations

Production origins should stay tight. Browser-extension origins are handled in a
way that supports both Chromium and Firefox extension pages.

Deploying the Playground worker now also builds and pushes the Stockfish
container image from `stockfish-container/Dockerfile`. Docker, or a compatible
Docker CLI and engine, must be available locally for `wrangler deploy`. If the
Stockfish container is cold, unavailable, or times out, the chess computer logs
`chess_bot_stockfish_fallback` and uses the local legal-move fallback.

For current entrypoints, scripts, routes, and Durable Object configuration, use
the source files, `wrangler.toml`, and root package scripts as the source of
truth.
