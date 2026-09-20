# Futures production-oracle source review — BSC Testnet

Date reviewed: 2026-09-20  
Network: BNB Chain Testnet  
Expected chainId: 97  
Status: **ACTIVATION BLOCKED — independent reference source unresolved**

## Official Chainlink primary candidate

The official Chainlink Price Feed Contract Addresses page was filtered to **BNB Chain → Testnet**.

| Pair | Official proxy address | Intended role |
|---|---|---|
| BTC / USD | `0x5741306c21795FdCBb9b265Ea0255F499DFe515C` | Primary candidate only |

Official source:

- https://docs.chain.link/data-feeds/price-feeds/addresses
- The selected page state displayed the **BNB Chain Testnet** heading and the BTC / USD proxy above.
- The address linked to BscScan Testnet at:
  https://testnet.bscscan.com/address/0x5741306c21795FdCBb9b265Ea0255F499DFe515C

## Blocking decision

The reviewed official BNB Chain Testnet list displayed one BTC / USD feed. The LQC Futures production-oracle activation gate requires distinct Primary and Reference addresses. Therefore:

1. The official BTC / USD proxy may be evaluated as a Primary candidate.
2. It must not be reused as the Reference feed.
3. No unreviewed community feed may be inserted to satisfy the distinct-address check.
4. No adapter deployment, `setFeed`, `setCircuitBreaker`, market-oracle replacement, or production activation is authorized by this record.
5. Activation remains blocked until an independent reference design is implemented and reviewed, such as a manipulation-resistant DEX TWAP adapter with liquidity, observation-window, and deviation safeguards.

## Required evidence before activation

- read-only chainId 97 check;
- runtime bytecode at every selected source;
- `decimals()` and `latestRoundData()` validation;
- positive answer, complete round, non-future timestamp, and heartbeat freshness;
- independent Reference source design and threat-model review;
- deployed LQC adapter runtime bytecode and verified constructor owner;
- Governance Owner review of ordered `setFeed` then `setCircuitBreaker` calldata;
- transaction hashes, successful receipts, and post-state verification;
- full Futures/DEX regression and dependency audit.

This is an evidence record only. It contains no private key and sends no transaction.
