# Master 6/12 — Clean Lending Stack Deployment Packet

Status: preparation-only

The 6/12 decision concluded that historical deployment evidence cannot be treated as the current clean Master 6 baseline after the 6/6, 6/8 and 6/11 contract changes.

To remove mixed historical state from the next validation cycle, the preferred clean-testnet path is a fresh isolated stack:

1. four fresh BSC-testnet price feeds;
2. LQCOracleManager;
3. LQCInterestRateModel;
4. LQCLendingMarketRegistry;
5. LQCLendingInterestIndex;
6. LQCLendingCore;
7. LQCLiquidationEngine.

The offline packet generator computes deterministic deployment addresses from a reviewed deployer + starting nonce, binds constructor dependencies to those predicted addresses, and prepares the governance configuration calls.

The market is deliberately configured with `enabled=false`. Activation belongs to 6/13 Lending E2E after deployment receipts and bindings are independently verified.

This packet generator never connects to an RPC and never signs or broadcasts.

Required next evidence before any transaction:
- current BSC Testnet deployer nonce from 2+ RPCs;
- deployer gas balance;
- source commit pin;
- compiled init-code digests;
- predicted-address vacancy;
- governance/guardian Safe identities;
- explicit human approval of the exact packet.

`activationAuthorized: false`
