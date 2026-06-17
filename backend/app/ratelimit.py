"""Tiny in-memory rate limiter (standard library only).

A best-effort sliding-window limiter keyed by client IP, used to slow down
login brute-force. State is per-process (resets on restart, not shared across
workers) — for hardened production also enforce limits at the reverse proxy
(nginx / Cloudflare). Good enough to stop naive credential-stuffing.
"""
from __future__ import annotations

import threading
import time

_hits: dict[str, list[float]] = {}
_lock = threading.Lock()


def allow(key: str, *, limit: int = 10, window_seconds: int = 300) -> bool:
    """Return False if `key` has reached `limit` events within the window."""
    now = time.time()
    with _lock:
        recent = [t for t in _hits.get(key, []) if now - t < window_seconds]
        if len(recent) >= limit:
            _hits[key] = recent
            return False
        recent.append(now)
        _hits[key] = recent
        # opportunistic cleanup to bound memory
        if len(_hits) > 5000:
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > window_seconds]:
                _hits.pop(k, None)
    return True
