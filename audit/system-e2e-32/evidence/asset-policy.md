# Stage 107 asset protection and remaining work

## Accounting and emergency behavior

Lending Core supplies cash by market, issues supply shares and accrues supplier interest from the supply index. Debt uses a separate borrow index; the rate input is capped at full use. Available cash fences shared token deficits and is not the balance of the whole contract. Earn reuses that supplier receivable; it has no additional funded token claim. Repay and available cash withdrawal do not require an enabled market, but do require valid interest accounting and available/backed cash. A market pause must not be implemented by disabling the rate model indiscriminately because elapsed-interest updates call the model. Existing repayment, interest, cash accounting and market-pause evidence is reused.

Staking stakes LQC principal and tracks active and pending unstake amounts. The Rewards module holds a separate funded reserve. Before stage 107, reward funding was allowed before the Vault installed the module, so new principal could enter without the checkpoint, incorrectly accruing past rewards. Funding now requires the Vault's rewardAccounting pointer to name that module. The Vault's one-time wiring remains a Governance action. Launchpad reads active stakedBalance to determine eligibility and does not custody principal. Guardian can pause new staking or enable user emergency exit; previously queued exits retain their snapshot cooldown under the existing rule. New emergency exit requests can complete immediately, and paused reward funding does not block claims already earned.

Futures ACTIVE allows opening and increasing with valid price, approvals and risk limits. REDUCE_ONLY permits price-dependent reduction, close and liquidation when the applicable approved Oracle/proof and accounting criteria pass; it bars new and increasing exposure. HALTED rejects all price-dependent execution, including liquidation and voluntary reduction, while available Vault collateral remains withdrawable subject to Vault accounting. Locked margin cannot be released unilaterally. The safe outage recovery is to keep HALTED until a verified fresh Oracle/session is approved for the current incident epoch, then reopen risk-reducing operations under REDUCE_ONLY. Activation requires its separate approvals. No stale price or last-known-price settlement policy was added. No new Futures runtime tests were run.

No finalized live Creator revenue/obligation proof or Risk execution evidence was located in the reviewed deployment inputs. Stage 106 local proof supports mechanics only. Maintain migration and payouts blocked until finalized receipts/traces and legacy assets, allocated balances and obligations reconcile.

## Remaining work by category

| Service | Next boundary | Category |
|---|---|---|
| DEX | approve assets, pairs, adapters and Risk executor; verify on public testnet | connection/configuration, approval, testnet |
| Futures | authenticate both official Oracle inputs, approve recovery transitions and verify testnet | external Oracle, connection/configuration, approval, testnet |
| Lending/Earn/Staking | historical ledger and Oracle, reciprocal staking linkage, limits and market activation | external RPC/Oracle, connection/configuration, approval |
| Intent | settle a separately approved legacy refund design for permanently nonexact tokens if confirmed present; verify final immutable wiring | contingent code, connection/configuration, independent audit |
| Solver | approved solvers, bond and Assignment roles; zero-fee policy | connection/configuration, approval |
| Settlement | pin live Hub/Verifier/Recorder and finalized receipts | connection/configuration, external RPC, testnet |
| Launchpad | approve token/sale policy and LP allocation and lockup | approval, connection/configuration |
| Creator Network | validate actual net-revenue evidence, reserves, unpaid liabilities and legacy seal before activation | external RPC, connection/configuration, approval |
| Risk Engine | independent trace evidence, verified signer roles and caps | external RPC, connection/configuration, approval |
| Governance | live Safe/Relay roles and signer separation policy, independent review of full candidate | connection/configuration, approval, independent audit |

No current live packet inputs changed. Baseline external blockers remain; the stage 107 guarded reward funding is the independently resolvable code item found in this scope.
