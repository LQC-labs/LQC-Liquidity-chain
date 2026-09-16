# LQC 최적 개발 로드맵

상태: **저장소 구현·테스트·배포 증거를 대조한 실행 기준**  
기준일: **2026-09-16**

이 문서는 작업량이 아니라 의존성과 실제 증거를 기준으로 다음 작업을 정한다. `준비 완료`를 `온체인 완료`로 표현하지 않으며, 외부 서명·지갑·RPC가 필요한 단계와 저장소 안에서 독립적으로 진행할 수 있는 단계를 분리한다.

## 완료 상태의 공통 용어

| 상태 | 인정 조건 |
|---|---|
| 구현 완료 | 계약·도구가 작성되고 컴파일됨 |
| 로컬 검증 완료 | 결정적 테스트와 공격·롤백 테스트가 통과함 |
| 테스트넷 준비 완료 | 주소·역할·파라미터·서명 패킷·사전 검사가 재현 가능함 |
| 테스트넷 온체인 검증 완료 | 실제 체인 ID, 배포/실행 트랜잭션, 영수증, 이벤트, 최종 상태가 대조됨 |
| 감사 완료 | 고정 커밋 범위의 독립 감사, 수정, 재검증이 끝남 |
| 메인넷 준비 완료 | 감사 이후 제한 파일럿, 운영·사고 대응, 경제 한도가 검증됨 |

## 현재 기준선

| 영역 | 현재 증거 수준 | 남은 핵심 작업 |
|---|---|---|
| AMM·Router 2.0·Risk·Vault | 로컬 검증 완료 | 외부 감사 범위 재고정 |
| BSC 테스트넷 DEX·Router 2.0 | 온체인 실행 증거 있음 | 흩어진 영수증·로그·잔액 증거를 하나의 최종 패키지로 통합 |
| Safe 역할 | Governance 4/7, Risk·Guardian·Treasury 3/5 온체인 검증 | 정기 드리프트 검사와 사고 훈련 증거 유지 |
| Proof-bound Router 실행 | 실제 실행 트랜잭션 있음 | 최종 상태·모니터링 패키지 일원화 |
| Intent V1 | 계약·로컬 테스트·Stage 1~4 준비/검증 도구 완료 | 실제 Bond 결정, 배포, Safe 설정, Intent 실행 |
| Composite Intent | Plan·Registry·Executor·Router/Vault/Lending Supply Adapter·독립 Coordinator 로컬 구현 및 실제 IntentHub 원자 연동 | 테스트넷 배포·실행 증거와 Adapter 감사 범위 고정 |
| Settlement | SettlementHub·체인별 Finality quorum 검증·Escrow 복구·Solver exposure/challenge/slash 결합을 로컬 완료 | 테스트넷 배포·실행 증거 |
| Lending | Oracle·격리 시장·Index 회계·청산·Bad Debt·경제 불변식·Composite 공급 영수증·42개 변경 진입점 감사 범위·독립 감사 인계·Stage 1 사전/사후 검증·Stage 2 Registry/Index Manifest 로컬 완료 | 실제 설정안 확정·Stage 1 제한형 테스트넷 배포 증거 |
| Cross-chain | 자체 Bridge 미운영 원칙과 Intent·Solver·검증형 Settlement 구조 확정 | 같은 체인 정산 안정화와 외부 Adapter 별도 감사 이후 착수 |
| LQC 자체 메인넷 | EVM 호환 장기 전환 원칙 확정 | BSC Lending·Intent 완성·감사·제한 파일럿 이후 별도 테스트넷 착수 |

## 최단 중요 경로

1. **증거 기준선 고정** — 모든 스크립트를 자동 구문 검사하고, 문서와 산출물에 위 상태 용어를 적용한다.
2. **기존 BSC 증거 통합** — Router 2.0의 배포·실행·최종 상태를 한 패키지에서 재검증한다. 새로운 자금 이동 없이 수행한다.
3. **Intent V1 실제 테스트넷 파일럿** — Bond 승인 → Stage 1 배포 → Stage 2 Solver → Stage 3 Safe 바인딩 → Stage 4 단일 소액 Intent 순서로 실행한다.
4. **Composite Coordinator 완성** — 기존 IntentHub를 위험하게 확장하지 않고 독립 조정 계층에서 Plan 커밋, Adapter 허용, 원자 실행을 묶는다.
5. **SettlementHub 구현** — 부트스트랩 settler를 최종성·재시도·실패 상태·증거 검증이 명시된 정산 계층으로 교체한다.
6. **최소 Lending 코어 구현** — Collateral, Borrow, Interest, Liquidation, Oracle, Caps를 같은 체인 범위에서 먼저 완성하고 Composite Adapter를 추가한다.
7. **보안 강화** — 상태 기반 fuzz, 정적 분석, 경제 시뮬레이션, 운영 훈련 후 감사 커밋을 고정한다.
8. **독립 감사와 수정** — Router/Vault/Intent/Composite/Settlement/Lending을 범위별로 감사하고 재검증한다.
9. **제한 공개 파일럿** — 소액·낮은 TVL·엄격한 한도·실시간 모니터링으로 운영 증거를 축적한다.
10. **LQC 자체 메인넷 전환** — BSC 시스템을 먼저 완성·검증한 뒤 EVM 호환 LQC 테스트넷을 구축한다. 감사 계약 재배포, 양 체인 병행, Snapshot+Claim, Lending 상환 후 재개설, Intent+Solver 이전 보조, 점진적 유동성 이동, 모든 포지션의 안전한 정리 순서를 지킨다.

