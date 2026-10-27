"""Merkle root computation.

A Merkle tree summarizes many transactions into a single hash:

            root
           /    \\
        h(AB)   h(CD)
        /  \\    /  \\
       A    B  C    D      <- transaction IDs (hashes)

Pairs of hashes are combined and hashed again, level by level, until one hash
remains. Changing any transaction changes its leaf, which changes every hash
above it, so the root changes too. The block header only needs to store the
root to commit to all of its transactions.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.core.hashing import sha256_hex

# Merkle root of a block with no transactions. Using a fixed, well-known value
# keeps the hash of an empty block reproducible.
EMPTY_MERKLE_ROOT = sha256_hex("")


def merkle_levels(leaf_hashes: Sequence[str]) -> list[list[str]]:
    """Every level of the Merkle tree, from the leaves (first) up to the root (last).

    When a level has an odd number of hashes, the last one is duplicated so
    every hash has a partner. This is the same rule Bitcoin uses. Levels are
    returned *before* that duplication, so they show the real hashes only.
    """
    if not leaf_hashes:
        return [[EMPTY_MERKLE_ROOT]]

    levels = [list(leaf_hashes)]
    while len(levels[-1]) > 1:
        level = levels[-1]
        paired = level + [level[-1]] if len(level) % 2 == 1 else level
        levels.append([sha256_hex(paired[i] + paired[i + 1]) for i in range(0, len(paired), 2)])
    return levels


def compute_merkle_root(leaf_hashes: Sequence[str]) -> str:
    """Return the Merkle root of the given leaf hashes (e.g. transaction IDs)."""
    return merkle_levels(leaf_hashes)[-1][0]
