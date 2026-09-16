# LQC Intent Solver 개발 순서

## 충돌 방지 원칙

- 현재 main의 Router 2.0, Registry, Adapter와 배포 JSON을 수정하지 않는다.
- 신규 계약은 `contracts/intent-v1`에서 시작한다.
- 기존 Bridge 코드는 삭제하지 않고 deprecated 표시 후 신규 모듈과 연결하지 않는다.
- BSC 테스트넷 Same-chain 흐름을 먼저 완성한다.
- 배포 주소 변경은 별도 승인·검증 단계에서만 수행한다.
- `package-lock.json`은 기능 개발로 변경하지 않는다.

## 개발 게이트

| 단계 | 범위 | 완료 기준 |
| --- | --- | --- |
| 0 기준점 | 기존 Router·배포·테스트 보존 | 전체 기존 테스트 통과, 배포 JSON 무변경 |
| 1 Core Intent | IntentHub, SourceEscrow, EIP-712, nonce, deadline | 서명·replay·취소·만료·환불 테스트 통과 |
| 1.5 Execution Quality | 실제 Gas, DEX별 Price Impact, 독립 Quote 재검증 | 실제 calldata `eth_estimateGas`, V2·V3·multi-hop·split 검증, fallback 표시 |
| 2 Internal Solver | Router 2.0을 첫 Solver로 연결 | Same-chain Intent 1회 원자적 실행, 실제 Gas·Price Impact가 결합된 Receipt 검증 |
| 3 Quote Competition | QuoteManager, 서명 Quote, 2개 이상 mock Solver | 최고 유효 위험조정 Quote 결정론적 선택 |
| 4 Solver Risk | Registry, 혼합 Bond, exposure, 인출 지연 | Bond 이하 노출, challenge 중 인출 차단 |
| 5 Best Execution | Proof 고도화, 공개 verifier | 비교 후보·선택 결과·실수령액 재검증 |
| 6 Composite Intent | Router, Vault, Lending Action adapter | Same-chain 복합 실행과 전체 revert |
| 7 Settlement | SettlementHub, challenge, slash | 이중 정산·허위 proof·timeout 공격 차단 |
| 8 Cross-chain MVP | 외부 Bridge adapter 1개, 체인 2개 | 지급·상환·실패 환불 end-to-end 통과 |
| 9 Hardening | MEV·reorg·oracle·bridge 장애 시험 | Critical attack matrix와 회귀시험 통과 |
| 10 Mainnet Gate | 외부감사, bug bounty, caps | Critical·High 해결 후 제한형 활성화 |

## 필수 실행 품질 기준

### 실제 Gas Estimation

- 실제 선택 Route, calldata, Router 주소와 wallet sender로 `eth_estimateGas`를 실행한다.
- 현재 gas price를 적용하고 Gas 비용을 output token 단위로 환산한다.
- 가능하면 복수 RPC 결과를 비교하고 편차가 한도를 넘으면 해당 Quote를 제외한다.
- 고정 gasUnits는 RPC 실패 시 보수적 fallback으로만 사용한다.
- UI와 Receipt에는 `estimated`, `fallback`, `confidence`를 구분해 기록한다.

### DEX별 Price Impact

- LQC Flow와 V2는 reserve와 AMM 수식으로 계산한다.
- V3는 현재 tick, fee tier와 구간별 liquidity를 반영한다.
- Multi-hop은 hop별 영향을 순차 계산하고 Split은 leg별 결과를 합산한다.
- 단일 probe 비율은 참고값 또는 fallback으로만 사용한다.
- Route Price Impact와 Oracle 기준 Market Deviation을 별도 항목으로 기록한다.

### Solver와 Settlement 안전성

