# 소비 fixture 준비 정적 검토 — 문서 재작성
이 문서는 손상된 파일의 원문 복원이 아니다. 승인된 계획과 실제 Solidity 소스를 근거로 UTF-8로 새로 작성했다.
기준: f70afc21ac3b8e93c1d2e5f5c7774915e404df4a. 컴파일·설치·코드 로딩·검사·Anvil·배포를 실행하지 않았다.

## 구현 범위와 미완료
Solidity 20개와 출력 대상 12종은 그대로 보존했다. C01~C12는 실행 가능한 17개 하위 검사로 구현했으며 IMPLEMENTED / STATIC_REVIEWED / NOT_RUN이다. 테스트·runner를 로딩하거나 실행하지 않았다. 양수 Funding·다중 Domain·전송 실패·재진입 확장은 여전히 분리·미구현 상태이며 과거 PASS를 새 fixture에 재사용하지 않는다.

## 600,000 raw 사례
SHORT USD 명목 수량 3e18, 진입가격 1e18, 완전 종료가격 1.2e18: signed PnL=-0.6 USD. Coordinator._pnl(66–80)의 SHORT 부호 반전과 loss 분류 뒤 0.6e27을 담보가격1e18*1e9로 나누고 1e6을 곱하면 loss600000/1 raw가 된다. feeBps0이면 fee0. Ledger._createSeries(110–114)는 rate0을 허용하고 적분 USD 식137은 rate를 곱하므로 정상 Epoch의 Funding debt/claim0이 계산상 가능하다. 실제 값은 아직 확인하지 않았다.
초기증거금은 손실600000과 별개다. 계획 cfg.initialMarginBps5000에서 명목3USD의 최소증거금은1.5USD이며 margin100USD=100000000 raw, LP1000USD=1000000000 raw를 사용한다. 부분 종료 없이 완전 종료1회, exposure Sequence1→2, 동일 Epoch1만 사용한다.

## 정상 호출 순서
deployment-plan.json에 함수·인자·호출자·선행 조건·상태 확인을 명시했다. Core/Funding→두 verifier→예상 주소의 Partial→Attribution→Coordinator→Executor 연결 후 새 Domain을 생성한다. cutoff 이후 Domain, Registry0, Normal을 유지한다.
origin 전 configureExposureResearch→enablePolicyGapStudy→configureLinkedResearch→Attribution.registerDomain→Coordinator.registerMockPolicy→LP/소유자 담보 준비 순이다. owner는 SHORT를 개설하고 전량 종료한다. 관측 updatedAt과 실제 종료 block.timestamp는 모두 exitTime과 일치해야 하며 자동 채굴이 같은 초를 유지한다고 가정하지 않는다.
cutoff 후 advanceFundingSeries→checkpointFundingAccount→fixSeriesMemberUSD→finalizeSeriesUSD→Attribution.processAccount로 Epoch·member·계정 적분을 확정한다. recordPlan→owner sealPlan→budget step1→정수 명세 sequence1→quote 읽기 순이다. expectedAccountTarget0은 실제 초기값을 대조한다.
recordPlan(82–110), _integerLimits(182–196)는 완전 close·sequence·gap·정책·Epoch상태3·member 고정·Attribution done·정수 성분·reserve0을 요구한다. 조건이 성립하지 않으면 quote/storage/코드 주입이나 검사 완화 없이 중단한다.

## 빌드와 실행 gate
compile.cjs는 requirements/tools/makeInput으로 새 build 디렉터리에 출력한다. NOT_GENERATED 차단은 validateBuild에만 있으므로 최초 생성과 검증 gate 사이 순환 조건은 없다. build 디렉터리 존재 시 중단하고 파일은 wx로 생성한다. pin을 자동 승인하지 않는다. 실패 시 부분 출력이 남을 수 있으며 자동 삭제·재실행하지 않는다.
prepared/compiler-input.json은 정적 입력 초안이며 compile.cjs는 고정 소스·설정에서 입력을 재구성한다. 현재 output/manifest는 미생성, buildManifest pin은 null, buildState는 NOT_GENERATED다. 새 빌드 성공 후에도 별도 검토·승인 전까지 runtime 검증 경로는 차단된다.
runtime helper의 상대경로는 새 fixture/node_modules를 가리킨다. 기존 승인 환경의 package/lock·의존성 package metadata·soljson 파일 해시는 읽기만 조사했다. 연결·복사·설치·경로 우회는 하지 않았다. fixture의 node_modules 부재는 현재 빌드 차단 조건이다.

