"""Contract test: the worker validates against the JSON Schema emitted from packages/core (ADR 0004)."""
import pytest
from jsonschema import ValidationError

from eyelore_engine import contract
from eyelore_engine.handlers import registry

EXPECTED = {"hello", "transcribe", "autocut", "reframe", "still", "i2v", "t2v", "voice", "matte", "inpaint", "grade", "render"}


def test_schema_has_every_job_type():
    assert set(contract.job_types()) == EXPECTED
    assert contract.schema()["contract"]["apiVersion"] == 1


def test_every_handler_is_in_the_contract():
    assert set(registry()) <= EXPECTED


def test_input_validation():
    contract.validate_input("hello", {"message": "hi", "steps": 3})
    with pytest.raises(ValidationError):
        contract.validate_input("hello", {"steps": 3})
    with pytest.raises(ValidationError):
        contract.validate_input("voice", {"text": "x", "voiceId": "v"})  # consent is required


def test_output_validation():
    contract.validate_output("hello", {"echo": "hi", "worker": "w", "provider": "cpu-stub"})
    with pytest.raises(ValidationError):
        contract.validate_output("hello", {"echo": 1})
