from app.core import Blockchain
from app.core.blockchain import GENESIS_DATA, GENESIS_PREVIOUS_HASH, GENESIS_TIMESTAMP


def test_chain_starts_with_genesis(chain: Blockchain) -> None:
    assert len(chain.chain) == 1
    assert chain.height == 0
    assert chain.get_latest_block() is chain.chain[0]


def test_genesis_fields(chain: Blockchain) -> None:
    genesis = chain.chain[0]
    assert genesis.index == 0
    assert genesis.previous_hash == GENESIS_PREVIOUS_HASH
    assert genesis.timestamp == GENESIS_TIMESTAMP
    assert genesis.data == GENESIS_DATA
    assert genesis.transactions == []
    assert genesis.difficulty == chain.difficulty


def test_genesis_is_mined(chain: Blockchain) -> None:
    genesis = chain.chain[0]
    assert genesis.validate_hash()
    assert genesis.hash.startswith("0" * chain.difficulty)


def test_genesis_is_identical_across_instances() -> None:
    # Different nodes must agree on the very first block.
    assert Blockchain(difficulty=2).chain[0].hash == Blockchain(difficulty=2).chain[0].hash


def test_genesis_depends_on_its_parameters() -> None:
    assert Blockchain(difficulty=1).chain[0].hash != Blockchain(difficulty=2).chain[0].hash


def test_first_block_links_to_genesis(chain: Blockchain) -> None:
    block, _ = chain.mine_pending_transactions("miner")
    assert block.previous_hash == chain.chain[0].hash


def test_tampered_genesis_is_detected(chain: Blockchain) -> None:
    chain.chain[0].data = "rewritten history"
    result = chain.validate_chain()
    assert not result.is_valid
    assert result.first_invalid_index == 0
