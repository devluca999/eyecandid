"""Validate job inputs/outputs against the JSON Schema emitted from the zod contract (ADR 0004)."""
from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from pathlib import Path

from jsonschema import Draft202012Validator

def _repo_schema() -> Path:
    """Dev checkout fallback: services/engine/eyelore_engine → repo root → packages/core/schema."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "core" / "schema" / "jobs.schema.json"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("jobs.schema.json not packaged and no repo checkout found")


@lru_cache(maxsize=1)
def schema() -> dict:
    packaged = resources.files("eyelore_engine").joinpath("jobs.schema.json")
    if packaged.is_file():
        return json.loads(packaged.read_text())
    return json.loads(_repo_schema().read_text())


def job_types() -> list[str]:
    return sorted(schema()["jobs"].keys())


def version_of(job_type: str) -> int:
    return int(schema()["jobs"][job_type]["version"])


def _validator(job_type: str, side: str) -> Draft202012Validator:
    s = dict(schema()["jobs"][job_type][side])
    s.pop("$schema", None)
    return Draft202012Validator(s)


def validate_input(job_type: str, value: dict) -> None:
    _validator(job_type, "input").validate(value)


def validate_output(job_type: str, value: dict) -> None:
    _validator(job_type, "output").validate(value)
