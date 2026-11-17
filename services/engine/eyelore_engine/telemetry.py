"""Optional Sentry for the worker. Off unless SENTRY_DSN is set AND sentry-sdk is installed
(`pip install 'eyelore-engine[sentry]'`); the worker and its tests run identically without either."""
from __future__ import annotations

import os
import sys
from typing import Mapping

_enabled = False


def init_sentry(env: Mapping[str, str] | None = None, *, provider: str = "") -> bool:
    """Initialise Sentry if configured. Returns whether error reporting is on. Never raises."""
    global _enabled
    env = os.environ if env is None else env
    dsn = env.get("SENTRY_DSN", "").strip()
    _enabled = False
    if not dsn:
        return False
    try:
        import sentry_sdk  # optional dependency
    except ImportError:
        print("[eyelore] SENTRY_DSN is set but sentry-sdk is not installed · error reporting off", file=sys.stderr)
        return False
    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=env.get("EYELORE_ENV", "production"),
            traces_sample_rate=0.0,
            send_default_pii=False,
        )
        if provider:
            sentry_sdk.set_tag("provider", provider)
    except Exception as e:  # noqa: BLE001 - a bad DSN must not stop the worker
        print(f"[eyelore] sentry init failed ({type(e).__name__}) · error reporting off", file=sys.stderr)
        return False
    _enabled = True
    return True


def capture(exc: BaseException, **tags: str) -> None:
    """Report an exception if Sentry is on; otherwise do nothing."""
    if not _enabled:
        return
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            for k, v in tags.items():
                scope.set_tag(k, v)
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
        pass
