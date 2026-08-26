#!/usr/bin/env python3
"""Console entry point for the sync agent."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fitsync.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