## 의미와 한계
Collected.amount는 Funding 증가분0이며 전체 소비량600000이 아니다. 소비 전후 성분·Held·LP·토큰 잔액·allowance·Funding 장부·authorization을 별도로 확인해야 한다. 전용 소비 Receipt·terminal·일반 원장 연결을 만들지 않는다.
금액 null, 권한 false, 소비/권리 연결 UNVERIFIED를 유지한다. 이번 문서 보완을 실행 검증 PASS로 표시하지 않는다.

## 검사 구현 정적 검토
기존 runtime-tools.mjs를 바이트 그대로 복사하여 Artifact/runtime 및 정확한 오류 거부 도구를 재사용한다. Anvil helper·빌드 gate·Solidity·빌드 산출물·build pin은 변경하지 않는다.
17개 실제 테스트 제목과 caseId를 test-plan에 일대일 대응시켰다. C07·C08·C09·C10의 하위 검사를 명시하고 검사 수를12로 축소하지 않는다. runner는 build gate와 plan/source pin을 통과한 뒤 Mocha를1회 호출하며 누락·중복·예상 밖 제목·실패·pending·비정상 종료를 거부한다. runner의 자체 거부 검증도 이번에는 실행하지 않았다.
부정 검사는 정상 선행 상태를 조회하거나 올바른 인자의 staticCall을 대조군으로 확인한 뒤 정확한 custom error와 trace의 가장 깊은 REVERT 계약을 고정한다. staticCall만으로 원자성을 주장하지 않고 실제 실패 거래의 status0·오류·거부 계약·로그 없음·전후 snapshot 불변도 검증하도록 구현했다. C09는 sender guard를 검증하며 개별 authorization 해시 불일치 guard에 도달했다고 주장하지 않는다.
정상 소비에서는 PnL600000·Funding0·fee0, LP 장부+600000·held-600000, 토큰 잔액·allowance·Funding 장부 불변, Collected.amount0, 두 authorization0을 확인한다. C11은 trace의 CALL 대상과 SSTORE를 검사한다. Executor의 불변 원문 선언 순서에 따른 slot0 entered,slot1 partialAuthorization,slot2 fundingAuthorization을 근거로 임시 hash와 해제를 확인하도록 했다. 이 trace 형태와 슬롯 관찰은 실행 미검증이다.
EVM snapshot/revert는 각 검사 사이 동일한 정상 fixture로 돌아가기 위한 격리 수단이다. quote·storage·bytecode 강제 주입, impersonation, mock Coordinator 대체는 사용하지 않는다. 부정 거래 전후에는 프로토콜 상태·명세 소비 여부·authorization을 비교한다. 가스 소모에 따른 네이티브 잔액과 계정 nonce는 불변 대상으로 삼지 않는다.
실제 Runtime·nonce·Epoch 처리·정수 명세·거부 지점·trace API/stack 형식·receipt 조회·소비 성공·cleanup 동작은 모두 NOT_RUN이다. runtime helper는 직접 자식 정리만 다루며 전체 프로세스 트리 종료를 입증하지 않는다. runner 외부 timeout이 발생하면 하위 프로세스 종료가 입증되지 않을 수 있다. 실행 결과가 나오기 전 검사를 PASS로 표시하지 않는다.

## Failure preservation revision failure-preservation-01
IMPLEMENTED / STATIC_REVIEWED / NOT_RUN. No fixture module evaluation, test,
Anvil, compilation or installation was performed for this revision.
The final hook attempts evidence write and cleanup independently. A WeakMap
associates both failures with the original first thrown object (including frozen
Errors); primitive throws use a wrapper with the original value as cause.
Evidence-only failure, cleanup-only failure and simultaneous failure all throw.
The fixture-local reporter replaces stock JSON error serialization only.
BigInt actual/expected use {$type:bigint,decimal:<exact decimal string>}.
Own nonenumerable error properties include message, stack, code, cause and
AggregateError.errors. Object IDs/references preserve nested causes and cycles;
accessor properties are identified without invoking getters. Comparisons and
verdicts are unchanged. Reporter file failure falls back to raw stderr and fails
closed; if all output sinks fail, durable evidence cannot be guaranteed.
The runner retains stdout/stderr bytes and exit status separately before report
validation. Test/hook failures and final-hook evidence/cleanup categories remain
separate. Missing/invalid reporter output, nonzero status, incomplete titles or
evidence-write failure cannot produce PASS. Recording failure.json cannot replace
the primary error: both it and additional recording failures go to stderr.
Static path review only: single evidence failure, single cleanup failure, both
failures, BigInt assertion actual/expected, nested cause and multiple errors.
None of these fault paths has been exercised. The same 17 titles and rejection
goals are retained, including C09 caller guards only. Approved Linux execution
and fault-path validation require separate authorization. Whole process tree
cleanup remains unproven. amount null; authority false; consumption/rights
UNVERIFIED. Build REVIEWED means static build-byte review only.
