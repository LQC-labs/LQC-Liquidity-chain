# Master 2/15 — LQC Flow Reproducible Build / Deployment Evidence Gate

Status: **2/8 implementation**

This gate prevents future LQC Flow deployments from receiving release credit without a reproducible evidence chain.

## Pre-deployment seal

The gate records:
- exact source commit when running in CI;
- Solidity compiler version;
- optimizer, viaIR and EVM settings;
- creation bytecode hash;
- runtime bytecode hash;
- target network and chainId;
- the mandatory post-deployment evidence fields.

## Mandatory deployment evidence

A selective future deployment is not evidence-complete until its record includes:
1. constructor arguments;
2. deployer or approved governance identity;
3. network and chainId;
4. transaction hash;
5. block number;
6. resulting contract address;
7. creation/runtime hashes tied back to the pinned pre-deployment seal.

## Safety

The 2/8 gate is preparation only. It performs no RPC call, wallet access, signature, approval, transfer, transaction or deployment.

It does not authorize a Flow redeployment. It does not modify Futures production code or Futures Testnet state.

## Completion criterion

2/8 is complete when CI can compile current artifacts and generate the reproducibility seal deterministically. Any future selective deployment decision remains a separate reviewed gate.
