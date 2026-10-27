"""Phase 1 walkthrough: run `python demo.py` to see the core in action."""

from app.core import Blockchain, Transaction


def main() -> None:
    chain = Blockchain(difficulty=4)
    genesis = chain.chain[0]
    print(f"Genesis block  hash={genesis.hash}  nonce={genesis.nonce}")

    chain.add_transaction(Transaction("alice", "bob", 25))
    chain.add_transaction(Transaction("bob", "carol", 10))
    print(f"\nPending transactions: {len(chain.pending_transactions)}")

    def show(progress) -> None:
        print(f"  nonce={progress.nonce:>7}  hash={progress.current_hash[:20]}...", end="\r")

    block, result = chain.mine_pending_transactions("miner-1", progress_callback=show)
    print(
        f"\nMined block #{block.index} in {result.attempts:,} attempts "
        f"({result.duration_seconds:.2f}s, {result.hashes_per_second:,.0f} H/s)"
    )
    print(f"  hash          = {block.hash}")
    print(f"  previous_hash = {block.previous_hash}")
    print(f"  merkle_root   = {block.merkle_root}")

    chain.mine_pending_transactions("miner-1")
    print(f"\nChain height: {chain.height}, valid: {chain.is_chain_valid()}")

    print("\nTampering: changing alice -> bob from 25 to 2500 in block 1 ...")
    chain.chain[1].transactions[1].amount = 2500
    report = chain.validate_chain()
    print(f"  valid: {report.is_valid}, untrusted blocks: {report.untrusted_indices}")
    for issue in report.issues:
        print(f"  [{issue.code}] {issue.message}")

    print("\nRe-mining block 1 to hide the change ...")
    chain.chain[1].mine_block()
    for issue in chain.validate_chain().issues:
        print(f"  [{issue.code}] {issue.message}")


if __name__ == "__main__":
    main()
