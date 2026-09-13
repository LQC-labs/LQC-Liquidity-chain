# Router 2.0 BSC 테스트넷 배포 준비표

상태: **자금 투입 전 준비 단계**  
대상 네트워크: BSC Testnet (`chainId 97`)

이 문서는 tBNB 확보 전에 완료할 수 있는 코드·설정·검증 작업과, 자금 확보 후에만 실행할
온체인 작업을 분리한다. 개인키·시드문구·서명 데이터는 이 문서와 GitHub에 절대 기록하지 않는다.

## 확인된 공개 주소

| 항목 | 주소 | 상태 |
|---|---|---|
| 테스트 지갑 | `0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB` | 최소 Router 실거래 확인 |
| tLQC | `0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc` | 배포·잔액·매수·매도 확인 |
| WBNB | `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd` | BSC 테스트넷 코드 확인 대상 |
| PancakeSwap V2 Router | `0xD99D1c33F9fC3444f8101754aBC46c52416550D1` | 코드에 고정 |
| PancakeSwap V3 Factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | 코드에 고정 |
| PancakeSwap V3 Router | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | 코드에 고정 |
| PancakeSwap V3 Quoter | `0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2` | 코드에 고정 |

## tBNB 없이 완료된 작업

- [x] 최소 Router 모바일 매수·매도 검증
- [x] 연속 거래와 승인 취소 후 복구 검증
- [x] TokenPocket 명시적 가스 한도 및 RPC 전송 호환성
- [x] Router 2.0, V2/V3 어댑터, 분할 경로 로컬 자동검사
- [x] 공식 PancakeSwap 주소 고정 및 잘못된 주소 거부
- [x] V3 허용 수수료·풀·최대 홉 검증
- [x] 개인키 없는 읽기 전용 준비 점검기
- [x] 배포 체크포인트와 재시도 안전장치
- [x] UI 설정을 검증된 배포 기록에서 자동 생성

## tBNB 없이 계속할 작업

- [ ] 거버넌스·리스크·Guardian·Treasury 주소 입력 전 형식 검증
- [ ] `tLQC/WBNB`, 수수료 `2500` V3 풀 허용 설정 확정
- [ ] LQC Flow·PancakeSwap V2·V3 읽기 전용 경로 탐색 파일 확정
- [ ] Router/Adapter 잔액·승인 잔여량 0 검증 규칙 재점검
- [ ] 배포 후 모니터링·BscScan 검증 명령 사전 점검
- [ ] UI Router 2.0 전환 및 복구 절차 검토

## 사용자 입력이 필요한 공개 주소

| 역할 | 요구 정책 | 주소 |
|---|---|---|
| Protocol Governance Safe | 기본 4-of-7 | 준비 대기 |
| Risk Safe | 기본 3-of-5 | 준비 대기 |
| Emergency Guardian Safe | 기본 3-of-5 | 준비 대기 |
| Treasury Safe | 기본 3-of-5 | 준비 대기 |

네 역할 주소는 서로 달라야 한다. 운영 정책을 낮추거나 동일 주소를 재사용하지 않는다.

## tBNB 확보 후에만 실행할 작업

1. 배포 전 검사 실행 및 `status: ready` 확인
2. Router 2.0과 보안 모듈 배포
3. PancakeSwap `tLQC/WBNB` V3 풀 생성
4. 검토된 한도 내에서 테스트 유동성 공급
5. LQC Flow·PancakeSwap V2·V3 읽기 전용 견적 비교
6. 소액 매수·매도 및 최적 경로 실행
7. 긴급정지·타임락 복구 훈련
8. 모니터링·거래 해시·BscScan 소스 검증 증거 저장

## 자금 기준

- 현재 목표 잔액: 최소 `1.0 tBNB`
- 권장 시험 잔액: `1.2~1.5 tBNB`
- 기본 초기 BNB 유동성: `0.5 tBNB`
- 별도 배포 가스 예비비: 최소 `0.5 tBNB`

모든 수치는 테스트넷 전용이며 메인넷 유동성·토큰 가치·출시 조건을 의미하지 않는다.
