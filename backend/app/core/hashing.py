"""Hashing helpers built on Python's standard ``hashlib``.

SHA-256 turns any input into a fixed 256-bit (64 hex character) fingerprint.
Three properties make it useful for blockchains:

* Deterministic   - the same input always gives the same hash.
* Avalanche effect - changing one character changes the hash completely.
* One-way         - you cannot work backwards from a hash to the input, so the
                    only way to find a hash with a given pattern is to guess.

The guessing part is exactly what "mining" is.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def sha256_hex(data: str) -> str:
    """Return the SHA-256 digest of ``data`` as a 64-character hex string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def canonical_json(payload: Any) -> str:
    """Serialize ``payload`` to JSON in one fixed, reproducible form.

    Hashing requires byte-for-byte identical input. A normal ``json.dumps``
    could order dictionary keys differently or add whitespace, which would
    produce a different hash for logically identical data. Sorting keys and
    removing whitespace guarantees every node computes the same hash.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def hash_payload(payload: Any) -> str:
    """Hash any JSON-serializable structure deterministically."""
    return sha256_hex(canonical_json(payload))


def meets_difficulty(block_hash: str, difficulty: int) -> bool:
    """Check the proof-of-work target: the hash must start with ``difficulty`` zeros.

    Example: with difficulty 3, ``"000a4f..."`` is valid and ``"00a4f..."`` is not.
    Each extra zero makes a valid hash ~16x rarer (one hex digit has 16 values).
    """
    return block_hash.startswith("0" * difficulty)
