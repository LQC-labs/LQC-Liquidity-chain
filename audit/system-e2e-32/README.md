# LQC SYSTEM-E2E-32 review candidate

This directory adds the Solidity source of the stage 107 audit candidate as a self-contained Foundry review project. It does not replace the active DEX contracts or alter the staged Futures recovery work in PR #460. The source candidate is a separate lineage. Integrating it into runtime entry points requires a reviewed follow-up.

Run the pinned Solidity 0.8.30 Foundry build from this directory. The compiler uses Shanghai, viaIR and the included settings. Use the affected Foundry tests under test/ with an offline compiler. For the JavaScript planning helpers, install ethers using the existing dex dependency setup or make ethers 6.17.0 available to Node. The journal helper requires a caller-held exclusive lock and a trusted plan. It is not a production broadcaster or signer.

The frozen local candidate contains 169 files and 159 recorded compiled artifacts. This review cut contains the complete Solidity source and the portable Foundry cases. The source/configuration/test digest list represents this review cut. The local audit manifest and compiled artifacts remain separate. Prior workspace-dependent Anvil cases, raw RPC evidence, generated artifacts, binary packages and deployment configuration are outside this review cut.

Historical local evidence through stage 108 totals 60 PASS checks. In scope are Engine 19,729 B with embedded FundingMath 1,875 B, Lending Core 14,469 B, Rate Model 2,641 B, Router 5,198 B, Source Escrow 5,300 B, Signed Escrow 5,472 B, and Staking Rewards 5,296 B. In stage 109 the 10 priority constructors were measured on Anvil, and historical DEX code and Safe settings were observed read-only. They are not release approvals. Those checks were not rerun for this upload.

Open release gates include QuickNode ticket #25471; Lending legacy reconciliation, migration and activation; official Futures Dual Oracle; Creator legacy migration and payout activation; approved live constructor values, authority, and independent audit and testnet checks. No production signing, deployment, activated market or value transfer is part of this proposal.
