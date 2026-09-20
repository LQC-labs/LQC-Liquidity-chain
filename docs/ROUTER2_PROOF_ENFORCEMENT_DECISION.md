# Router 2.0 Proof-Bound Enforcement — Architecture Freeze G2 Decision

Status: **G2 architecture decision — deployment remains blocked until its Master-stage deployment review**

## Evidence reconciled

Historical BSC Testnet evidence records successful proof-bound route execution, but explicitly records:
- enforcement: client-and-sdk-bound
- proofVerifiedOnChain: false
- current ExecutionRouter did not verify proofHash/intentHash on-chain.

The repository now contains:
- LQCBestExecutionProof
- LQCProofBoundExecutionGateway
- replay protection through consumedProof
- candidate-set Best Execution verification
- current Registry adapter binding
- recipient binding
- reentrancy protection
- residual-token rollback
- allowance cleanup
- adversarial/local EVM tests
- a release gate that compares current compiled artifacts against the historical Stage1 bundle.

The historical Stage1 Proof Gateway bundle is preparation-only. It has no proofVerifier address, records no deployment transaction, and therefore is not current on-chain deployment evidence.

## Reuse decision

Keep and reuse the existing Router 2.0 execution foundation, including the already evidenced ExecutionRouter at:
`0x2E0a7F59cA65Ed36977adD5E71b8B64BA38d939F`

Do **not** redeploy the entire Router 2.0 stack merely to add proof enforcement.

The minimum candidate deployment scope is:
1. current reviewed LQCBestExecutionProof artifact;
2. current reviewed LQCProofBoundExecutionGateway artifact constructed with the approved Proof verifier and existing approved ExecutionRouter;
3. post-deployment read-only binding/runtime verification;
4. one capped proof-bound BSC Testnet execution plus replay/expiry/adapter-drift/failure evidence.

## Artifact-drift rule

The historical Stage1 bundle is not authorization to deploy. Immediately before any future deployment review:
- compile from the pinned commit and reviewed package lock;
- compute creation/runtime hashes;
- compare against the review packet;
- regenerate the packet if any hash, constructor dependency, nonce, address, compiler setting, or relevant chain state differs;
- never force a current artifact to match stale historical bytecode.

## Settlement boundary

The Proof Gateway proves and consumes the selected candidate and executes the selected route. It does **not by itself** constitute final Solver/Settlement completion.

Settlement must separately bind:
- user Intent identity;
- selected execution / proof hash;
- execution receipt / transaction evidence;
- finality;
- replay/tamper rejection;
- reorg/failure handling.

Therefore Router proof enforcement is an input to Master 10 Settlement/Execution Verification, not a substitute for it.

## G2 exit

Architecture G2 is resolved at design level:
- existing Router execution stack is reused;
- full Router redeployment is rejected as unnecessary;
- Proof verifier + Proof Gateway are the selective deployment candidates;
- deployment remains blocked until the relevant Master stage, fresh artifact review, and explicit deployment gate.
