# Router 2.0 무자금 준비 작업

이 문서는 tBNB 충전 전에 완료할 1~6번 작업의 실행 기준이다. 어떤 명령도 지갑 서명이나 거래를 자동 실행하지 않는다.

| 번호 | 준비 결과 | 실행 시점/명령 |
|---|---|---|
| 1 | tLQC/WBNB V3 파일럿 수수료를 `2500`으로 고정 검사 | `npm run inspect:testnet-readiness` |
| 2 | LQC Flow, PancakeSwap V2, V3에 같은 입력량을 쓰는 견적 파일 생성 | 배포 후 `npm run prepare:route-probes`; 이어서 `EXECUTE_SMOKE_SWAP=false npm run smoke:testnet` |
| 3 | Execution/Native/Auto Router와 모든 등록 Adapter의 BNB·토큰 잔액, Router→Adapter 승인 잔량 검사 | `npm run monitor:testnet` |
| 4 | 체인 97, 최근 블록 180초, 설정 검증 실패·잔여 자산·잔여 승인을 Critical로 처리 | `MONITOR_MAX_BLOCK_AGE_SECONDS=180 npm run monitor:testnet` |
| 5 | 표준 JSON 입력, 컴파일러 설정, 생성자 인수를 포함한 BscScan 자료 생성 | 배포 후 `npm run prepare:verification` |
| 6 | 현재 UI 설정을 보존한 채 다음 설정과 복구 설정을 함께 생성 | 배포 후 `npm run prepare:router2-cutover` |

## 전환 순서

1. 전체 배포 완료 후 `validate:testnet`을 통과한다.
2. 읽기 전용 견적 비교와 `monitor:testnet`을 통과한다.
3. BscScan 검증 자료를 생성하고 주소·컴파일러·생성자 인수를 대조한다.
4. `prepare:router2-cutover`로 `next-config.js`, `rollback-config.js`, `manifest.json`을 만든다.
5. `next-config.js`를 적용한 뒤 UI 견적만 확인한다. 실패하면 즉시 `rollback-config.js`를 복원한다.
6. 실제 소액 거래는 별도 승인 후에만 수행한다.

## 현재 차단 항목

- 배포용 tBNB 부족
- 네 개 운영 역할 주소 미확정
- tLQC/WBNB PancakeSwap V3 수수료 2500 풀 미생성
- Router 2.0 실제 배포 기록 미생성

위 항목이 해결되기 전에는 기존 최소 Router UI 설정을 변경하지 않는다.

## tBNB 없이 추가 완료한 기반 작업

- Best Execution Proof를 실행 대상·호출 데이터·보낸 주소·value·nonce·deadline과 결합하는 실행 의도 증거
- 실행 의도와 실제 settlement 증거를 하나로 묶고 재생 및 거래 대체를 거부하는 검증기
- 60초 이하 유효기간과 요청 해시를 사용하는 다중 DEX 읽기 전용 견적 API/SDK 요청 규격
- 모바일 오류 유형별 최신 견적·네트워크 전환·재시도·tBNB 안내 복구 버튼
- 감사 패키지에 검증된 Proof 및 Settlement 개수와 증거 다이제스트를 결합하는 선택적 항목
- 원문 API 키를 저장하지 않는 해시 인증, 파트너별 호출 제한, 요청 추적 ID, 표준 오류를 갖춘 읽기 전용 견적 API 게이트웨이 기반

이 작업들은 지갑 서명, 온체인 배포, 테스트넷 주소 변경, 실제 Swap을 수행하지 않는다.
