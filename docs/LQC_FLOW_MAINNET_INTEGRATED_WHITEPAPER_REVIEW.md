# LQC Flow + Native Mainnet — 통합 백서 검토본

**MAIN-05 / WP-07-FINAL · 2026-11-08 Asia/Seoul · 최종 로컬 검토 revision**  
**REVIEW DRAFT / NOT APPROVED / NOT FOR MAINNET ACTIVATION**  
**Stage 7 공급량 FAIL / 메인넷 NO-GO 유지**

이 문서는 기존 LQC Flow Canonical drafting source와 이미 작성된 세 백서 검토본을 재사용한 단일 로컬 통합본이다. 기존 원본·공개 후보9개를 대체하거나 수정하지 않는다. Flow의 기술·기능·토큰 정책과 기존 Canonical 20개 장의 구조를 유지하고, 필요한 메인넷 내용을 21–28장으로 통합한다. 최종 검토에서는 이 로컬 통합본의 상태 표현과 설명만 보완했으며 Canonical 원본은 변경하지 않았다. 별도의 새 경제정책이나 백서 계열을 만들지 않는다. 원문 재사용을 위해 1–20장은 영어, 추가 설명은 한국어를 사용한다. 공식 발행용 번역·편집은 수행하지 않았다.

Canonical Whitepaper는 **drafting source**이며 실제 제공되지 않은 Flow Whitepaper v5.6 공식 PDF와 동일하다고 단정하지 않는다. 1–20장의 “currently”, “confirmed”, 과거 날짜와 상태는 해당 보존 원문 시점의 기록이다. 이번에 새로 실행·배포·RPC 검증한 결과가 아니다. 운영 상태는 26장의 증거 구분과 제한을 함께 읽어야 한다. Native 내용은 기존 Flow 구조의 확장 설계이며 BSC-first 전략이나 독립 회계 경계를 폐기하지 않는다.

정책 기준은 Canonical Tokenomics V1.5의 전역 최대10억 LQC·기존 배정·지급 제한이다. 자동 인플레이션0%는 native 설계 목표이며 공식 정책 승인·운영 반영 완료가 아니다. 초기 BSC 발행과 native 시험 블록 기록, 산술 재현, fixture 테스트를 구분한다. 문서 작성은 코드·Genesis 변경, PR 실행, 통화정책 확정 또는 메인넷 운영 승인이 아니다.

## 목차

1. Executive Summary
2. Architecture Principles
3. LQC Flow and Router 2.0
4. Vault and Liquidity
5. Oracle Foundation
6. Lending Risk Engine
7. Lending Supply Earn and LQC Staking
8. Futures / Perpetuals
9. Intent and Internal Solver
10. Solver Network
11. Settlement and Cross-chain
12. Unified Risk, Treasury and Governance
13. LQC Utility and Fees
14. Canonical Tokenomics — V1.5 issuance recorded
15. Development and Evidence Status
16. Security and Audit
17. CEX Readiness
18. Master Development Sequence
19. Future Launchpad and Creator Network — Technical Design (Planned)
20. Current scope boundary
21. Cosmos EVM 자체 메인넷 구조와 Flow 연결
22. Native LQC·gas·검증자와 네트워크 식별
23. 전역 고정 공급과 자동 인플레이션0% 설계
24. BSC/native 이전·예약·역방향 상환
25. Validator 기존 예산과 전체 bank·모듈 회계
26. 실제 개발 상태·제한 검증·기존 FAIL
27. 남은 개발·검증 계획과 정책 결정
28. 출처·통합 범위·검토 이력

---

## 1. Executive Summary

LQC is a **Liquidity & Execution Ecosystem** designed to connect fragmented liquidity and execution across decentralized markets and blockchain ecosystems.

The target stack is:

**LQC Flow → Router 2.0 / Best Execution → Vault / Liquidity → Oracle Foundation → Lending / Earn / LQC Staking + Futures → Intent / Internal Solver → Solver Network → Settlement / Execution Verification → Unified Risk / Treasury / Governance → Full BSC Integration → Security / Audit → CEX Readiness → Public Pilot → future LQC Mainnet**

LQC is developed BSC-first while keeping Core accounting and execution logic portable toward a future independent LQC Mainnet.

## 2. Architecture Principles

### 2.1 One ecosystem, isolated failure domains

Lending, Futures, Router, Vault, Intent/Solver, Settlement, Oracle, Risk, Treasury, and Governance form one ecosystem but remain independently testable accounting and failure domains. Futures does not mutate Lending Core accounting and Lending does not depend on Futures state. Shared functionality is consumed through reviewed interfaces and integration gates.

### 2.2 Chain-neutral Core and adapters

Chain IDs, RPC endpoints, gas assets, DEX addresses, oracle addresses, bridge providers, and deployment addresses are configuration/registry inputs rather than universal Core assumptions. BSC-specific integrations such as PancakeSwap remain behind adapters.

### 2.3 Mainnet portability

Migration is phased:

**BSC validation → capped pilot → LQC Mainnet testnet → audited BSC/LQC parallel operation → governance-approved migration**

BSC may remain an active liquidity domain after a future LQC Mainnet launch.

## 3. LQC Flow and Router 2.0

LQC Flow is the direct non-custodial user-facing execution application. Router 2.0 evaluates approved liquidity venues and may compare price, liquidity, fees, gas, slippage, price impact, minimum output, deadline, and final net output.

The Router architecture includes DEX Registry, approved adapters, Quote Router, Execution Router, Split Optimizer, Gas Cost Oracle, Risk Registry, emergency controls, Best Execution Proof, and proof-bound execution components.

Release credit requires current integration evidence; historical client/SDK proof enforcement alone is not sufficient for final on-chain proof-enforcement claims.

## 4. Vault and Liquidity

Vault infrastructure provides bounded deposit/withdraw accounting, share accounting, caps, strategy-adapter boundaries, recall/shutdown controls, and Router/Risk integration. Chain-specific strategies remain adapters rather than Core assumptions.

## 5. Oracle Foundation

