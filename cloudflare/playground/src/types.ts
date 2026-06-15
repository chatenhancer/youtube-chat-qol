export interface Env {
  ALLOWED_ORIGIN_PATTERNS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  PLAYER_STATS?: DurableObjectNamespace;
  STOCKFISH_ELO?: string;
  STOCKFISH_ENGINE?: DurableObjectNamespace;
  STOCKFISH_MOVE_TIME_MS?: string;
  STREAM_ROOMS: DurableObjectNamespace;
}
