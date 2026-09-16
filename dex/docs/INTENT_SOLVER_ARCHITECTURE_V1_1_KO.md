# LQC Intent Solver Architecture v1.1

상태: 채택된 개발 기준 초안  
프로젝트: LQC Liquidity Chain  
적용 원칙: 기존 Router 2.0과 테스트넷 배포를 보존하는 독립 확장

## 1. 결정

LQC는 자체 Cross-chain Bridge의 custody, mint/burn, consensus와 relayer 인프라를 Core에 구축하지 않는다. LQC는 사용자의 결과 조건을 받아 DEX, Solver, 외부 Bridge와 유동성 경로를 비교하고 선택·실행·검증하는 Liquidity and Execution Layer를 구축한다.

핵심 구조는 다음과 같다.

```text
Intent + SourceEscrow + Solver Competition + Risk Engine + Verifiable Settlement
```

## 2. 기존 개발 보존

다음 모듈은 교체하지 않고 재사용한다.

- Router 2.0과 Execution Router
- DEX Registry와 DEX Adapter
- Quote Router와 Split Optimizer
- Best Execution Proof와 Proof-bound Gateway
- Risk Registry와 Emergency Controller
- Liquidity Vault
- Oracle, Treasury, Access Control 기반
- BSC 테스트넷 배포 기록과 검증 자료

기존 Router 2.0은 초기 Internal Solver로 사용한다. 기존 `BridgeManager` 계열은 즉시 삭제하지 않고 deprecated 상태로 격리하며 신규 Intent 모듈에서 호출하지 않는다.

## 3. 신규 모듈 경계

| 모듈 | 책임 | 기존 코드와의 경계 |
| --- | --- | --- |
| SourceEscrow | 주문별 출발 자산 잠금, Solver 상환, 취소·만료 환불 | Vault와 자금을 합치지 않음 |
| IntentHub | EIP-712, nonce, deadline, 상태 전이 | Router를 직접 변경하지 않음 |
| QuoteManager | Solver 서명 Quote 수집과 선택 | 계산은 오프체인, 검증은 온체인 |
| SolverRegistry | 등록, 활성 상태, 실행 자격 | DEX Registry와 분리 |
| SolverBond | LQC·승인 Stablecoin Bond, 인출 지연 | Treasury와 회계 분리 |
| RiskEngine | Solver·Bridge·Token·Chain exposure | 기존 Risk Registry를 어댑터로 재사용 |
| SettlementHub | 실행 제출, challenge, finalize, reimbursement | IntentHub bootstrap settler를 대체 |
| ExecutionVerifier | 목적지 지급 증명 검증 | Bridge별 검증 어댑터 사용 |
| BridgeRegistry | 허용 Bridge, 한도, 체인·토큰 지원 | Bridge custody를 보유하지 않음 |

## 4. 자산 흐름

1. 사용자는 결과 조건이 포함된 Intent에 서명한다.
2. IntentHub는 서명·nonce·deadline·sourceChainId를 검증한다.
3. SourceEscrow가 주문별로 출발 자산을 잠근다.
4. Solver들은 EIP-712 Quote를 제출한다.
5. Optimizer는 순수령액, 성공확률, 위험과 exposure를 비교한다.
6. 선정 Solver가 목적지 체인에서 먼저 자산을 지급한다.
7. ExecutionVerifier가 지급 증명을 확인한다.
8. Challenge가 없거나 분쟁이 해결되면 SettlementHub가 Solver에게 상환한다.
9. 실패·만료 시 사용자는 SourceEscrow에서 원금을 환불받는다.

## 5. Best Execution Proof

LQC의 공개 차별화 기능은 선택 결과를 재현할 수 있는 Execution Receipt다. Receipt에는 Intent hash, 비교 Quote hash, 선택 Solver, 예상·최소·실제 수령액, 비용, 위험점수, 선택 규칙 버전과 실행 증명 hash가 포함된다.

Route 탐색과 점수 계산은 오프체인에서 수행하되 Solver Quote는 서명하고 선택 결과의 commitment를 온체인에 기록한다. 누구나 동일 입력과 공개 규칙으로 결과를 다시 계산할 수 있어야 한다.

### 5.1 Gas 증명 기준

