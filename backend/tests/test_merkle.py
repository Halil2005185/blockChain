from app.core.hashing import sha256_hex
from app.core.merkle import EMPTY_MERKLE_ROOT, compute_merkle_root


def test_empty_root() -> None:
    assert compute_merkle_root([]) == EMPTY_MERKLE_ROOT


def test_single_leaf_is_its_own_root() -> None:
    assert compute_merkle_root(["aa"]) == "aa"


def test_two_leaves() -> None:
    assert compute_merkle_root(["aa", "bb"]) == sha256_hex("aabb")


def test_odd_count_duplicates_last_leaf() -> None:
    ab = sha256_hex("aabb")
    cc = sha256_hex("cccc")
    assert compute_merkle_root(["aa", "bb", "cc"]) == sha256_hex(ab + cc)


def test_order_matters() -> None:
    assert compute_merkle_root(["aa", "bb"]) != compute_merkle_root(["bb", "aa"])


def test_levels_go_from_leaves_to_root() -> None:
    from app.core.merkle import merkle_levels

    levels = merkle_levels(["aa", "bb", "cc"])
    assert levels[0] == ["aa", "bb", "cc"]  # leaves shown without the duplicate
    assert levels[1] == [sha256_hex("aabb"), sha256_hex("cccc")]
    assert levels[-1] == [compute_merkle_root(["aa", "bb", "cc"])]
    assert merkle_levels([]) == [[EMPTY_MERKLE_ROOT]]
