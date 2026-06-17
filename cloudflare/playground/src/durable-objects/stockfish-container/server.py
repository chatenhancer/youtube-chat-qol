import json
import os
import queue
import shutil
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


DEFAULT_ELO = 1700
DEFAULT_MOVE_TIME_MS = 500
MAX_BODY_BYTES = 4096
MAX_MOVE_TIME_MS = 2000
REQUEST_TIMEOUT_SECONDS = 4.0
STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH") or shutil.which("stockfish") or "/usr/games/stockfish"


class StockfishEngine:
  def __init__(self, path):
    self.path = path
    self.current_elo = None
    self.lock = threading.Lock()
    self.process = None
    self.lines = queue.Queue()
    self.reader = None

  def best_move(self, fen, move_time_ms=DEFAULT_MOVE_TIME_MS, elo=DEFAULT_ELO):
    with self.lock:
      self._ensure_ready()
      self._configure_strength(elo)
      self._send(f"position fen {fen}")
      self._send(f"go movetime {move_time_ms}")
      try:
        line = self._read_until(lambda value: value.startswith("bestmove "), REQUEST_TIMEOUT_SECONDS)
      except TimeoutError:
        self._send("stop")
        try:
          line = self._read_until(lambda value: value.startswith("bestmove "), 0.5)
        except TimeoutError:
          self._restart()
          raise

      return parse_bestmove(line)

  def _ensure_ready(self):
    if self.process and self.process.poll() is None:
      return

    self.process = subprocess.Popen(
      [self.path],
      stdin=subprocess.PIPE,
      stdout=subprocess.PIPE,
      stderr=subprocess.STDOUT,
      text=True,
      bufsize=1,
    )
    self.lines = queue.Queue()
    self.reader = threading.Thread(target=self._read_stdout, daemon=True)
    self.reader.start()
    self.current_elo = None

    self._send("uci")
    self._read_until(lambda value: value == "uciok", REQUEST_TIMEOUT_SECONDS)
    self._send("setoption name UCI_LimitStrength value true")
    self._send("isready")
    self._read_until(lambda value: value == "readyok", REQUEST_TIMEOUT_SECONDS)

  def _configure_strength(self, elo):
    if self.current_elo == elo:
      return
    self._send(f"setoption name UCI_Elo value {elo}")
    self._send("isready")
    self._read_until(lambda value: value == "readyok", REQUEST_TIMEOUT_SECONDS)
    self.current_elo = elo

  def _read_stdout(self):
    if not self.process or not self.process.stdout:
      return
    for line in self.process.stdout:
      self.lines.put(line.strip())

  def _send(self, command):
    if not self.process or not self.process.stdin:
      raise RuntimeError("Stockfish process is not running.")
    self.process.stdin.write(command + "\n")
    self.process.stdin.flush()

  def _read_until(self, predicate, timeout_seconds):
    deadline = time.monotonic() + timeout_seconds
    while True:
      remaining = deadline - time.monotonic()
      if remaining <= 0:
        raise TimeoutError("Timed out waiting for Stockfish.")
      try:
        line = self.lines.get(timeout=remaining)
      except queue.Empty:
        raise TimeoutError("Timed out waiting for Stockfish.")
      if predicate(line):
        return line

  def _restart(self):
    if self.process and self.process.poll() is None:
      self.process.kill()
    self.process = None
    self.current_elo = None
    self.lines = queue.Queue()


ENGINE = StockfishEngine(STOCKFISH_PATH)


class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
    if self.path == "/health":
      self._write_json(200, {"ok": True})
      return
    self._write_json(404, {"error": "not_found"})

  def do_POST(self):
    if self.path != "/best-move":
      self._write_json(404, {"error": "not_found"})
      return

    try:
      payload = self._read_json()
      fen = require_text(payload, "fen")
      move_time_ms = clamp_int(payload.get("moveTimeMs"), DEFAULT_MOVE_TIME_MS, 10, MAX_MOVE_TIME_MS)
      elo = clamp_int(payload.get("elo"), DEFAULT_ELO, 750, 3190)
    except ValueError as error:
      self._write_json(400, {"error": "bad_request", "message": str(error)})
      return

    started_at = time.monotonic()
    try:
      move = ENGINE.best_move(fen, move_time_ms, elo)
    except Exception as error:
      self._write_json(500, {"error": "stockfish_failed", "message": str(error)})
      return

    self._write_json(200, {
      "elapsedMs": round((time.monotonic() - started_at) * 1000),
      "elo": elo,
      "move": move,
      "moveTimeMs": move_time_ms,
    })

  def _read_json(self):
    content_length = int(self.headers.get("content-length", "0"))
    if content_length <= 0:
      raise ValueError("Request body is required.")
    if content_length > MAX_BODY_BYTES:
      raise ValueError("Request body is too large.")

    raw_body = self.rfile.read(content_length)
    try:
      value = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
      raise ValueError("Request body must be valid JSON.")
    if not isinstance(value, dict):
      raise ValueError("Request body must be a JSON object.")
    return value

  def _write_json(self, status, payload):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    self.send_response(status)
    self.send_header("content-type", "application/json; charset=utf-8")
    self.send_header("content-length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def log_message(self, format, *args):
    return


def require_text(payload, key):
  value = payload.get(key)
  if not isinstance(value, str) or not value.strip():
    raise ValueError(f"{key} must be a non-empty string.")
  return value.strip()


def clamp_int(value, default, minimum, maximum):
  if value is None:
    return default
  if not isinstance(value, int):
    raise ValueError("Numeric fields must be integers.")
  return max(minimum, min(maximum, value))


def parse_bestmove(line):
  parts = line.split()
  if len(parts) < 2 or parts[1] == "0000":
    return None
  move = parts[1]
  if len(move) < 4:
    return None
  result = {
    "from": move[0:2],
    "to": move[2:4],
  }
  if len(move) >= 5:
    result["promotion"] = move[4]
  return result


def main():
  port = int(os.environ.get("PORT", "8080"))
  ENGINE._ensure_ready()
  ENGINE._configure_strength(DEFAULT_ELO)
  server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
  server.serve_forever()


if __name__ == "__main__":
  main()
