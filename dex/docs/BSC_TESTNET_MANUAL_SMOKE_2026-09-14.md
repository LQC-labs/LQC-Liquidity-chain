# BSC Testnet Manual Smoke Test — 2026-09-14

Status: **PASS (minimal Router, partial testnet milestone)**

This record documents a user-observed mobile-wallet smoke test on BSC Testnet chain `97`. It is
testnet evidence only and is not a production-readiness, security-audit, or mainnet claim.

## Tested deployment

- Wallet: `0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB`
- Minimal LQC Flow Router: `0xA3E1fbe94055e7A8971b3994C7025B3c16273a24`
- tLQC: `0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc`
- WBNB: `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`
- Wallet client: TokenPocket mobile DApp browser

## Observed results

| Test | Input | Observed output/state | Result |
|---|---:|---|---|
| Native buy | `0.001 tBNB` | about `18.09094 tLQC`; tLQC balance increased from `993,000` to `993,018.09094` | PASS |
| Token sell | `10 tLQC` | tBNB balance increased and UI reported `매도 거래가 완료되었습니다` | PASS |
| Consecutive native buy | `0.0005 tBNB` | about `8.97828668 tLQC`; tLQC balance updated to about `993,017.06923` after the preceding sell | PASS |
| Approval cancellation recovery | cancelled approval followed by a clean retry | no stuck canonical pending nonce; retry completed | PASS |
| Consecutive token sells | `5 tLQC` each | both later sells completed; final observed tBNB balance about `0.30251` | PASS |
| Mobile gas presentation | explicit buffered preflight gas limit | TokenPocket changed from `0 tBNB` to a non-zero network fee and accepted submission | PASS |
| Status localization | completed buy/sell | localized `매수/매도 거래가 완료되었습니다` rendered without a raw placeholder | PASS |

## Safety observations

- Exact token approvals were used instead of unlimited approval.
- Each action was submitted once and awaited before the next action.
- Canonical latest and pending nonces matched after the cancelled attempt.
- Router execution and UI balances recovered without a forced wallet reset.
- No mainnet asset or production token was used.

## Evidence still to append

- BscScan transaction hashes and canonical block numbers for each successful buy, approval, and sell.
- Final receipt/log reconciliation against expected token transfers.
- Router and adapter zero-custody checks from the post-deployment monitor.

## Scope boundary

This milestone validates the minimal LQC Flow Router buy/sell path and mobile-wallet recovery flow.
PancakeSwap V2/V3 comparison, Router 2.0, split routing, governance roles, emergency drills, and full
deployment monitoring remain separate testnet milestones.
