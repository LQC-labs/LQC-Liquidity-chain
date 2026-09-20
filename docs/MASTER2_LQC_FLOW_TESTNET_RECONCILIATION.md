# Master 2/15 — LQC Flow Testnet Evidence Reconciliation

Status: **2/3 reconciliation decision**

## Source lineage

Git history shows LQCFlowFactory.sol, LQCFlowPair.sol and LQCFlowRouter.sol were introduced together in commit:
`39adfcf53812dc394c3bdfb8b37d7330cfa448c1` — “Add LQC Flow DEX testnet MVP and swap interface”.

No later commit appears in the file history for these three Core files. Therefore the current source lineage for Factory/Pair/Router has not changed since that introduction.

The UI was later restored to the minimal BSC Testnet Router address in commit:
`418c4b445c6b9cefc564c08aec248149c934d41f`.

Current config still pins:
- LQC Flow Router: `0xA3E1fbe94055e7A8971b3994C7025B3c16273a24`
- tLQC: `0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc`
- WBNB: `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`
- chainId 97.

## Strong Testnet evidence

Repository evidence proves a later Router2→LQC Flow execution succeeded against the same pinned Flow Router through adapter `0x14db750acf95b469aba3e3880e3f6bc324a2c56d4`:
- tx `0xc1da9b744cf954802a59315ac4ce7cc38b1fac952ed6dd8691fb7d2336e7c4d6`
- exact input 10 tLQC
- positive WBNB output
- minOut satisfied
- LQC Flow Swap event observed
- residual user/router-adapter allowances zero.

The current focused Master 2 Flow CI gate also passes compile + AMM/security/native/Router2-Flow tests at the current main lineage.

## What source lineage does and does not prove

Because the three Core source files have not changed since their introduction, there is no repository evidence of a later source-level Core drift.

However, source-history equality alone does not cryptographically prove deployed runtime equality. Compiler settings, constructor arguments and deployment artifact/runtime hash must still be compared before granting artifact-identical release credit.

The Adapter was developed later and has its own evidence lineage; its historical successful execution proves operational compatibility but does not replace runtime-hash comparison.

## 2/3 decision

- No code rewrite is justified.
- No full LQC Flow redeployment is justified by current evidence.
- Existing BSC Testnet Router and successful swap evidence remain valid historical operational evidence.
- Candidate-vs-deployed runtime hash comparison remains the only material artifact-identity gap for Core release evidence.
- Missing canonical Factory/Pair address/hash evidence should be recovered or re-observed read-only if required for the final evidence bundle; absence does not imply contract failure.

Next:
**2/4 — classify real implementation gaps versus evidence-only gaps.**
