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
- Gate 3 다음 작업: `QuoteManager`, 만료시간이 짧은 EIP-712 Solver Quote와 2개 이상 mock Solver 경쟁 구현.

## 의도적으로 후순위인 기능

- Cross-chain Lending과 Cross-chain Collateral
- Permissionless Solver 공개 등록
- Encrypted Intent와 commit reveal
- ZK 기반 범용 Cross-chain proof
- 다중 Bridge Cross-chain split
- DAO에 의한 즉시 파라미터 변경
- 무기한계약과 Cross-chain Intent 결합
