# LQC Flow DEX 감사기관 후보 비교

작성 기준: 2026-09-11. 아래는 공개된 공식 서비스 설명을 바탕으로 한 후보군이며, 선정·계약·결제는 MMXlabs & LQC LLC의 최종 승인 사항입니다. 비용과 착수일은 각 기관의 서면 견적 전에는 확정하지 않습니다.

| 후보 | 공개된 강점 | LQC 적합성 | 확인할 조건 |
|---|---|---|---|
| [OpenZeppelin Security Audits](https://www.openzeppelin.com/security-audits) | Solidity 등 다수 언어, DeFi·브리지·L2 감사, 대규모 공개 감사 실적 | Router·Vault·권한·Timelock에 적합한 1순위 후보 | BSC 테스트넷 범위, 일정, 재감사와 보고서 공개 조건 |
| [Trail of Bits Blockchain](https://trailofbits.com/services/blockchain/) | 아키텍처·수동 검토와 Slither/Echidna/Medusa 기반 검토 | 권한 우회, 라우팅 불변식, 퍼징 심층 검토에 적합 | 전체 DeFi 범위와 팀 투입 가능일 |
| [Halborn Audits](https://www.halborn.com/audits) | 스마트컨트랙트·블록체인 인프라·침투테스트를 함께 제공 | 계약·Indexer·운영 인프라를 함께 점검할 때 적합 | Solidity 감사와 인프라 감사의 분리 범위 |
| [CertiK Smart Contract Audit](https://www.certik.com/products/smart-contract-audit) | 수동 검토와 자동 분석, 선택적 formal verification | 넓은 배포·검증 자료와 형식검증이 필요할 때 후보 | 실제 담당팀, 수동 검토 깊이, 수정 재검증 범위 |

## 권장 선정 절차

1. OpenZeppelin, Trail of Bits, Halborn에 동일한 LQC 감사 요청서를 보낸다.
2. 동일한 커밋, 동일한 범위, 동일한 제외사항으로 견적과 일정만 비교한다.
3. 담당 감사팀의 DeFi Router·Vault·권한·BSC 경험과 재감사 조건을 확인한다.
4. 가격보다 수동 검토 깊이, 공격 시나리오, 재현 가능한 보고서, 수정 후 재검증을 우선한다.
5. 최종 기관을 사용자가 승인한 뒤에만 계약과 자료 전송을 진행한다.

## LQC 제출 범위

- Router 2.0, LQC Flow, Vault/Strategy, Risk Registry, Adapter
- AccessManager, Timelock, EmergencyController, Safe 정책과 운영 감시
- 승인·서명·복구 저장소, 다중 RPC 합의, Indexer 무결성 경계
- `AUDIT_HANDOFF.md`, `AUDIT_SCOPE.md`, `SECURITY_TEST_MATRIX.md`
- 고정 커밋의 컴파일·전체 테스트·커버리지 결과

제출하지 않는 것: 개인키, 시드문구, `.env`, 실제 사용자 자금, 감사 범위에 포함되지 않은 미완성 Lending·Bridge·Perpetual 기능.
