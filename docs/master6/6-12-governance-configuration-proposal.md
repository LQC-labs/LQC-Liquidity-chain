# Master 6/12 — Governance Configuration Proposal Preparation

Status: **PROPOSAL PREPARATION ONLY**

The clean Lending stack has already passed the 10/10 BSC Testnet post-deployment verification gate. The next 6/12 step is to prepare, but not execute, the seven Governance Safe configuration actions required before Lending E2E.

The gate performs a fresh two-RPC read-only verification that the deployed stack is still unconfigured, then reads the Governance Safe owner set, threshold and nonce. The expected governance boundary is 4-of-7.

It prepares exactly seven ordered Safe transactions from the frozen clean-deployment packet:

1. Configure collateral Oracle feeds.
2. Configure debt Oracle feeds.
3. Configure the Lending interest-rate model.
4. Initialize the Lending market index state.
5. Bind Interest Index to Lending Core.
6. Configure the Lending market in **disabled** state.
7. Bind Lending Core to the Liquidation Engine.

Every action uses value 0 and CALL operation 0. The exact target, calldata, sequential Safe nonce and Safe transaction hash are frozen into the proposal packet.

This step does **not** collect signatures, submit Safe proposals, execute configuration, transfer tokens or enable the market.

A separate explicit human approval is required before any of the seven Governance Safe configuration transactions can be signed or executed.

`governanceConfigurationAuthorized: false`

`activationAuthorized: false`

Market activation remains reserved for Master 6/13 Lending E2E.