Oracle infrastructure is shared through reviewed interfaces while each consuming module retains explicit risk boundaries. Lending fails closed on invalid, stale, incomplete, or excessively divergent prices. A shallow LQC pool is not sufficient as the sole Lending oracle.

The controlled Lending testnet configuration currently records a one-hour maximum staleness and 2% maximum primary/secondary deviation. These are pilot configuration values, not universal permanent parameters.

## 6. Lending Risk Engine

Liquidation is based on account solvency and **Health Factor**, not a fixed percentage decline in token price.

**Health Factor = (Collateral Value × Liquidation Threshold) / Debt Value**

- HF > 1: not liquidatable.
- HF = 1: liquidation boundary.
- HF < 1: liquidation may execute subject to protocol controls.

Protocol Maximum-LTV hard ceiling: **50%**.

Initial controlled BSC pilot candidate:
- Maximum LTV: **50%**
- Liquidation threshold: **70%**
- Maximum liquidation bonus: **5%**

These values are not universal for every collateral asset. Governance may configure stricter asset-specific parameters after volatility, liquidity, oracle-quality, and liquidation-depth review.

Partial liquidation is preferred. The current implementation caps one liquidation at up to 50% of outstanding debt. Residual debt after collateral exhaustion is recorded as bad debt and handled through explicit reserve, recapitalization, or bounded-loss controls.

## 7. Lending Supply Earn and LQC Staking

### 7.1 Supply Earn

Approved Lending suppliers may earn variable yield derived from actual borrower interest after utilization, reserve factor, losses, and applicable protocol parameters. No fixed or guaranteed APY is promised.

### 7.2 LQC Staking Vault

LQC Staking is a separate vault/accounting module, not an embedded Lending Core balance. Staked LQC is not silently rehypothecated into Lending and does not conceal Lending losses.

Staking includes explicit reward accounting/claim, lock, cooldown, unstake, emergency pause, and governance controls.

Token-denominated rewards must reconcile to the fixed LQC supply and an approved existing allocation. Protocol-revenue-funded rewards are separately accounted and are not guaranteed yield.

### 7.3 Shared Staking Utility for Lending/Earn and Future Launchpad

LQC uses one canonical Staking Vault rather than creating separate staking pools for Lending/Earn and Launchpad. The Staking Vault is developed first as part of the Lending/Earn stage, but it remains an independent Core utility that can later be consumed by other approved ecosystem modules.

For a future LQC Launchpad, staking principal remains in the canonical LQC Staking Vault. Launchpad contracts must not create a second staking custody domain merely to determine allocation eligibility. Instead, an approved read-only/versioned staking interface may expose bounded data such as staked balance, lock duration, staking weight, and snapshot state for Launchpad tier or allocation calculations.

Launchpad integration must not:
- transfer or rehypothecate staking principal;
- mutate Lending Core accounting;
- mutate staking reward accounting;
- treat Launchpad eligibility as an additional reward emission;
- bypass staking cooldown, withdrawal, governance, or emergency controls.

This design allows one LQC stake to provide multiple reviewed utilities over time, including staking rewards, future Launchpad eligibility, and potential governance utility, without requiring the user to lock the same LQC in multiple protocol-specific staking pools.

Development timing is dependency-based: the canonical Staking Vault, reward accounting, lock/cooldown, governance controls, and Lending/Earn/Staking E2E must be completed before Launchpad-specific integration; this sequence is not a claim that these gates have already passed. Launchpad-specific staking integration is added only when the Launchpad workstream becomes active and after the staking interface is stable and reviewed.

### 7.4 Future Safety / Insurance Staking

Safety/Insurance Staking is post-pilot scope and requires separate economic simulation, slashing/loss rules, independent audit, legal review, user disclosure, and governance approval.

## 8. Futures / Perpetuals

The Futures architecture connects to the LQC ecosystem through reviewed Oracle, Vault/Risk, and execution interfaces while preserving its own accounting and failure domain. Recorded BSC testnet evidence does not establish completed native-mainnet integration.

Repository evidence includes Futures Registry, Vault, Oracle, Perp Engine, position/order/funding/leverage/liquidation/insurance/ADL/emergency-control test coverage and controlled BSC Testnet deployment/evidence. Production readiness and independent audit are not claimed.

## 9. Intent and Internal Solver

Users may express execution requirements as signed intents. The architecture includes IntentHub, replay/expiry controls, Source Escrow, Solver binding, Internal Solver, Router execution, and Execution Receipt.

Repository same-chain E2E evidence is distinct from production or cross-chain completion.

## 10. Solver Network

The planned/open Solver layer includes SolverRegistry, SolverBond, exposure/capacity controls, quote competition, risk-adjusted Best Execution, and reputation. Implemented foundations are retained, while missing official gates such as final QuoteManager/bond-policy requirements must be closed before completion credit.

## 11. Settlement and Cross-chain

LQC does **not** embed a proprietary bridge as its Core cross-chain architecture.

Cross-chain expansion follows:

**Intent → Solver Competition → Settlement → Execution Verification → reviewed Bridge Adapter Registry**

Settlement evidence must bind the user intent, selected execution, receipt/proof, finality, replay/tamper protection, and reorg/failure handling. Bridge providers remain replaceable reviewed adapters.

## 12. Unified Risk, Treasury and Governance

Governance uses role separation, multisignature controls, timelocks where applicable, market/route caps, and emergency controls. A module-specific failure should not automatically stop unrelated healthy modules; a validated shared dependency failure may trigger coordinated Risk/Governance controls.

No single private key should control token supply, treasury, oracle, routing, burn, and emergency privileges.

## 13. LQC Utility and Fees

Approved utility direction includes Lending loan-origination and repayment fee settlement in LQC with protocol burn, subject to final implementation, economic analysis, legal review, governance approval, and on-chain verification.

Additional utility includes the separately accounted LQC Staking Vault. The same canonical staking state may later support reviewed ecosystem functions such as Launchpad tier/allocation eligibility and governance utility through versioned interfaces, without creating duplicate staking custody or duplicate reward accounting.

## 14. Canonical Tokenomics — V1.5 issuance recorded

