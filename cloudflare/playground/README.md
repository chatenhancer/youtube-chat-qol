# Playground backend

This worker is the opt-in realtime backend for Playground features.

Playground is separate from normal extension features. The extension connects to
this backend only after Playground is enabled.

## Identity and privacy

The backend does not use YouTube OAuth or YouTube handles as identity. Playground
uses a locally generated identity without sending YouTube cookies or
credentials.

Playground traffic is scoped to the current stream. It can include presence,
available games, invites, invite responses, and game actions. It excludes live
chat text, YouTube display names, and YouTube avatar URLs.
