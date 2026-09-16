# LQC Lending 메인넷 이식성 개발 기준

상태: **승인된 장기 개발 기준**  
기준일: **2026-09-16**

## 결정

LQC Lending은 BSC에서 먼저 완성·검증한다. 이후 별도로 구축한 EVM 호환 LQC 네트워크에 감사된 계약을 재배포하고, BSC와 LQC를 병행 운영한 뒤 단계적으로 전환한다. 현재 BSC 테스트넷 배포 기록과 계약 주소를 변경하거나 자체 메인넷 완료로 표현하지 않는다.

## 개발 원칙

1. Lending 핵심 회계는 Chain ID, RPC, Explorer 또는 특정 DEX 주소에 의존하지 않는다.
2. Token, Oracle, Governance, Guardian, Finality, Gas와 배포주소는 체인별 설정·배포 증거로 분리한다.
3. 공급자 지분, 차입자 부채 지분, Supply Index, Borrow Index, Reserve와 Bad Debt를 기준 블록에서 재현할 수 있어야 한다.
4. Guardian은 신규 위험을 즉시 중지할 수 있지만 상환·안전한 출금을 차단할 수 없다.
5. 일반 포지션 이전의 기본값은 상환·출금·자산 이전·재개설이다.
6. 상태를 자동 이전하는 계약은 이중 출금·이중 대출·중복 Claim 방지와 자산 실재성 검증을 별도 감사받기 전 활성화하지 않는다.
7. Cross-chain 담보와 Cross-chain 부채는 Same-chain Lending과 외부 인프라가 각각 감사되기 전 범위에서 제외한다.
8. 신규 LQC 네트워크 시장은 낮은 Supply Cap·Borrow Cap과 보수적 Oracle 정책으로 시작한다.
9. BSC와 LQC의 시장 위험 한도와 Governance 결정은 독립적으로 관리한다.
10. 양 체인의 총자산·총부채·공급자 청구권·Reserve·Bad Debt 대조가 실패하면 전환을 중지한다.

## 계약 인터페이스 기준

| 영역 | 필수 조건 |
|---|---|
| Market ID | 체인 내부에서 결정적이며 다른 체인의 주소를 암묵적으로 신뢰하지 않음 |
| Oracle | 체인별 Feed 설정, Staleness·Deviation 검사, 실패 시 신규 위험 차단 |
| Interest Index | 마지막 반영 시각과 지분 기반 회계를 공개적으로 재현 가능 |
| Pause | 신규 공급·대출·담보 증가를 제한하고 상환·허용된 안전 출구 유지 |
| Snapshot | 기준 블록의 지분·Index·Reserve·Bad Debt를 독립 검증 가능 |
| Migration | 일회성 Claim, 사용된 증명 기록, 출발 체인 포지션의 재사용 방지 |
| Composite Adapter | 최소 결과, 승인 초기화, 잔액 비축 금지, 실패 시 전체 원자적 Revert |

## 마이그레이션 회계식

기준 블록에서 다음 항목이 독립적으로 대조되어야 한다.

- 공급자 청구권 = 공급 지분 × Supply Index
- 차입자 부채 = 부채 지분 × Borrow Index
- 시장 자산 = 실제 현금 + 회수 가능한 부채
- 시장 청구권 = 공급자 청구권 + Protocol Reserve
- LQC 총공급 = 이전 전 승인 공급량 = BSC 잔여 유효 공급 + LQC 네트워크 Claim 완료·미청구 배정

허용된 반올림 오차는 Token Decimal과 Index 정수연산에서 발생하는 상한으로 문서화하며, 임의의 회계 차이를 반올림으로 처리하지 않는다.

## 활성화 금지 조건

다음 중 하나라도 충족되지 않으면 자체 메인넷 Lending을 활성화하지 않는다.

- EVM 호환 LQC 테스트넷의 Validator, RPC, Explorer와 장애 복구 검증
- 감사된 Lending 계약의 재현 가능한 배포와 소스 검증
- 체인별 Oracle 이중 검증과 비상 중지 훈련
- 경제 공격·청산·Bad Debt·유동성 고갈 시뮬레이션
- Snapshot+Claim 총공급 대조와 중복 Claim 방지 검증
- BSC 사용자의 상환·출금·지원 기간과 종료 정책 공개
- Critical·High 감사 이슈 해결 및 재검증

## 현재 적용

현재 다음 작업인 Composite Lending Adapter부터 이 기준을 적용한다. Adapter는 특정 체인 주소를 하드코딩하지 않고 배포 시 승인된 Lending Core에 고정하며, 실행 후 Executor에 반환된 결과 토큰 외에 입력 자산·승인이 남지 않도록 검증한다.