BSC mainnet (chain ID 56) initial issuance is recorded as confirmed on **2026-10-24** in [Canonical Tokenomics V1.5](https://github.com/LQC-labs/LQC-Liquidity-chain/blob/8db16368b3e09a94bfd500a17e33e3e9ef62ed51/docs/CANONICAL_TOKENOMICS.md). The token contract is `0x6d6e197376195c7369C3c5F65e3685629F59025a`; issuance transaction `0x0172ef5f6855bf6f80fd19a7f9539f7a745088d7dec253f6d388ff65d4b89ce3`, block **129416178**. Exactly **1,000,000,000 LQC** was initially allocated to nine management Safe wallets. This records preserved verification evidence, not a new RPC check or a claim about current balances.

Fixed initial and maximum issuance is **1,000,000,000 LQC**, with no post-deployment discretionary mint capability on BSC. Holder-authorized burning may reduce supply. Token name and decimals require deployed-getter evidence before public metadata is finalized.

The **planned TGE public-release budget** is **up to 143,800,000 LQC (14.38% of initial supply)**: Community 80M + Existing Investors 3.8M + Liquidity 60M. It is **not confirmed circulating supply or measured transferable inventory**. The TGE reference time is **2027-02-01 09:00 KST**. Beneficiary distributions, Community 320M registration/funding, actual circulating supply, audit, CEX listing and native-mainnet migration are separate and are not claimed complete.

| Allocation | Designated wallet name | Share | Total LQC | Planned TGE release cap | Post-TGE plan |
|---|---|---:|---:|---:|---|
| Community | LQC Community Wallet | 40% | 400,000,000 | 80,000,000 | 320M capped monthly over 120 months; initial 80M subject to actual recipient distribution |
| Team & contributors | LQC Team Wallet | 20% | 200,000,000 | 0 | 12-month lock, 36 monthly vesting releases in months 13–48 |
| Existing investors | LQC Investor Wallet | 3.8% | 38,000,000 | 3,800,000 | 3-month lock, 24 monthly releases in months 4–27; existing contracts subject to legal validation |
| Liquidity & market making | LQC Liquidity Wallet | 8% | 80,000,000 | 60,000,000 | Remaining 20M subject to approved venue/liquidity mandates |
| Treasury & operations | LQC Treasury Wallet | 8.2% | 82,000,000 | 0 | Approved and disclosed operating budgets |
| Validators & staking | LQC Validator Wallet | 10% | 100,000,000 | 0 | Locked pending native-mainnet activation/settlement evidence; manual Safe-approved payouts for 10 years, capped at 10M per year, 2.5M per quarter, 100M lifetime |
| Ecosystem development | LQC Ecosystem Wallet | 5% | 50,000,000 | 0 | Milestone-driven ecosystem grants |
| Security & risk reserve | LQC Security Wallet | 3% | 30,000,000 | 0 | Multisig-approved security use; not LQUSD backing |
| Mainnet activation | LQC Mainnet Wallet | 2% | 20,000,000 | 0 | Stage-based use after mainnet launch; indicative 24 months |
| **TOTAL** | **9 allocation wallets** | **100%** | **1,000,000,000** | **143,800,000** | |

Community remaining 320M: 120 monthly capped programs; registration and exact funding must precede TGE and were not verified complete at issuance. Team 200M: 12-month lock, then 36 monthly releases in months 13–48. Investor remaining 34.2M: 3-month lock, then 24 monthly releases of 1.425M in months 4–27, subject to legal validation. Validator 100M remains locked pending native-mainnet activation and validated supply/settlement rules: manual 2-of-3 Safe-approved payments to registered operators, over 10 years, capped at 10M/year, 2.5M/quarter and 100M lifetime; activation/calendar/carryover/native-settlement rules remain unresolved.

**Native-mainnet portability:** the global issuance cap must be conserved across BSC and any future native representation. Migration requires provable burn or irrevocable custody/lock and audited 1:1 destination accounting; it is not an implemented bridge or finalized redemption policy. Validator rewards use pre-allocated budget without inflation. The Security reserve is not LQUSD backing.

The nine Safe allocations establish management inventory at the recorded verification block, not beneficial ownership, independent signer control, completed operational vesting or circulation. Current source/ABI, wallet permissions, beneficiary rights and circulation must be verified separately.

**Supersession history:** the former six-category/150M/15% plan and V1.4 pre-issuance statements are historical. This review uses Canonical Tokenomics V1.5 as the specified economic baseline; its merge/publication history is not newly verified here. Preserve historical evidence.

## 15. Development and Evidence Status

Status terms are evidence-specific:

- **Implemented** — source exists.
- **Unit Tested** — focused tests exist and pass at the pinned revision.
- **Integration Tested** — module interaction is reproducibly tested.
- **Testnet Verified** — relevant chain evidence has been independently reconciled.
- **Security Verified** — applicable internal security gates and independent audit requirements are satisfied.
- **Release Ready** — all required technical, operational, legal, and evidence gates for the release scope are complete.

A lower status never implies a higher status.

## 16. Security and Audit

Target controls include independent smart-contract audit, remediation/retest, multisig, timelock, role separation, emergency pause, controlled TVL/debt/route limits, monitoring, incident response, vesting disclosure, supply reconciliation, and reproducible on-chain evidence.

Repository security tests and audit-preparation documents are not a claim that an independent audit has already been completed.

## 17. CEX Readiness

CEX readiness is developed continuously rather than added after engineering completion. Before submission, the whitepaper, website, token contract, vesting contracts, allocation register, circulating-supply methodology, staking reward budget, market-making inventory, legal/KYB package, audit evidence, and exchange application must be mutually consistent.

Technical artifacts are pinned to commits; on-chain artifacts are pinned to network and verifiable transaction/block evidence.

## 18. Master Development Sequence

1. Architecture Freeze
2. LQC Flow
3. Router 2.0 / Best Execution
4. Vault / Liquidity
5. Oracle Foundation
6. Lending / Earn / LQC Staking
7. Futures
8. Intent / Internal Solver
9. Solver Network
10. Settlement / Execution Verification
11. Unified Risk / Treasury / Governance
12. Full BSC Testnet Integration
13. Security / Independent Audit
14. Token / CEX Readiness
15. Capped Public Pilot / LQC Mainnet Path

## 19. Future Launchpad and Creator Network — Technical Design (Planned)

The future LQC Launchpad is a separately gated application module for reviewed project configuration, isolated contribution escrow, deterministic allocation, mutually exclusive settlement/refund outcomes, vesting/claim and bounded liquidity-bootstrap adapters. Project-specific accounting, access controls, pause behavior, refund rights and external interface authorization require independent test and review evidence before any activation.

The future Creator Network is a separate off-chain workspace for creator profiles, technical project research, content indexing, revision and moderation decisions, and verified collaboration records. It does not inherit Launchpad custody or protocol administrative privileges. Account data, private evidence and authentication secrets must remain outside public repositories and public site artifacts.

The proposed interfaces and security invariants are described in [Whitepaper v5.4 Launchpad Technical Review Annex](https://github.com/LQC-labs/LQC-Liquidity-chain/blob/8db16368b3e09a94bfd500a17e33e3e9ef62ed51/docs/whitepaper/LQC_WHITEPAPER_V54_LAUNCHPAD_CREATOR_REVIEW.md). That annex is a technical design proposal, not a deployed contract, active service or completed audit. Existing LQC Master Development Sequence 1–15 retains priority. No new LQC token issuance or change to Canonical Tokenomics V1.5 is authorized by this proposal.

## 20. Current scope boundary

The project does not claim production readiness, completed independent audit, CEX listing, regulator approval, or a launched LQC Mainnet merely because repository code or testnet evidence exists.

The Canonical drafting source describes a November 1, 2026 PDF update reconciling tokenomics and recorded issuance while preserving the September v5.3 technical baseline. This review has not independently compared that PDF or the official v5.6 PDF. Other architecture/status sections are not newly validated; broader reconciliation against the Architecture Freeze Implementation Matrix and Conflict Register remains separate.

## 21. Cosmos EVM 자체 메인넷 구조와 Flow 연결

**상태: 기존 소스 설명 + 개발 목표. 운영 체인 출시 주장 아님.** [T §2·4·15], [E §3–4·7].

LQC Flow와 native mainnet은 동일 LQC 개발 프로젝트의 애플리케이션 영역과 체인 영역이다. Flow는 Router·Vault·Oracle·Lending·Futures·Intent/Solver·Settlement를 제공하는 구조를 유지하고, 자체 체인은 합의·상태 전이·가스·validator 보안·native 자산 회계를 담당한다. 기존 BSC 배포·유동성·오라클·권한이 EVM 호환성만으로 native에서 검증 완료되는 것은 아니다.

기존 BSC-first와 phased migration 방향(2장), chain-neutral Core·adapter 경계, 모듈별 실패 격리를 유지한다. BSC는 향후에도 유동성 도메인으로 남을 수 있다. 계약 이전에는 chain ID·자산 주소·gas asset·registry·Oracle·권한·서명 도메인·상태 정산을 별도 검증해야 한다. IBC는 기술 스택 방향이며 실제 연결 채널이나 bridge 운영 완료를 뜻하지 않는다.

### 21.1 보존 기술 스택

| 구분 | 확인된 로컬 검증 기준 | 운영 결정 여부 |
|---|---|---|
| Cosmos SDK | v0.54.3 | mainnet 최종 선택 아님 |
| Cosmos EVM library | `github.com/cosmos/evm v0.7.3` | 호환성·보안 검토 필요 |
| evmd app module | `github.com/cosmos/evm/evmd v0.0.0-20260903174530-c3ae9067a7ea` | EVM library와 별도 pin |
| CometBFT | v0.39.3 | 다중 검증자 운영 검증 필요 |
| Go | 로컬 도구에서 1.25.9 linux/amd64 기록 | release toolchain 별도 고정 필요 |

로컬 작업 경로 대신 출처 ID를 사용한다. Flow 기준 커밋은 `8db16368b3e09a94bfd500a17e33e3e9ef62ed51`, Mainnet 원격의 과거 관측 커밋은 `3f8750b29a823e9f9a828132fa502c99614ee0e5`다. 로컬 Stage7 구현·복원 HEAD `b79394246a8819a7651275bd07c88b83bccdd8df`와 서로 다르다. 로컬 구현이 이 원격 커밋에 이미 공개됐다고 주장하지 않는다. 현재 원격 HEAD를 조회하지 않았다.

### 21.2 app과 consensus 경계

기존 `app.New`는 DB/home을 받아 SDK 모듈·keeper·store를 구성한다. `OpenMVP`는 준비된 home·Genesis·consensus key 연결을 검사하고 영속 app을 연다. 별도 `Start`가 Comet handshake와 consensus를 시작한다. Open 성공, InitChain 성공, 새 블록 생성은 각각 다른 증거다. MemDB 사용도 Upgrade Keeper의 home/data 파일 의존성을 없애지 않는다. 기존 정상 SDK·production 경로를 우회한다는 설계는 채택하지 않는다.



### 21.3 Flow 기능과 native 연결 범위

| 기능 | 보존하는 기능·회계 | native 연결과 현재 한계 |
|---|---|---|
| DEX / Router | venue 비교·승인 adapter·best execution | native chain 설정·배포·유동성·gas와 proof enforcement의 재검증 필요 |
| Lending | HF·LTV·담보/부채·부분 청산·bad debt | native 자산/Oracle/시장별 위험 검증 필요; BSC pilot 수치 자동 적용 아님 |
| Futures | 포지션·funding·청산·보험·ADL 독립 장부 | 기존 제한 BSC testnet 기록과 native 배포/통합은 별개 |
| Staking | canonical Flow Vault·reward/lock/cooldown | native consensus staking과 원금·보상·권리 분리; 자동 변환 없음 |
| Launchpad | 향후 escrow·allocation·refund·vesting 설계 | 안정된 staking read-only 인터페이스가 선행; 배포 완료 주장 없음 |
| Oracle | freshness·divergence·위험 경계 | native 가격원·가용성·담보 적격성 검증 필요 |
| Intent / Solver | 서명 intent·replay/expiry·실행 receipt | native 서명 도메인·registry·settlement/finality 검증 필요; bridge/역상환 미완료 |

위 연결은 기능별 개발 경계를 설명한다. 기존 Flow의 source·BSC testnet 기록은 그 원문 범위에서만 인정하며 이 표로 모든 기능의 현재 구현·테스트 완료를 일괄 선언하지 않는다.
## 22. Native LQC·gas·검증자와 네트워크 식별

**상태: Devnet 값은 보존 검증 기준, 운영 값은 미확정.** [T §3·9], [E §6·8·13].

| 항목 | 제한 Devnet 값 |
|---|---|
| Cosmos chain ID | `lqc-devnet-test-1` |
| EVM chain ID | **917001** |
| EVM ID hex | **0xdfe09** |
| base/display denom | atest / test |
| 단위 | 10^18 atest = 1 test |
| 테스트 공급 | 100 test |
| 계정 prefix | lqctest |

Native LQC는 향후 체인의 gas 지불과 staking·validator 보안에 쓰려는 방향이다. 이는 실제 mainnet의 denom·decimals·chain ID 또는 fee model을 확정하는 문장이 아니다. `atest/test`는 실제 LQC 상환권이 없는 독립 시험 자산이며100 test를 실제10억 LQC 배정으로 보지 않는다. BSC 토큰의 token name·decimals도 배포 getter 근거가 필요한 기존 조건을 유지한다.

거래 gas 계량·기본 수수료·최소 fee·fee market·수수료 분배·burn 비율·treasury 몫은 별도 구현/경제 검증과 정책 결정 대상이다. Flow/Lending fee의 조건부 LQC 결제·소각 방향을 native gas burn 규칙으로 전용하지 않는다. fee 징수는 기존 자산 이전이며 자동 신규 발행과 다르다.

단일 validator·bond1 test·voting power1은 기존 제한 관측이다. 운영 validator 수·분산성·선출·최소 self-bond·commission·delegation/unbonding·slashing·복구 정책을 입증하지 않는다. SDK 기본값을 승인된 LQC 운영 정책으로 간주하지 않는다. 저장 signing state·consensus identity·이중 서명 방지와 signer 분리가 후속 검증 대상이다.

Flow Staking Vault와 native consensus staking은 독립 장부다. Flow 원금·reward claim·lock/cooldown/unstake 권리는 native delegation·bonded/not-bonded pool·slashing 권리와 자동 연결되지 않는다. 같은 stake의 Launchpad read-only utility(7장)도 consensus voting power나 추가 보상 예산을 만들지 않는다.


## 23. 전역 고정 공급과 자동 인플레이션0% 설계

**상태: Canonical 한도 유지 + 명시적 테스트 프로필 제안. 운영 설정 반영 아님.** [C-T], [M §4·6–8], [T §5–8].

14장의1,000,000,000 LQC는 BSC와 native 각각에 부여하는 별개 한도가 아니라 중복 제거된 전역 경제적 공급 상한이다. 이미 BSC에 발행된 배정을 native Genesis에 추가로 반복해서는 안 된다. holder-authorized 영구 소각의 효과를 임의 재발행으로 복구하지 않는다. 공급량·유통량·예산·이전 예약은 서로 다르다.

### 23.1 기존 초안의 zero-Mint 방향

블록 생성만으로 신규 LQC를 발행하는 SDK 기본 인플레이션은 현재 목표와 충돌한다. 제안 목표는 `inflation=0`, `inflation_min=0`, `inflation_max=0`, `inflation_rate_change=0` 및 초기 `annual_provisions=0`이다. 기존 Validator 예산의 이전·지급은 신규 발행과 별도다.

SDK v0.54.3의 일반 Mint validation은 이 0 값 조합을 허용한다. 하지만 일반 validation은 LQC의 고정 공급 정책 자체를 강제하지 않는다. governance, 업그레이드, 직접 MintCoins, Genesis import 등의 경로는 별도 통제·관측이 필요하다. 문서상의 0% 선언만으로 우회 발행이 불가능해지는 것은 아니다.

### 23.2 테스트 자산에만 적용하는 opt-in 프로필

프로필 ID는 `stage7-fixed-supply-test-v1`이며 기존 기본 Genesis·MVP 경로를 자동 변경하지 않는다. Mint denom은 `atest`, minter.inflation·annual_provisions와 params.inflation_min·inflation_max·inflation_rate_change는 모두0을 목표로 한다. 유효한 기존 goal_bonded0.67·blocks_per_year6,311,520은 유지한다. max_supply는 보조 한도 `100000000000000000000 atest`를 제안한다. nil은 명시적0과 다르다.

기존 테스트 공급100 test의30/20/50에서1 test bond 후 계정29/20/50·bonded pool1이 된다. bond를 추가 예산으로 더하지 않는다. 실제 mainnet Genesis는 이 숫자를10억으로 바꿔 만들 수 없고 BSC 이전·backing·예약·vesting 정산이 선행되어야 한다. typed helper는 기존 서명·funding·validator 검증을 대체하지 않는다. 이번 문서 작업에서는 Genesis를 생성·수정하지 않았다.

### 23.3 MaxSupply의 한계와 별도 발행 경로

SDK Mint MaxSupply는 해당 MintDenom의 base-unit 정수다. 0은 무제한이며 DefaultMintFn 내 발행량 제한으로 작동한다. 전 체인 경제적 공급, 다른 denom, 직접 bank MintCoins, Genesis 입력을 포괄하는 전역 안전장치가 아니다. 이미 초과한 공급을 되돌리지 않는다.

일반 authority 기반 UpdateParams는 Mint 값과 한도를 변경할 수 있다. bank minter 권한, EVM/ERC20 변환, IBC voucher, 업그레이드·import도 별도 추적해야 한다. 모든 변환이 native LQC 발행이라는 뜻은 아니므로 실제 denom·토큰 pair를 식별한다. 권한 제한과 업그레이드 정책은 공식 승인 전 미확정이다. MaxSupply는 보조 방어로만 사용한다.

기존 기술 초안의 Mint 호출 설명은 FinalizeBlock→BeginBlock→module manager→Mint BeginBlocker→DefaultMintFn→bank MintCoins다. 빈 블록도 기본 경로를 거친다. 기본 SDK inflation과 정수 절사는 기존 증가분의 산술 설명이며 LQC 정책 적합성 승인이 아니다. x/mint zero만으로 bank 권한·EVM/ERC20 변환·IBC voucher·Genesis/import·governance/upgrade의 우회 경로 안전성이 모두 증명되지는 않는다. 자산/denom별로 실제 순증과 표현 변환을 구분해야 한다.


## 24. BSC/native 이전·예약·역방향 상환

**상태: 공급 보존 검토 모델. 구현된 bridge·확정 상환 정책 아님.** [C-T], [M §9–10], [T §11].

아래는 **정방향 BSC→native 이전의 검토용 모형**이다. 구현된 브리지나 승인된 양방향 상환 정책이 아니다. 모든 변수는 같은 단위·자산·확정 기준 시점으로 증명한다.

| 변수 | 의미 |
|---|---|
| C | 1,000,000,000 LQC 기준 한도 |
| B | Safe·vesting 포함 현재 BSC 총 공급 |
| L | native backing 전용으로 유효하게 묶인 BSC 잠금 |
| D_mig | 누적 승인 이전 소각 |
| D_Bperm / D_Nperm | 재발행 불가 일반 영구 소각, 체인별 |
| I | Genesis 포함 누적 native 이전 발행, native 소각 후에도 감소하지 않음 |
| R | 아직 발행하지 않은 유효 예약 청구량 |
| N | native 잔존 공급, N = I − D_Nperm |

단순화한 전체 공급을 대상으로 `B = C − D_Bperm − D_mig`, `I + R ≤ D_mig + L`, `0 ≤ L ≤ B`를 요구한다. 경제적 중복 제거 공급 `E = B − L + N`에 대해 `E + R ≤ C − D_Bperm − D_Nperm ≤ C`가 성립해야 한다. 모든 값은 음수가 아니며 `D_Nperm ≤ I`다. 다른 출처 native 발행이 있으면 이 모형을 만족했다고 선언할 수 없다.

다음 예시는 별도 영구 소각·기존 이전·예약이 없는 최초 상태에서 각각 시작하고 수량 단위를 LQC로 통일한다. 예를 들어 이전 소각 100과 native 발행 100이면 E=C다. 전용 잠금 100과 native 발행 100도 E=C다. 이후 native 영구 소각 5이면 E=C−5이고 I는 그대로여서 소각한 5를 다시 발행할 수 없다. 잠금 100, 발행 50, 예약 50이면 E=C−50, E+R=C다. 일반 vesting 잠금은 L에 넣지 않는다.

### 24.1 증거와 중복 방지

청구 증거는 source/destination chain·자산 ID, 수량·단위, 수취인, transaction/log 위치, finality, 승인 정책 버전에 연결해야 한다. 서로 다른 claim ID로 같은 원본 증거를 재사용할 수 없어야 한다. 일반 holder burn을 임의로 migration burn으로 재분류해 발행권을 만들지 않는다.

제안 상태는 관측→확정→예약→발행→정산이며 거절·취소·실패 상태를 별도 기록한다. 발행과 예약 차감의 원자성, reorg 대응, 중복 처리 방지, 승인자 독립성은 구현·검증 전제다. L은 대응 native 권리가 살아 있는 동안 해제할 수 없다. 역방향 상환·잠금 해제는 별도 상태 기계와 정책 승인이 필요하다.

입력 증거가 없거나 서로 다른 높이의 장부를 근거 없이 합치면 UNKNOWN/BLOCKED다. proof format·finality depth·보관 책임·상환권·법적 청구권은 본 문서에서 확정하지 않는다.

WP-06-R1 / MAIN-05 범위 명시: 이 모형은 단순한 정방향 이전 검토에 한정한다. 복수 wrapper/IBC 표현·다중 bridge·역방향 상환과 lock release를 지원한다고 간주할 수 없으며 해당 발행·해제 실행 권한도 없다. 누적 burn credit은 원본 증거와 분류가 보존되어야 하고 lock credit은 대응 권리가 있는 동안 backing에서 빠질 수 없다. 그러나 미사용 credit의 소유·양도·만료·예약 취소·reorg 후 복구·권리 소멸 방식은 승인되지 않았다. 이 수명주기·취소 규칙을 임의 확정하지 않고 UNKNOWN/BLOCKED 항목으로 유지한다.


## 25. Validator 기존 예산과 전체 bank·모듈 회계

**상태: Canonical 지급 제한 유지 + 관측 설계. 지급 개시 아님.** [C-T], [M §11·14], [E §12–14].

Validator100M은 신규 발행이 아닌14장의 기존 배정이다. 공식 native-mainnet 활성화 및 검증된 BSC/native 공급 보존·정산 규칙 전까지 잠금을 유지한다. 등록 운영자에 대한 수동 Validator Safe2-of-3 승인 지급만 가능하며10년·연10M·분기2.5M·누적100M 상한을 유지한다. 활성화 증거/시점·달력·carryover·native 정산·year10 잔여 처리가 미확정인 동안 지급 권한을 열지 않는다. 운영비나 수수료 부족을 이유로 자동 inflation을 재개하는 정책도 만들지 않는다.

예산 보관→등록 운영자/기간/중복 지급 검토→필수 승인→승인 방식 지급→수취·잔여 대조는 제안된 관측 흐름이다. native 지급 방식·SDK distribution 활용 여부는 미정이다. Available/Reserved/MigrationInFlight는 중복되지 않게 정의해야 할 미지급 원금 분류이고 Paid는 별도 누적 이력이다. Returned를 잔액과 다시 합산하거나 임의로 누적 지급에서 빼지 않는다. 반환 재사용·수수료 부담·소각 귀속은 미확정이며 “별도 처리” 숫자로 차이를 메우지 않는다. 자동 환수·재지급 권한은 부여하지 않는다.

### 25.1 전체 계정과 모듈 장부

높이·app hash·chain ID가 같은 스냅샷에서 모든 denom별 bank supply와 모든 일반·모듈 계정 잔액의 합을 대조한다. fee_collector, mint, distribution, bonded pool, not_bonded pool 및 실제 등록된 나머지 모듈 계정을 빠짐없이 포함한다. account와 module 주소 중복도 제거한다.

각 denom에 대해 `Supply(h)=Σ bank balance(address,h)`와 `Supply(h2)−Supply(h1)=Σmint−Σburn`을 독립 검증한다. 수수료·모듈 내부 이동·bond 이동은 mint로 세지 않는다. 발행·소각은 실제 실행 경로와 증거를 통해 수집하며 supply 차이에서 역산한 숫자를 독립 증거라고 부르지 않는다.

distribution DecCoins의 outstanding rewards·commission·community pool 등 부채·소수 장부는 bank 잔액과 분리한다. 같은 자산을 이중 합산하지 않되 보유액과 지급 의무의 일치·반올림 잔여도 검토한다. 페이지 누락, denom 불명, 모듈 미관측, mint/burn 증거 미수집은 0이 아니라 UNKNOWN/BLOCKED다.

전역 회계는 이 native bank 회계에 BSC 확정 증거·전용 잠금·누적 이전·예약을 추가해야 한다. 로컬 fixture는 실제 체인 입력의 완전성을 증명하지 않는다.


## 26. 실제 개발 상태·제한 검증·기존 FAIL

**상태: 기존 증거 기록의 재사용. 이번 신규 실행 결과 없음.** [E §15], [T §16], [M §16], [TOOLS], [FAIL].

| 증거 | 결과 | 범위 |
|---|---|---|
| strict no-disk constructor | 과거 BLOCKED | Upgrade Keeper의 home/data 의존 |
| TEMP_HOME + MemDB InitChain | 제한 PASS | 실제 서명과 높이 0 상태 |
| 영속 OpenMVP + 블록 | 0→2, 정상 Close·동일 DB 재개방 | 공급량 증가로 **FAIL** |
| 높이 2 supply | 100.000004119452422666 test | 기대 100 test와 불일치 |
| 높이 2 계정·pool·power | 29/20/50 test, bonded 1 test, power 1 | 추가 발행 모듈 잔액 전수 증거는 미보존 |
| 고정 공급 도구 | 최상위 17개·말단 122개 통과 기록 | SDK arithmetic/validation·fake/fixture만 |
| fixed-profile 실제 node | 미실행 | 블록·재시작·timeout PASS 없음 |


| 개발 상태 | 이번 문서에서 인정하는 범위 |
|---|---|
| 구현 확인 | 기존 제한 app/OpenMVP 경로와 테스트 전용 helper·관측기·감독자 소스 기록; 제품 전체 완료 아님 |
| 테스트 완료 기록 | TEMP_HOME InitChain 제한 PASS와 도구 정적/122개 말단 fixture 단위 검증; 이번 재실행 없음 |
| 개발·검증 진행 중 | fixed-profile 실제 실행 연결, 전체 snapshot/event collector와 실환경 감독 adapter; 완료 증거 없음 |
| 향후 계획·미확정 | consensus 재시작·timeout·다중 validator·native Flow 통합·migration/역상환·정책 결정 |
**실측 OBS-01:** 초기100 test에서 높이0→2 후 committed bank supply는100.000004119452422666 test였다. 계정29/20/50 test, bonded pool1 test, validator voting power1이 기록됐다. 증가분은0.000004119452422666 test = 4,119,452,422,666 atest다. 계정3개와 bonded pool만 더한100 test는 전체 모듈 회계가 아니며 추가량의 실제 모듈별 잔액 증거가 완비됐다고 보지 않는다.

**산술 재현 CALC-01:** 기존 SDK 산술 호출이 재현한 두 블록2,059,726,029,384와2,059,726,393,282 atest의 합은 위 증가분과 같다. 블록별 Mint 이벤트·Keeper 발행 실행을 직접 관측한 값이 아니다. 원 실행의 runtime Minter·전체 모듈 잔액 전수 증거는 미완료다. 계산 일치가 고정 공급 정책 PASS를 뜻하지 않는다.

**구현/단위 검증:** Mint helper·회계 관측기·감독자는 격리 소스의 `_test.go` 도구다. 최상위17개와 말단122개는 중첩 집계이므로 더하지 않는다. 기존 구현·정적/fixture 단위 검증 범위에서만 PASS 기록이며 프로덕션 runtime adapter나 실노드 공급 보존을 입증하지 않는다. SDK arithmetic/validation과 fake 시간·프로세스·filesystem을 사용했다. 이번에는 이 테스트를 반복하지 않았다.

**미실행/미완료:** zero-Mint 실제 블록, 전체 bank/event 수집 완전성, 동일 DB consensus 재시작 후 추가 블록, 실제 timeout·프로세스 그룹 강제 종료·회수, 다중 validator 보안·운영 검증은 미완료다. 정상 Close 후 DB 재개방·높이2 조회를 consensus 재시작 성공으로 부르지 않는다. bridge·역상환·운영자 예산 지급도 완료로 주장하지 않는다.

**Stage 7 공급량 FAIL / 메인넷 NO-GO 유지.** 기존 FAIL은 새 문서나 추후 새 실행의 부분 성공으로 덮어쓰지 않는다. BSC 발행 기록도 지정 블록의 보존 증거이며 현재 잔액·유통량·beneficiary 지급·감사·상장을 새로 검증한 것이 아니다.


## 27. 남은 개발·검증 계획과 정책 결정

**상태: 향후 계획. 이번 문서 작성으로 실행 승인되지 않음.** [T §12–14·17–19], [M §17–19], [E §16–19].

기존 Flow 개발 순서(18장)를 유지한다. native는 고정 공급 helper를 기존 실제 서명·Genesis 검증에 연결하고, 실제 snapshot/event collector·OS 감독 adapter를 준비한 뒤 별도 승인된 제한 실행으로 검증해야 한다. 기존 테스트 전체를 관행적으로 반복하지 않고 변경 지점·미검증 실행 조건에 필요한 증거를 수집한다.

후속 제한 실행 계획은 새 격리 테스트 Genesis→실제 InitChain→블록 높이 증가→전체 bank/Mint/발행·소각 회계→정상 종료·잠금 해제→같은 DB 상태 비교→consensus 재시작과 추가 블록→별도 timeout/강제 종료→회수·DB 재개방·정리다. 준비·증거·정리를 포함한 전체240초, loopback만 허용, 외부 peer·운영 키·거래·배포 금지, 실패 기록 선보존·허용 root 안 정리를 유지한다. 현재 fake 감독자만으로 실제 OS 종료를 보장한다고 주장하지 않는다.

자동 발행0과 공급100 test의 실제 보존을 검증하되, 명시적으로 승인된 소각 시에는 해당 감소량과 mint/burn 증거가 일치해야 한다. 전체 계정·모듈 inventory 누락이나 서로 다른 높이·hash·denom은 UNKNOWN/BLOCKED다. 실제 입력/안전 조건 부족은 BLOCKED, 관측 불일치·안전 위반은 FAIL이며 모든 요구를 충족한 제한 실행만 PASS다.

미확정 정책은 실제 native chain IDs·denom·decimals·Genesis 경제적 공급 산정, 0% 정책의 최종 공식 승인/변경 통제, validator 선출·unbonding/slashing, gas fee·burn·재원, Validator 활성화/지급 기간·잔여, migration burn/lock·proof/finality·credit 수명·역상환·lock 해제, governance/upgrade·비상 권한이다. 기존 문서에 없는 조건을 추가 확정하지 않는다.

v5.6 공식 PDF와 네이티브 개발 계획서v1.1 승인 검토 원문은 확보된 것으로 가정하지 않는다. 공식 발행 전 원본 대조·정책 정합성·보안 검토·독립 감사·공급 정산·운영 승인 게이트를 따로 닫아야 한다. F03 BLOCKED 및 F07–F10 OPEN의 기존 기록을 유지하며 이를 문서 통합만으로 해결 처리하지 않는다.


## 28. 출처·통합 범위·검토 이력

**MAIN-05 / WP-07-FINAL · 로컬 검토용 출처.** 아래 원본과 증거는 이 문서 작성 시 읽기만 했다. 외부 링크는 보존 식별자를 인용한 것이며 이번 원격 재검증 결과가 아니다. 로컬 증거는 공개 저장소 소스 또는 외부 재현 증거로 표시하지 않는다.

| ID | 기준 자료 | 적용 |
|---|---|---|
| C-W | [Canonical Whitepaper drafting source](https://github.com/LQC-labs/LQC-Liquidity-chain/blob/8db16368b3e09a94bfd500a17e33e3e9ef62ed51/docs/LQC_WHITEPAPER_CANONICAL.md) | 1–20장 기술·정책 기준; 상태·출처 표현과 링크만 최종 보완 |
| C-T | [Canonical Tokenomics V1.5](https://github.com/LQC-labs/LQC-Liquidity-chain/blob/8db16368b3e09a94bfd500a17e33e3e9ef62ed51/docs/CANONICAL_TOKENOMICS.md) | 전역한도·배정·TGE·vesting·Validator 지급 제한 |
| E | 기존 Ecosystem v6.0 검토본 — Internal development reference — not publicly available | 생태계 연결·책임 경계·상태 구분 |
| T | 기존 Mainnet Technical v1.0 검토본 — Internal development reference — not publicly available | 스택·식별자·구조·Devnet 상태·향후 검증 |
| M | 기존 Native Monetary Policy v1.1 검토본 — Internal development reference — not publicly available | zero-Mint·공급 보존 모형·계정 회계; 미승인 제안으로 사용 |
| TOOLS | 고정 공급 도구 기존 결과 — Internal development reference — not publicly available | 제한 구현·정적/122개 단위 검증과 산술 재현; 신규 실행 아님 |
| FAIL | Stage7 Persistence 기존 결과 — Internal development reference — not publicly available | 높이0→2·공급량 증가 FAIL·재시작/timeout 미완료 |

Flow 원문 기준 공개 커밋은 `8db16368b3e09a94bfd500a17e33e3e9ef62ed51`이다. [Canonical 고정 경로](https://github.com/LQC-labs/LQC-Liquidity-chain/blob/8db16368b3e09a94bfd500a17e33e3e9ef62ed51/docs/LQC_WHITEPAPER_CANONICAL.md), [Tokenomics 고정 경로](https://github.com/LQC-labs/LQC-Liquidity-chain/blob/8db16368b3e09a94bfd500a17e33e3e9ef62ed51/docs/CANONICAL_TOKENOMICS.md)는 기존 출처 기록을 승계한다. 현재 커밋/원격 상태를 확인한 것은 아니다. 입력 SHA-256·원문 장별 재사용 대응은 함께 생성한 로컬 검증 기록에 있다.

보존 Canonical의 merged 표현과 Tokenomics change history의 조건부 merge 표현은 승인 이력 원문 대조 전까지 미확정이다. 이 최종본14장은 경제적 V1.5 기준만 채택하고 병합 완료 주장은 하지 않는다.

1–20장의 기존 기술 계획과21–27장의 native 확장은 병행 설명이다. 완료 증거의 기준은15장 상태 정의와26장 제한 상태표다. 기술적으로 설명 가능한 inflation과 정책 적합성은 별개이므로 기존 FAIL을 그대로 유지한다. 상세 native/monetary 초안은 provenance 자료로만 연결하며 독자가 핵심 내용을 이해하기 위해 별도 백서를 모두 읽어야 하는 구조로 두지 않는다.

공개용 반영 후보는 본 통합 문서1개다. 실제 제출 경로와 source link 정리는 사용자의 통합본 확인 후 별도 작업에서 정한다. 내부 검증 기록·개인키·gentx·home·DB·원시 로그·코드·Genesis·workflow는 포함하지 않는다. GitHub 업로드/commit/push/PR/Actions는 실행하지 않았다. 공식 백서 승인·통화정책 확정·메인넷 활성화 승인은 이 통합 작업에 포함되지 않는다.
