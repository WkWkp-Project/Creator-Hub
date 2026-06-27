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
_failures: dict[str, list[float]] = {}
_lock = threading.Lock()


def register_failure(key: str, *, window_seconds: int = 900) -> None:
    """Record a failed attempt (e.g. a bad login) for per-account lockout."""
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(key, []) if now - t < window_seconds]
        recent.append(now)
        _failures[key] = recent


def failure_count(key: str, *, window_seconds: int = 900) -> int:
    """Number of recent failures within the window (prunes old ones)."""
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(key, []) if now - t < window_seconds]
        _failures[key] = recent
        return len(recent)


def clear_failures(key: str) -> None:
    """Reset the failure counter (call on a successful login)."""
    with _lock:
        _failures.pop(key, None)


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
