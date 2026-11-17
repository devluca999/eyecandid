import sys
import types

from eyelore_engine import telemetry


def test_off_without_dsn():
    assert telemetry.init_sentry({}) is False
    telemetry.capture(RuntimeError("x"))  # a no-op, never raises


def test_off_when_sdk_missing(monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "sentry_sdk", None)  # makes `import sentry_sdk` raise ImportError
    assert telemetry.init_sentry({"SENTRY_DSN": "https://k@o.ingest.sentry.io/1"}) is False
    assert "sentry-sdk is not installed" in capsys.readouterr().err


def test_on_with_dsn_and_sdk(monkeypatch):
    calls = {}
    fake = types.ModuleType("sentry_sdk")
    fake.init = lambda **kw: calls.update(init=kw)
    fake.set_tag = lambda k, v: calls.setdefault("tags", {}).update({k: v})
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)
    assert telemetry.init_sentry({"SENTRY_DSN": "https://k@o.ingest.sentry.io/1"}, provider="cpu") is True
    assert calls["init"]["dsn"] == "https://k@o.ingest.sentry.io/1"
    assert calls["init"]["send_default_pii"] is False
    assert calls["tags"] == {"provider": "cpu"}
    telemetry.init_sentry({})  # leave the module disabled for other tests


def test_bad_dsn_does_not_stop_the_worker(monkeypatch):
    fake = types.ModuleType("sentry_sdk")

    def boom(**_):
        raise ValueError("bad dsn")

    fake.init = boom
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)
    assert telemetry.init_sentry({"SENTRY_DSN": "nonsense"}) is False
