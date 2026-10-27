from app.core.hashing import canonical_json, hash_payload, meets_difficulty, sha256_hex


def test_sha256_known_vector() -> None:
    # Standard test vector for SHA-256("abc").
    assert sha256_hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_hash_is_64_hex_characters() -> None:
    digest = sha256_hex("hello")
    assert len(digest) == 64
    int(digest, 16)  # raises if not hex


def test_avalanche_effect() -> None:
    a, b = sha256_hex("hello"), sha256_hex("hellp")
    differing = sum(x != y for x, y in zip(a, b))
    assert differing > 40  # a one-letter change scrambles most of the output


def test_canonical_json_ignores_key_order() -> None:
    assert canonical_json({"b": 1, "a": 2}) == canonical_json({"a": 2, "b": 1})
    assert hash_payload({"b": 1, "a": 2}) == hash_payload({"a": 2, "b": 1})


def test_meets_difficulty() -> None:
    assert meets_difficulty("000abc", 3)
    assert not meets_difficulty("00abcd", 3)
    assert meets_difficulty("0abc", 1)
