import io
import signal
import threading
import unittest
from unittest import mock

import server


class FakeStockfishEngine(server.StockfishEngine):
  def __init__(self):
    super().__init__("stockfish")
    self.commands = []

  def _ensure_ready(self):
    return

  def _read_until(self, predicate, timeout_seconds):
    for line in ["readyok", "bestmove e7e5"]:
      if predicate(line):
        return line
    raise TimeoutError("test predicate did not match")

  def _send(self, command):
    self.commands.append(command)


class StockfishServerTest(unittest.TestCase):
  def test_best_move_reconfigures_elo_only_when_it_changes(self):
    engine = FakeStockfishEngine()

    self.assertEqual(engine.best_move("startpos", 500, 1700), {
      "from": "e7",
      "to": "e5",
    })
    self.assertEqual(engine.best_move("startpos", 500, 1700), {
      "from": "e7",
      "to": "e5",
    })
    self.assertEqual(engine.best_move("startpos", 500, 1900), {
      "from": "e7",
      "to": "e5",
    })

    self.assertEqual(engine.commands.count("setoption name UCI_Elo value 1700"), 1)
    self.assertEqual(engine.commands.count("setoption name UCI_Elo value 1900"), 1)
    self.assertEqual(engine.commands.count("go movetime 500"), 3)

  def test_clamp_int_allows_beginner_elo_floor(self):
    self.assertEqual(server.clamp_int(750, server.DEFAULT_ELO, 750, 3190), 750)
    self.assertEqual(server.clamp_int(100, server.DEFAULT_ELO, 750, 3190), 750)

  def test_close_quits_the_stockfish_process(self):
    engine = server.StockfishEngine("stockfish")
    process = mock.Mock()
    process.poll.return_value = None
    process.stdin = io.StringIO()
    engine.process = process
    engine.current_elo = 1700

    engine.close()

    self.assertEqual(process.stdin.getvalue(), "quit\n")
    process.wait.assert_called_once_with(timeout=server.SHUTDOWN_TIMEOUT_SECONDS)
    self.assertIsNone(engine.process)
    self.assertIsNone(engine.current_elo)

  def test_shutdown_handler_stops_the_http_server_once(self):
    stopped = threading.Event()
    http_server = mock.Mock()
    http_server.shutdown.side_effect = stopped.set

    with mock.patch.object(server.signal, "signal") as register_signal:
      handler = server.install_shutdown_handlers(http_server)

    register_signal.assert_any_call(signal.SIGTERM, handler)
    register_signal.assert_any_call(signal.SIGINT, handler)

    handler(signal.SIGTERM, None)
    handler(signal.SIGTERM, None)

    self.assertTrue(stopped.wait(timeout=1))
    http_server.shutdown.assert_called_once_with()


if __name__ == "__main__":
  unittest.main()
