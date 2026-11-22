# 76-17-⑥-⑤ / M14 — Independent on-chain evidence acquisition plan and stop condition

**Decision: CANDIDATE NOT FOUND IN REVIEWED DEPLOYMENT RECORDS / ON-CHAIN NEW-CANDIDATE CHECK NOT_RUN / NO DEPLOYMENT AUTHORITY**

## Verified repository evidence at checkpoint

- Historical test-only Futures deployment (2026-09-19), chainId 97: `dex/deployments/bsc-testnet/futures-2026-09-19.md`.
- Old Registry: `0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0`.
- Old Vault: `0xb532c65294a7b35ca510a7df025e934fa17c8d7e`.
- Old Engine: `0xe4f1320c8709631776c7e39e0916584935882525`.
- Old mock/test-only Oracle: `0xbf6a446c5e17228e70e45645ab47f751bdfc4b41`.
- M08 confirmed known account has 5000 mUSDT available at historical block 144115366; rights remain in original Vault, no implicit transfer.
- `test/fixtures/futures-m10-undesignated-candidate.json` explicitly records proposed new Registry, Vault, Engine, Oracle and collateral as UNASSIGNED.
- `test/fixtures/futures-m12-security-unassigned.json` separately records new Oracle/feed and Safe/Guardian evidence as unassigned.
- M10/M11/M12/M13 existing focused tests already ran successfully. **Do not re-run them just to generate another administrative checkpoint.**
- Older candidate feed note `docs/futures/BSC_TESTNET_PRODUCTION_ORACLE_SOURCE_REVIEW.md` (2026-09-20) lists Chainlink BSC Testnet BTC/USD primary feed as historical *candidate only* and explicitly BLOCKED independent reference design. Not a selected new-stack Oracle and not proof of 2026-11 live provenance.
- The historical testnet deployment is NOT a new Futures deployment candidate. The reviewed files do not establish a new independent live stack.

## Real-world restart trigger (not yet met)

A *separately authorized, already existing* new **test-only** stack (not legacy Vault `setEngine`) must have:
1. Exact chainId and independently verifiable deployment tx hashes/receipts for NEW Registry, Vault, Engine, Oracle adapter, and the actual feed/proxy contracts.
2. Distinct new contract addresses, collateral token address, source commit and reproducible runtime bytecode hashes.
3. Market ID, index token, recovery policy, feed provider reference and source license/proxy provenance.
4. Registry/Vault/Oracle owners, Guardian address, Safe address, signer set, threshold, contract implementation and completed owner handover evidence.
5. A preselected canonical block number and hash on chain 97, independent reviewer and written test-only scope approval.

**Addresses are inputs only, not a request to deploy; no private keys, API tokens or wallet signatures should be supplied to this plan.**

## Independent double-RPC read-only procedure (once inputs exist)

A. Read chainId, block number/hash via two independently operated BSC Testnet RPC providers. Record provider domains and observation timestamps; if either RPC does not serve the same pinned block or lacks historical state, mark BLOCKED. Do not assume two RPC endpoints are independent without checking their operator/dependencies.

B. At the same exact block **hash where supported** (or explicitly document weaker block-number-only semantics), read deployment receipts, extcode, keccak256 runtime hashes, Registry/Vault/Engine wiring, ownership, Guardian, market status, token collateral and Oracle address. Compare **raw responses**, not merely two PASS flags.

C. For the Oracle adapter, independently inspect `feedConfigs(indexToken)`, `configVersion`, source feed runtime implementation/proxy code, heartbeat, price decimals, `latestRoundData`, quote timestamp and reference feed/deviation, noting historical vs live freshness. A historic pinned block's fresh quote is not evidence of quote freshness at activation time.

D. For governance, inspect Safe owners and threshold against the exact deployment governance authorization, verify implementation/proxy and owner acceptance, registry recovery epoch and approval lease, Guardian limitations and emergency halt. A Safe threshold alone does not prove a signer owns the keys or an approval is valid.

E. Validate source commit reproducibility and calldata/epoch replay protection against the candidate runtime, independent auditor's scope and signoff, without activating a market.

F. Independently preserve the existing historical Vault address, Engine pointer, known-user available and locked balances; independently review inventory completeness before any retirement or migration decision. No new stack may debit or appropriate historical user assets automatically.

## Acceptance criteria / explicit fail closed

- **FAIL:** different block hashes between providers, wrong chainId, contradictory code hashes, wiring or owners, reused historical core address, incorrect Oracle, changed legacy balance rights, invalid recovery epoch, unsafe approval or invented asset transfers.
- **BLOCKED:** missing input addresses, receipts, proxy/feed provenance, trustworthy second RPC, unavailable historical state, unverifiable ownership/Signer/Safe proof, independent audit/authorization not provided, or only a manifest with self-asserted PASS.
- **EVIDENCE_RECONCILED (never deployment approval):** independently captured signed-off two-provider raw evidence matches pinned source and contract state, with all unresolved economic/security obligations separately dispositioned. This label does NOT override M07/M12 security or operations gates.

## Current result

**M14 = DOCUMENTED PROCEDURE / NEW STACK ON-CHAIN VERIFICATION NOT_RUN.** No real new addresses found in the reviewed repository records. No invented new contract, no additional CI run, no contract deployment, `setEngine`, RPC transaction, governance signature, market activation, token transfer, main merge or change to PR #460.

**Next action:** hold M14 until actual candidate contracts or a separately approved isolated test-only deployment plan exist; meanwhile continue productive development against the current isolated Foundry stack rather than generating redundant gate numbers.
