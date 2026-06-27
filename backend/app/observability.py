"""Production observability: structured JSON logging, request-id correlation,
an access log, an optional Sentry hook, and a real readiness probe.

Everything is stdlib-only except the optional Sentry SDK, which is used only when
SENTRY_DSN is set and the package is installed.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from contextvars import ContextVar

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

# Correlation id for the in-flight request (falls back to "-" outside a request).
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

log = logging.getLogger("creatorhub")


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        for key, value in getattr(record, "extra_fields", {}).items():
            entry[key] = value
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    """Route all logs through a single JSON handler on stdout."""
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # We emit our own structured access log, so silence uvicorn's plain one.
    for noisy in ("uvicorn.access",):
        lg = logging.getLogger(noisy)
        lg.handlers[:] = []
        lg.propagate = False


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns/propagates X-Request-ID and emits one structured access-log line
    per request (and logs unhandled exceptions with the same id)."""

    async def dispatch(self, request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        tok = request_id_var.set(rid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            ms = round((time.perf_counter() - start) * 1000, 1)
            log.exception("unhandled error", extra={"extra_fields": {
                "method": request.method, "path": request.url.path, "ms": ms}})
            request_id_var.reset(tok)
            raise
        ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers["X-Request-ID"] = rid
        # Skip static-asset noise; log API + page requests.
        if not request.url.path.startswith("/assets/"):
            log.info("request", extra={"extra_fields": {
                "method": request.method, "path": request.url.path,
                "status": response.status_code, "ms": ms}})
        request_id_var.reset(tok)
        return response


def init_sentry(dsn: str, environment: str) -> bool:
    """Initialise Sentry error tracking when configured + installed."""
    if not dsn:
        return False
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=dsn, environment=environment, traces_sample_rate=0.0)
        log.info("sentry initialised")
        return True
    except Exception:
        log.warning("SENTRY_DSN is set but sentry_sdk is not installed — error tracking off")
        return False


def db_ready(engine) -> bool:
    """True if the database answers a trivial query (real readiness signal)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        log.exception("readiness check: database unavailable")
        return False