- Solver 제출 Gas·Fee·Price Impact를 그대로 신뢰하지 않고 LQC가 독립 재계산한다.
- 초기 선택은 최소수령량, allowlist, Bond, exposure, deadline을 통과한 후보 중 검증된 순수령액 최대값으로 한다.
- 목적지 Recipient·Token·Amount·Transaction·Finality 검증 전에는 SourceEscrow를 상환하지 않는다.
- Bond는 LQC와 승인 Stablecoin 혼합 구조로 구성하고 Oracle haircut을 적용한다.
- Bridge별 거래·일일·Token·Chain 한도와 자동 circuit breaker를 적용한다.
- 공개 Intent의 MEV 대응은 짧은 Quote 유효시간과 서명 Quote를 먼저 적용하고 이후 private flow와 commit-reveal로 확장한다.

## 출시 차단 조건

다음 중 하나라도 충족하지 못하면 Cross-chain Mainnet을 활성화하지 않는다.

- 실제 Gas 계산과 계산 출처 표시
- DEX 유형별 Price Impact 검증
- 목적지 지급과 finality 검증
- 검증 전 Solver 상환 차단
- 혼합 Bond와 미정산 exposure 한도
- Bridge 장애·reorg·MEV·Oracle 조작 회귀시험
- 독립감사 Critical·High 해결

## 현재 진행 상태

