# LQC 읽기 전용 견적 API 파트너 연동 가이드

상태: **BSC 테스트넷 준비용 규격**  
범위: 읽기 전용 다중 DEX 견적과 Best Execution Proof 전달  
제외: 개인키 보관, 지갑 서명, 거래 제출, 자산 수탁

## 제공 파일

- `docs/quote-api-openapi.json`: OpenAPI 3.1 계약
- `scripts/quote-api-gateway.mjs`: 인증·호출 한도·멱등성·Proof 경계
- `scripts/quote-api-http.mjs`: 제한된 HTTP 경로와 본문 보호
- `scripts/quote-api-client.mjs`: HTTPS 파트너 참조 클라이언트

## 필수 연동 순서

1. `GET /v1/capabilities`를 호출한다.
2. 체인 `97`, 요청/응답 버전 `1`, Proof와 요청 해시 결합 기능을 검사한다.
3. `GET /v1/health`가 `healthy` 또는 `degraded`인지 확인한다. `busy`이면 견적을 보내지 않는다.
4. 60초 이하 유효기간과 재사용되지 않은 `clientRequestId`로 정규 견적 요청을 만든다.
5. `POST /v1/quote`에 Bearer API 키와 `application/json` 본문을 보낸다.
6. 응답의 `requestHash`, 체인, 토큰, 수량, 만료, Best Execution Proof를 모두 검증한다.
7. 거래를 만들 때에도 Proof의 경로·분할량·최소 수령량·deadline을 다시 대조한다.
8. 지갑 서명과 제출은 파트너 또는 사용자 지갑에서만 수행한다.

상태 응답의 `metrics`는 전체 요청·인증·제한·성공·재사용·과부하·실패 합계만 포함한다. 고객별 활동이나 거래 내용으로 해석하지 않으며, 장기 보관용 회계 자료로 사용하지 않는다.

## 안전한 클라이언트 예시

```js
import { createQuoteApiClient } from "../scripts/quote-api-client.mjs";

const client = createQuoteApiClient({
  baseUrl: process.env.LQC_QUOTE_API_URL,
  apiKey: process.env.LQC_QUOTE_API_KEY,
  validateQuoteResponse: async (request, response) => {
    return response.requestHash === request.requestHash && verifyBestExecutionProof(response.proof);
  }
});

await client.capabilities();
const health = await client.health();
if (health.status === "busy") throw new Error("LQC quote service is busy");
const response = await client.quote(canonicalRequest);
```

예시의 환경변수 값은 저장소에 커밋하지 않는다. API 키는 브라우저 번들, URL, 로그, 오류 메시지에 넣지 않는다.

## 재시도 규칙

- 동일 `clientRequestId`, `requestHash`, 요청 본문을 그대로 사용한다.
- 서버가 `retryable: true`로 응답한 경우에만 최대 2회 재시도한다.
- 각 재시도 전에 요청 만료를 다시 확인한다.
- 응답 Proof의 만료시간이 요청 만료를 넘지 않고 현재 시각보다 이른지 검사하며, 실제 실행 한도에는 더 짧은 Proof 만료시간을 사용한다.
- `INVALID_REQUEST`, `REQUEST_ID_CONFLICT`, `INVALID_QUOTE_EVIDENCE`는 재시도하지 않는다.
- 응답을 받지 못했더라도 새로운 내용에 기존 요청 ID를 사용하지 않는다.

## HTTP 보안 조건

- HTTPS만 사용하고 리다이렉트를 허용하지 않는다.
- 견적 요청 본문은 기본 32KB 이하로 제한한다.
- 응답은 기본 256KB 이하로 제한한다.
- `Content-Length`와 실제 UTF-8 바이트 수가 일치해야 한다.
- 압축 본문과 모호한 `Transfer-Encoding` 조합은 거부한다.
- 모든 응답은 `Cache-Control: no-store`와 `X-Content-Type-Options: nosniff`를 포함한다.

## 환경 분리

현재 공개 규격은 BSC 테스트넷 체인 `97`만 지원한다. 운영 체인, 운영 API 주소, 운영 키, 실제 유동성 또는 메인넷 배포 승인을 의미하지 않는다. 테스트넷과 운영 환경은 서로 다른 URL·API 키·로그·호출 한도·배포 기록을 사용해야 한다.

## 연동 완료 기준

- OpenAPI 계약 테스트 통과
- 호환성 하향 변경 차단 테스트 통과
- 정상·주의·과부하 상태 처리 확인
- 인증 실패·호출 한도·본문 크기·응답 크기 처리 확인
- 동일 요청 재시도와 요청 ID 충돌 처리 확인
- Proof 변조·만료·거래쌍·수량 불일치 차단 확인
- API 키와 사용자 개인키가 저장소·로그·오류에 포함되지 않음