## 승인된 자체 메인넷 전환 10단계

1. 현재 BSC Lending·Intent 시스템을 완성한다.
2. BSC 테스트넷과 승인된 낮은 한도의 운영 환경에서 검증한다.
3. Native LQC, Validator, RPC, Explorer와 운영통제를 갖춘 EVM 호환 LQC 테스트넷을 구축한다.
4. 감사된 동일 계약을 LQC 네트워크에 재배포하며 BSC 주소나 상태를 그대로 복사하지 않는다.
5. 회계·유동성·Finality·사고 대응을 확인하는 동안 BSC와 LQC를 병행 운영한다.
6. 중복 공급을 방지하는 Governance 승인 Snapshot+Claim 방식으로 LQC를 이전한다.
7. 일반 Lending 포지션은 원칙적으로 상환·출금·이전·재개설 방식으로 이동한다.
8. Intent+Solver 자동화는 Proof, Bond, Finality와 실패 복구가 검증된 후 이전 절차를 보조한다.
9. 체인별 독립 Cap과 Governance 아래 유동성과 한도를 LQC 네트워크로 점진적으로 이동한다.
10. 모든 포지션이 상환·이전되거나 영구적인 안전 출구를 확보한 후에만 BSC의 신규 위험 생성을 종료한다.

## 바로 실행할 두 트랙

| 트랙 | 지금 할 일 | 차단 조건 |
|---|---|---|
| 저장소 트랙 | Composite Coordinator 설계·구현·공격 테스트, 이어서 SettlementHub | 로컬 게이트 실패 시 다음 단계 금지 |
| 운영 트랙 | 기존 BSC 증거 통합 후 Intent Stage 0~4 실제 실행 | 지갑 주소, Bond 결정, Safe 승인, RPC, 가스가 필요하며 명시적 승인 전 송신 금지 |

운영 트랙의 서명 대기 시간에는 저장소 트랙을 진행한다. 다만 로컬 구현이 실제 배포 완료로 표시되어서는 안 된다.

## 단계별 종료 조건

- 각 단계는 코드, 테스트, 상태 문서, 재현 명령, 증거 해시를 남긴다.
- 실패·재조직·만료·서명 불일치·잔액 불일치는 모두 fail-closed여야 한다.
- 배포 단계는 주소만으로 완료 처리하지 않고 트랜잭션, 영수증, 이벤트, 역할, 잔액을 함께 검증한다.
- 감사 전 메인넷 자금 사용과 공개 무제한 TVL은 금지한다.
- Lending과 Cross-chain은 각각 별도 경제·보안 감사 범위로 유지한다.
- 체인 전환은 계약 주소나 상태를 복사하지 않고 감사된 코드를 재배포하는 방식으로 수행한다.
- Migration Block에서 Token Supply, 사용자 자산, 공급자 청구권, 차입자 부채, Reserve와 Bad Debt를 양 체인에서 대조한다.
- BSC의 신규 위험을 중지하더라도 기존 이용자의 상환과 안전한 출금 경로는 계속 유지한다.

## 다음 작업

**Composite Coordinator**와 **SettlementHub·FinalityVerifier·SolverRegistry 결합**의 로컬 구현은 완료했다. Lending Stage 1의 Oracle Manager·Interest Rate Model 배포 Manifest, 다중 RPC 사전검증, 영수증·최종성·정확한 런타임 사후검증을 완료했고, 검증된 주소만 사용하는 Stage 2 Market Registry·Interest Index Manifest를 추가했다. 다음 저장소 작업은 **Stage 2 다중 RPC 사전검증과 배포 후 immutable·런타임 검증**이다. 실제 배포·Safe 승인은 운영 설정안 확정 후 별도 단계로 수행한다.
