"""Single-instance lock.

At one run a day overlapping runs were not a realistic worry. On a four-times
daily schedule with catch-up enabled they are: Windows will happily fire a
missed 10:00 run the moment the laptop wakes, which can land on top of the 14:00
one. Two concurrent runs would both re-fetch the same days and race each other's
upserts, and Garmin would see double the requests for no benefit.

This is a plain lock file holding a PID. A stale lock, left by a run that was
killed or a machine that lost power, is detected and reclaimed rather than
blocking every future run.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path

from .config import STATE_ROOT

LOCK_PATH = STATE_ROOT / "sync.lock"

# A run that has held the lock longer than this is assumed dead. Comfortably
# longer than a real run, which takes seconds.
STALE_AFTER_SECONDS = 30 * 60


class AlreadyRunning(RuntimeError):
    pass


def _process_alive(pid: int) -> bool:
    """Whether a PID is still running, without signalling it."""
    if pid <= 0:
        return False
    if os.name == "nt":
        import subprocess

        try:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True,
                text=True,
                timeout=10,
            ).stdout
            return str(pid) in out
        except Exception:  # noqa: BLE001 - if we cannot tell, fall back to age
            return True
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


@contextmanager
def single_instance():
    """Hold the lock for the duration of the block, or raise AlreadyRunning."""
    STATE_ROOT.mkdir(parents=True, exist_ok=True)

    if LOCK_PATH.exists():
        try:
            raw = LOCK_PATH.read_text(encoding="utf-8").strip()
            pid_text, _, started_text = raw.partition(",")
            pid = int(pid_text or 0)
            started = float(started_text or 0)
        except (ValueError, OSError):
            pid, started = 0, 0.0

        age = time.time() - started if started else STALE_AFTER_SECONDS + 1
        if pid and age < STALE_AFTER_SECONDS and _process_alive(pid):
            raise AlreadyRunning(
                f"Another sync is already running (pid {pid}, started {int(age)}s ago)."
            )
        # Stale: the owner is gone or it has been held implausibly long.
        try:
            LOCK_PATH.unlink()
        except OSError:
            pass

    LOCK_PATH.write_text(f"{os.getpid()},{time.time()}", encoding="utf-8")
    try:
        yield
    finally:
        try:
            LOCK_PATH.unlink()
        except OSError:
            pass
