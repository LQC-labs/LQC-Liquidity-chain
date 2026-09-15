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
| 2 Internal Solver | Router 2.0을 첫 Solver로 연결 | Same-chain Intent 1회 원자적 실행, Receipt 검증 |
| 3 Quote Competition | QuoteManager, 서명 Quote, 2개 이상 mock Solver | 최고 유효 위험조정 Quote 결정론적 선택 |
| 4 Solver Risk | Registry, 혼합 Bond, exposure, 인출 지연 | Bond 이하 노출, challenge 중 인출 차단 |
| 5 Best Execution | Proof 고도화, 공개 verifier | 비교 후보·선택 결과·실수령액 재검증 |
| 6 Composite Intent | Router, Vault, Lending Action adapter | Same-chain 복합 실행과 전체 revert |
| 7 Settlement | SettlementHub, challenge, slash | 이중 정산·허위 proof·timeout 공격 차단 |
| 8 Cross-chain MVP | 외부 Bridge adapter 1개, 체인 2개 | 지급·상환·실패 환불 end-to-end 통과 |
| 9 Hardening | MEV·reorg·oracle·bridge 장애 시험 | Critical attack matrix와 회귀시험 통과 |
| 10 Mainnet Gate | 외부감사, bug bounty, caps | Critical·High 해결 후 제한형 활성화 |

## 현재 진행 상태

- Gate 0: 기존 기록상 Router 2.0, Proof, Registry, V3 Adapter와 BSC 테스트넷 실행 기반 존재. 전체 회귀시험으로 재확인 필요.
- Gate 1: 독립 계약 초안과 핵심 단위시험 구현.
- Gate 2 이후: Gate 1 회귀시험 완료 후 진행.

## 의도적으로 후순위인 기능

- Cross-chain Lending과 Cross-chain Collateral
- Permissionless Solver 공개 등록
- Encrypted Intent와 commit reveal
- ZK 기반 범용 Cross-chain proof
- 다중 Bridge Cross-chain split
- DAO에 의한 즉시 파라미터 변경
- 무기한계약과 Cross-chain Intent 결합