- Gate 0: 기존 기록상 Router 2.0, Proof, Registry, V3 Adapter와 BSC 테스트넷 실행 기반 존재. 전체 회귀시험으로 재확인 필요.
- Gate 1: 독립 계약 초안, 권한 강화와 핵심 단위시험 6개 구현.
- Gate 1.5 진행: 실제 calldata 기반 다중 RPC Gas evidence와 fallback 신뢰도 구분 구현.
- Gate 1.5 진행: LQC Flow·V2의 factory/pair reserve 기반 constant-product Price Impact, multi-hop·split leg 검산 구현.
- Gate 1.5 진행: PancakeSwap V3의 `sqrtPriceX96`, 활성 liquidity, 초기화 tick의 `liquidityNet`을 반영한 구간별 Price Impact와 multi-hop 검산 구현.
- Gate 1.5 진행: Route Price Impact와 Oracle 기준 Market Deviation을 별도 evidence로 분리.
- Gate 1.5 완료: 단일 블록에 고정된 V3 pool `slot0`·활성 liquidity·tick bitmap·`liquidityNet` 상태 수집기 구현. bitmap word와 초기화 tick 수를 제한하여 fail-closed 처리.
- Gate 1.5 완료: 기존 이중 Feed 정책의 신선도·편차·활성 상태를 독립 재검증하는 Oracle adapter와 token decimals 기반 Market Deviation evidence 구현.
- Gate 1.5 완료: 설정된 V3 직접 경로의 live-state 결과를 Router quote에 결합하고, 미설정 상태는 `probe-fallback`으로 명시. Route Price Impact와 Oracle Market Deviation을 별도 snapshot evidence로 보존.
- Gate 2 완료(코드·로컬 EVM): 권한 제한형 `LQCInternalSolver`를 기존 Router 2.0에 연결. Escrow release·Swap·최소수령 검증·Intent 상태 갱신을 한 트랜잭션에서 원자적으로 실행하며 실패 시 전체 rollback.
- Gate 2 완료(코드·로컬 EVM): Hub·Router 바인딩 검증과 2단계 Solver 역할 수락, source-token 잔액·allowance zero 검증 구현.
- Gate 2 완료(검증기): 사전 `eth_estimateGas`와 채굴된 `gasUsed × effectiveGasPrice`, V3/V2 Price Impact, Oracle Market Deviation을 전용 Same-chain Intent Receipt에 결합. 정확한 Hub calldata·canonical block·`SameChainIntentExecuted` event를 독립 재검증.
- Gate 2 테스트넷 활성화는 별도 배포 승인 이후 수행하며 기존 배포 주소는 현재 변경하지 않음.
- Gate 3 진행: `LQCQuoteManager`와 최대 120초 EIP-712 Solver Quote 구현. Intent·Solver·DEX·Route hash·수령량·Solver fee·Gas cost·발행시각·nonce를 서명에 결합.
- Gate 3 진행: 2개 이상 16개 이하 Solver 후보에서 검증된 순수령액 최대 Quote를 선택하고 동률은 Quote hash로 결정론적 처리. 위조·비활성·만료 후보는 격리하고 중복 Solver는 차단.
- Gate 3 완료: `LQCIntentHub.executeSameChainIntent`가 허용된 Solver의 EIP-712 Quote를 `LQCQuoteManager`에서 다시 검증하고, 서명된 DEX·route hash·수령량·만료를 실제 실행 입력과 결합. Quote/DEX/route 치환 시 Escrow release 전에 revert.
- Gate 3 완료: 선택 `quoteHash`와 `routeHash`를 Intent 상태에 저장하고 `SameChainIntentExecuted` 이벤트 및 v2 Same-chain Receipt에 포함. canonical verifier가 변경된 이벤트 ABI와 Quote hash를 독립 검증.
- Gate 4 완료: 임시 owner allowlist를 `LQCSolverRegistry`로 교체. 최소 ERC-20 Bond, Solver별 누적 exposure limit, Intent별 exposure 추적, 7일 인출 지연, live exposure 중 인출 차단, guardian pause를 구현.
- Gate 4 완료: QuoteManager는 Registry 적격성을 조회하고 Hub는 동일 Registry인지 확인한 뒤 실행 전 exposure를 열고 성공 후 닫음. 실패 시 전체 트랜잭션과 exposure가 함께 rollback.
- Gate 4 완료: `NON_DELIVERY`, `BELOW_MINIMUM`, `INVALID_ROUTE`, `FRAUDULENT_RECEIPT` challenge 사유와 7일 증거 제출 창을 정의. 증거 ID는 `keccak256(intentHash, solver, challenger, reason, canonicalProofHash)`로 challenger에 결합하여 proof 복사 선점을 차단.
- Gate 4 완료: 설정 가능한 resolver가 challenge를 판정하고 최대 100% Bond haircut을 적용. 미해결 challenge는 인출을 차단하며 이미 대기 중인 인출액도 slash 후 잔여 Bond 이하로 축소. 기각된 challenge bond는 slash recipient로 귀속.
- Gate 5 완료: 누구나 제출 가능한 `LQCExecutionVerifier` 구현. EIP-712 ExecutionReport에 Intent·Solver·Quote·서명/관측 route·예상/관측 execution hash·transaction/block/canonical receipt hash·최소/실제 수령량·예상/실제 Gas·Price Impact·Oracle Deviation을 결합.
- Gate 5 완료: 정렬된 고유 attester 서명과 설정 가능한 quorum을 강제하고, `BELOW_MINIMUM`, `INVALID_ROUTE`, `FRAUDULENT_RECEIPT`, `QUALITY_BREACH`를 결정론적으로 분류. guardian pause와 owner 정책 변경을 분리.
- Gate 5 완료: challenge가 verifier `reportHash`를 canonical proof로 보유하며, 검증된 Intent·Solver·fault reason이 모두 일치할 때 누구나 `resolveChallengeWithVerifier`로 Bond slash를 실행. 수동 resolver는 비상 경로로 유지.
- Gate 5 완료: `prepare-intent-execution-report.mjs`가 2개 이상 BSC testnet RPC에서 chain·성공 receipt·canonical block·Hub target·calldata·mined Gas·gas price·confirmation을 교차 검증하고 RPC 불일치/reorg/finality 부족 시 fail-closed.
- Gate 5 완료: 교차 검증 결과로 canonical receipt hash와 bounded ExecutionReport를 생성하고, runtime에서만 받은 quorum attester key로 EIP-712 서명한 뒤 주소순 정렬하여 정확한 `submitReport` calldata JSON을 준비. RPC URL·private key는 결과에 기록하지 않으며 트랜잭션은 전송하지 않음.
- Gate 5 완료: `prepare-intent-testnet-stack.mjs`가 검증된 BSC testnet Governance 4-of-7, Risk/Guardian/Treasury 3-of-5 Safe와 기존 Router 2.0 ExecutionRouter를 고정하고 3단계 배포 manifest를 생성.
- Gate 5 완료: Stage 1 Hub·QuoteManager·SolverRegistry·ExecutionVerifier 독립 배포, Stage 2 Router-bound InternalSolver 배포, Stage 3 Governance Safe 상호 바인딩·Risk resolver·Treasury slash recipient·2인 attester quorum 활성화 순서를 calldata로 준비.
- Gate 5 완료: 기본 pilot 정책은 18-decimal Bond token 10,000 단위, Solver exposure 1,000 단위, Gas overrun 20%, Price Impact 5%, Oracle Deviation 3%. 주소·Safe threshold·중복 attester·quorum·action target/data를 dry-run하고 트랜잭션은 전송하지 않음.
- Gate 5 완료: `inspect-intent-bond-candidates.mjs`가 2개 이상 RPC의 공통 block에서 후보 token bytecode·18 decimals·total supply, 독립 DEX venue별 token/quote 실잔액, 독립 Oracle 2개 이상의 round 완결성·1시간 freshness·정규화 가격 편차 5% 이하를 교차 검증.
- Gate 5 완료: 동일 venue/feed 중복, RPC별 상태 불일치, bytecode 부재, 부족한 liquidity, stale/incomplete/divergent Oracle을 개별 blocker로 기록. 결과는 Governance 선택 자료일 뿐 token 선택·승인·이체·배포는 수행하지 않음.
- Gate 5 완료: `build-intent-reproducibility-seal.mjs`가 Governance 4-of-7 승인 기록, 정확히 하나의 eligible Bond 검사 결과와 그 canonical digest, Git source revision, package-lock digest, Solidity 0.8.30 설정, Intent source digest, 4개 Stage 1 ABI/creation/runtime bytecode digest, constructor 포함 init-code digest를 하나의 seal로 결합.
- Gate 5 완료: Bond 주소·검사 결과·소스·artifact·init code·Governance threshold 중 하나라도 바뀌면 seal 검증 실패. dirty worktree 또는 승인/검사 파일 부재 시 실제 seal 파일 생성을 거부하므로 현재는 token을 임의 고정하지 않음.
- Gate 5 완료: `LQCBondSelection`은 Governance Safe만 bytecode가 있는 Bond token과 검사 digest를 1회 승인할 수 있고 `BondTokenApproved`를 기록. 재선택·EOA token·빈 digest·비인가 호출을 차단.
- Gate 5 완료: `verify-intent-bond-selection.mjs`가 2개 이상 BSC testnet RPC에서 Safe receipt/canonical block/finality, `execTransaction` 내부 target·value·CALL operation·`approveBondToken` payload, 전후 nonce +1, EIP-712 SafeTx hash와 `ExecutionSuccess`, 선택 이벤트 및 최종 on-chain state를 모두 검증.
- Gate 5 완료: `prepare-intent-bond-selection.mjs`가 검사 결과의 단일 eligible token을 대상으로 `LQCBondSelection` Stage 0 배포 init code를 생성하고, 배포 주소와 최신 Safe nonce가 주어지면 정확한 `approveBondToken` calldata·SafeTx 구조체·EIP-712 hash를 생성. 트랜잭션은 전송하지 않음.
- Gate 5 완료: Stage 1 reproducibility seal은 Governance 승인 receipt를 2개 이상 RPC와 3 confirmations로 검증한 결과를 필수 입력으로 요구. 선택 계약·SafeTx hash·nonce·검증 digest를 seal에 결합하고 약한 RPC/finality 검증을 거부.
- Gate 5 완료: `preflight-intent-bond-selection.mjs`가 2개 이상 BSC testnet RPC의 공통 block에서 Governance Safe·Bond token bytecode, 최신 Safe nonce, 선택 기록 계약의 canonical runtime과 immutable Governance 주소, 미사용 상태를 교차 검증.
- Gate 5 완료: Stage 0 계획의 token·inspection digest·approval calldata·SafeTx hash를 다시 계산하고 RPC별 block/state 불일치, stale nonce, 이미 사용된 선택 계약, 변조된 runtime/calldata를 fail-closed. 트랜잭션은 전송하지 않음.
- Gate 5 완료: `build-intent-bond-selection-evidence.mjs`가 candidate inspection → Stage 0 deploy plan → 최신 nonce approval plan → multi-RPC preflight를 token·inspection digest·선택 계약·Safe nonce·SafeTx hash로 결합한 불변 증거 묶음과 운영 runbook을 생성. 빈 출력 디렉터리만 허용하며 서명·배포·승인·이체·트랜잭션 전송은 수행하지 않음.
- Gate 5 완료: `finalize-intent-bond-selection-record.mjs`가 제출된 Safe transaction hash를 직전 approval plan·multi-RPC preflight·단일 eligible candidate와 결합하여 canonical 선택 기록을 생성. 결과는 `PENDING_MULTI_RPC_VERIFICATION`으로만 표시되며 별도 verifier가 2개 이상 RPC와 finality를 확인하기 전에는 Governance 승인으로 인정하지 않음.
- Gate 5 완료: `build-intent-stage1-readiness.mjs`가 canonical 선택 기록과 `VERIFIED` 결과의 token·inspection digest·selection contract·approval transaction·SafeTx hash·Safe nonce를 모두 교차 검증. 2개 이상 RPC와 3 confirmations를 통과한 경우에만 `READY_FOR_REPRODUCIBILITY_SEAL`을 생성하며 Stage 1 배포나 트랜잭션은 수행하지 않음.
- Gate 5 완료: Stage 1 reproducibility seal 생성기는 readiness 파일과 그 canonical digest를 필수 입력으로 요구하고 seal 내부에 결합. readiness 누락·변조 또는 selection/verification과의 불일치 시 seal 생성을 거부하여 준비 게이트 우회를 차단.
- Gate 5 완료: `verify-intent-stage1-seal.mjs`가 Seal을 현재 clean Git revision·package-lock·Solidity compiler·Intent source digests·4개 artifact digests·Stage 1 init code·readiness 원본과 독립 대조. 전부 일치할 때만 `VERIFIED_FOR_STAGE1_DEPLOYMENT_REVIEW`를 반환하며 배포 권한이나 트랜잭션은 생성하지 않음.
- Gate 5 완료: `build-intent-stage1-review-package.mjs`가 검증된 Seal·build verification·Stage 1 manifest를 4개 계약의 init-code hash와 검토 체크리스트로 결합. 빈 디렉터리에만 불변 검토 패키지를 생성하며 별도 명시적 승인 전 배포·서명·전송을 수행하지 않음.
- Gate 5 완료: `preflight-intent-stage1-deployment.mjs`가 2개 이상 BSC testnet RPC의 공통 block에서 deployer nonce·balance·4개 예상 CREATE 주소의 code 부재·각 init code gas estimate를 교차 검증. RPC 상태 불일치·기존 code·gas 편차 5% 초과 시 fail-closed하며 트랜잭션은 전송하지 않음.
- Gate 5 완료: `verify-intent-stage1-deployment.mjs`가 실제 배포 후 4개 CREATE transaction의 순서·deployer nonce·init code·예상 주소·성공 receipt·canonical block·runtime code·3 confirmations를 2개 이상 RPC에서 교차 검증. 검증기는 서명·전송·설정·활성화를 수행하지 않음.
- Gate 5 완료: `build-intent-stage2-readiness.mjs`가 검증된 Stage 1 배포의 Hub·SourceEscrow·QuoteManager·SolverRegistry·ExecutionVerifier runtime과 Governance/Risk/Guardian/Bond/품질 정책을 공통 block의 2개 이상 RPC에서 대조. 사전 binding·pause·정책 변경이 없을 때만 Internal Solver 배포 검토 단계로 진입하며 트랜잭션은 수행하지 않음.
- Gate 5 완료: `build-intent-stage2-review-package.mjs`가 Stage 2 readiness와 단일 Internal Solver 배포 manifest를 Hub·Router 2.0·Governance Safe·Bond token·init-code digest로 결합. 빈 디렉터리에만 불변 검토 패키지를 생성하며 별도 승인 전 배포·Hub binding·서명·전송을 수행하지 않음.
- Gate 5 완료: `preflight-intent-stage2-deployment.mjs`가 2개 이상 BSC testnet RPC의 공통 block에서 배포자 nonce·tBNB 잔액·예상 Internal Solver CREATE 주소의 code 부재·init code gas estimate를 교차 검증. RPC 상태 불일치·기존 code·가스 편차 5% 초과·잔액 부족 시 fail-closed하며 트랜잭션은 전송하지 않음.
- Gate 5 완료: `verify-intent-stage2-deployment.mjs`가 실제 Internal Solver CREATE transaction의 배포자·nonce·init code·예상 주소·성공 receipt·canonical block·runtime·3 confirmations를 2개 이상 RPC에서 교차 검증. 배포된 `intentHub`·`executionRouter`·`administrator` immutable을 검토값과 대조하며 서명·전송·Hub binding·활성화는 수행하지 않음.
- Gate 5 완료: `build-intent-stage3-readiness.mjs`가 검증된 Internal Solver와 Stage 1 핵심 계약 4개의 runtime·Safe 역할·Bond/품질 정책·SourceEscrow controller·Solver immutable을 2개 이상 RPC의 공통 block에서 대조. Hub/QuoteManager/Registry/Verifier가 아직 미연결·미활성 상태일 때만 Governance binding 검토 단계로 진입하며 Safe 서명이나 트랜잭션은 수행하지 않음.
- Gate 5 완료: `build-intent-stage3-review-package.mjs`가 Stage 3 readiness와 11개 Governance 작업의 순서·target·calldata·Safe 역할·정책·attester를 독립 재계산해 결합. 빈 디렉터리에만 불변 검토 패키지를 생성하며 별도 승인 전 4-of-7 서명·실행·Solver/attester 활성화를 수행하지 않음.
- Gate 5 완료: `preflight-intent-stage3-governance.mjs`가 최신 pristine readiness와 검토 패키지를 재생성하고, canonical block 및 Governance Safe의 runtime·nonce·7개 고유 owner·4 threshold를 2개 이상 RPC에서 대조. Safe proposal·서명·실행은 수행하지 않음.
- Gate 5 완료: `build-intent-stage3-safe-proposal-plan.mjs`가 검증된 최신 Safe nonce부터 11개 Governance 작업을 순차 nonce와 EIP-712 SafeTx hash에 결합. 각 calldata를 review·preflight와 재대조하며, 서명되지 않은 결정론적 계획만 생성하고 Safe proposal·서명·실행은 수행하지 않음.
- Gate 5 완료: `verify-intent-stage3-governance-executions.mjs`가 11개 Safe 실행의 순서·target·value·calldata·operation·gas/refund 필드·EIP-712 SafeTx hash·`ExecutionSuccess`·canonical block·3 confirmations를 검증. 검증 결과는 별도 multi-RPC 최종 상태 확인 전까지 `PENDING_FINAL_STATE`로 제한함.
- Gate 5 완료: `verify-intent-stage3-final-state.mjs`가 2개 이상 RPC의 공통 block에서 Safe 최종 nonce, Hub·QuoteManager·Registry·Verifier·Internal Solver 연결, Risk/Treasury 역할, attester 활성화, pause 상태와 runtime을 교차 검증. 모두 일치할 때만 Stage 3 Governance binding 완료로 판정함.
- Gate 5 완료: `build-intent-stage3-completion-package.mjs`가 Safe proposal plan·11개 실행 검증·multi-RPC 최종 상태를 digest와 nonce로 결합해 5개 파일의 불변 완료 증거 패키지를 생성. 이 패키지는 BSC 테스트넷 Governance binding만 증명하며 Cross-chain·permissionless Solver·메인넷 활성화 권한은 부여하지 않음.
- Gate 5 완료: `verify-intent-stage3-completion-package.mjs`가 완료 패키지의 정확한 5개 파일 집합을 요구하고, 원본 plan·실행·최종 상태에서 manifest와 Markdown을 독립 재생성해 모든 digest와 파일 내용을 대조. 검증 자체는 RPC·서명·승인·트랜잭션 없이 오프라인에서 수행함.
- Gate 5 완료: `run-intent-stage3-audit-gate.mjs`가 clean Git revision·package-lock digest·정확한 완료 패키지 검증을 단일 명령으로 결합하고 결과 전체를 `auditGateDigest`로 봉인. 감사 게이트는 로컬 읽기만 수행하며 RPC·지갑·Safe 승인·배포·토큰 이동 경로를 포함하지 않음.
- Gate 5 완료: `verify-intent-stage3-audit-gate.mjs`가 저장된 감사 게이트 기록을 현재 clean source revision·package-lock·완료 패키지에서 독립 재생성하여 완전 일치를 요구하고, 검증 결과를 별도 `auditVerificationDigest`로 봉인. 소스·lockfile·증거·게이트 기록 치환을 모두 fail-closed 처리함.
- Gate 5 완료: `build-intent-stage3-audit-handoff.mjs`가 Stage 3 완료 manifest·감사 게이트·독립 검증 결과를 source revision과 digest 체인으로 결합하고, 외부 검토 체크리스트를 포함한 5개 파일의 불변 인계 묶음을 생성. 이는 감사 준비 자료이며 외부 감사 완료나 프로덕션 승인을 주장하지 않음.
- Gate 5 완료: `verify-intent-stage3-audit-handoff.mjs`가 감사 인계 디렉터리의 정확한 5개 파일 집합·4개 원본 파일 hash·bundle digest를 확인하고, 원본에서 handoff manifest와 Markdown을 독립 재생성해 전달 중 누락·추가·교체·재해시를 차단함.
- Gate 6 시작: `prepare-intent-stage4-pilot.mjs`가 검증된 Stage 3 감사 인계 이후에만 BSC 테스트넷 같은 체인 Intent 파일럿 계획을 생성. 입력 cap, 99% 최소수령, 5~15분 deadline, 단일 route와 EIP-712 digest를 고정하되 승인·서명·Solver quote·RPC·트랜잭션은 생성하지 않음.
- Gate 6 진행: `verify-intent-stage4-pilot.mjs`가 감사 인계 원본에서 파일럿 계획 전체를 독립 재생성하여 EIP-712 intent hash·route hash·입력 cap·99% 최소수령·deadline·nonce를 대조하고, 결과를 `pilotVerificationDigest`로 봉인함.
- Gate 6 진행: `preflight-intent-stage4-pilot.mjs`가 2개 이상 BSC 테스트넷 RPC의 공통 block에서 Hub·Escrow·QuoteManager·Registry·InternalSolver·양쪽 token runtime, pause, nonce 재사용, 사용자 잔액과 SourceEscrow allowance를 대조. allowance가 0이면 exact approval 준비, 정확한 입력량과 같으면 서명 검토 준비로만 분류하며 트랜잭션은 수행하지 않음.
- Gate 6 진행: `prepare-intent-stage4-exact-approval.mjs`가 allowance 0인 최신 preflight에만 SourceEscrow·source token·정확한 intent 입력량을 결합한 단일 `approve` calldata를 생성. 무제한·과다·잔여 승인을 허용하지 않으며 별도 지갑 검토 전에는 서명·전송하지 않음.
- Gate 6 진행: `verify-intent-stage4-exact-approval.mjs`가 별도로 제출된 승인 transaction의 sender·token target·zero value·정확한 calldata, 성공 receipt·canonical block·3 confirmations와 최종 allowance를 2개 이상 RPC에서 대조. 정확한 입력량 승인만 다음 단계 증거로 인정함.
- Gate 6 진행: `prepare-intent-stage4-signing-packet.mjs`가 정확한 승인 검증과 재실행한 `READY_FOR_INTENT_SIGNATURE` preflight를 요구하고, domain·Intent message·EIP-712 hash·wallet 검토 필드를 불변 패킷으로 생성. signature는 null로 유지하며 지갑 호출·키 접근·서명·Intent 제출은 수행하지 않음.
- Gate 6 진행: `verify-intent-stage4-signature.mjs`가 외부 지갑에서 별도로 생성된 65-byte EIP-712 서명을 검토된 signing packet digest와 Intent hash에 대해 오프라인 검증하고 정확한 사용자 주소 복구만 인정. 공개 서명만 기록하며 키·지갑·RPC·Intent 제출 경로는 포함하지 않음.
- Gate 6 진행: `prepare-intent-stage4-submission.mjs`가 검증된 공개 서명과 signing packet을 다시 대조해 정확한 `submitIntent` calldata·Hub target·사용자 sender·zero value를 생성. 최종 읽기 전용 preflight와 시뮬레이션 전에는 지갑 요청이나 제출을 수행하지 않음.
- Gate 6 진행: `preflight-intent-stage4-submission.mjs`가 독립 검토한 submission plan digest를 요구하고, 2개 이상 RPC의 공통 block에서 runtime·pause·nonce·잔액·정확한 allowance·deadline을 다시 대조. 동일한 `submitIntent` calldata의 `eth_call`이 모든 RPC에서 검토된 Intent hash를 반환하고 gas 추정 편차가 5% 이내일 때만 별도 지갑 제출 준비 상태로 봉인하며, 지갑 요청·서명·전송은 수행하지 않음.
- 회귀 기준 정리: 이미 성공한 V3 Adapter의 Stage 1 배포 calldata는 현재 개선된 Adapter 생성 코드로 덮어쓰지 않고 고정 keccak256으로 검증. 과거 on-chain 증거와 현재 소스 생성기를 분리하여 재배포 오인과 증거 변조를 방지.
- 회귀 기준 정리: Proof Gateway는 과거 bundle의 전체 생성 코드 hash를 보존하고, 현재 artifact는 Solidity CBOR metadata를 제외한 실행 생성 코드 hash까지 대조. 소스 집합 확장에 따른 metadata-only drift는 구분하되 실행 코드 변경은 계속 fail-closed.
- Gate 5 다음 작업: Governance가 Bond token을 확정한 뒤 실제 Stage 0 선택 기록 계약 배포 및 4-of-7 Safe 승인은 별도 사용자 승인으로 진행. 실행 후 canonical receipt와 on-chain 선택 상태를 검증하여 Stage 1 reproducibility seal을 생성.

## 의도적으로 후순위인 기능

- Cross-chain Lending과 Cross-chain Collateral
- Permissionless Solver 공개 등록
- Encrypted Intent와 commit reveal
- ZK 기반 범용 Cross-chain proof
- 다중 Bridge Cross-chain split
- DAO에 의한 즉시 파라미터 변경
- 무기한계약과 Cross-chain Intent 결합