Gas 비용은 고정 gasUnits를 정상값으로 사용하지 않는다. 선택된 실제 Router, calldata, sender와 Route를 사용한 `eth_estimateGas` 결과를 기본값으로 하며, 고정값은 RPC 장애 시 보수적 fallback으로만 사용한다. Receipt는 계산 방식, 기준 block, gas price, output token 환산값과 confidence를 포함한다.

### 5.2 Price Impact 증명 기준

Price Impact는 단일 probe 비율만으로 확정하지 않는다. V2·LQC Flow는 reserve 기반, V3는 tick·fee tier·구간별 liquidity 기반, multi-hop과 split은 각 hop·leg 기반으로 계산한다. 거래 자체의 Route Price Impact와 외부 Oracle 기준 Market Deviation은 분리해 공개한다.

## 6. 위험조정형 선택

초기 선택 규칙은 복잡한 학습 모델 대신 결정론적 필터를 사용한다.

1. Intent 최소수령량 충족
2. Solver 등록·Bond·가용 exposure 충족
3. Token, DEX, Bridge와 Chain 허용 여부 확인
4. Quote와 deadline 유효성 확인
5. 한도 통과 후보 중 위험조정 순수령액 최대 선택
6. 동률이면 성공률, latency, priority 순서 적용

Solver가 제출한 Gas, Bridge Fee, Price Impact와 성공확률은 자기신고만으로 채택하지 않는다. LQC가 독립적으로 재계산하거나 검증 가능한 Adapter·과거 실행 기록에서 산출한다.

사용자 모드는 Maximum Output, Balanced, Safest Route로 구분하되 각 모드의 가중치와 제외 기준을 공개한다.

## 7. Solver 책임

Bond는 LQC 단일 자산에 의존하지 않는다. 승인된 Stablecoin과 LQC를 혼합하고 Oracle haircut을 적용한다.

```text
Available Capacity = Risk Adjusted Bond - Unsettled Exposure - Safety Reserve
```

Challenge 중에는 Bond 인출을 금지한다. 허위 증명, 이중 정산, 무단 실행과 확정된 악의적 실패만 Slash 대상으로 삼고 일반 네트워크 지연은 별도 실패 지표로 처리한다.

Bond는 미정산 exposure를 실질적으로 담보해야 한다. LQC 가격 변동에 따른 담보 약화를 줄이기 위해 승인 Stablecoin을 함께 예치하고 자산별 Oracle haircut과 safety reserve를 적용한다.

## 8. 외부 인프라와 MEV 위험 제한

- Bridge별 maxAmount, dailyLimit, supportedChains, supportedTokens와 riskScore를 적용한다.
- 특정 Bridge·Solver에 미정산 노출이 집중되지 않도록 exposure cap을 둔다.
- Bridge 장애, 목적지 지연, reorg 또는 Oracle 이상 시 해당 Chain·Token·Adapter만 부분 중지한다.
- 초기 MEV 방어는 Solver 서명 Quote, 짧은 유효시간, winning Solver binding과 실행 직전 재검증으로 구성한다.
- 거래 규모가 커지면 private order flow, encrypted intent 또는 commit-reveal을 단계적으로 추가한다.

## 9. Phase 1 제한사항

현재 `LQCIntentHub`의 settler 역할은 BSC 테스트넷 bootstrap 전용이다. 이는 Cross-chain execution proof를 대체하지 않으며 메인넷 신뢰 최소화 완료를 의미하지 않는다. 다음 조건 전에는 실제 자금 메인넷을 활성화하지 않는다.

- SettlementHub와 ExecutionVerifier 완성
- Solver Bond와 exposure 제한 완성
- 취소·환불·challenge 불변조건 검증
- 경제 공격 및 Bridge 장애 시뮬레이션
- 독립 보안감사에서 Critical과 High 해결
- Multisig, Timelock, Guardian 권한 분리
- 실제 calldata 기반 Gas Estimation과 DEX별 Price Impact 검증
- 목적지 지급 finality 확인 전 Solver 상환 차단

## 10. 최종 포지셔닝

LQC는 Bridge가 아니라 여러 유동성 공급원과 실행자를 연결하는 검증 가능한 위험조정형 DeFi 실행 계층이다.

> LQC is a verifiable, risk-aware liquidity and execution layer for DeFi.
