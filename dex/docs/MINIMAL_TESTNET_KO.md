# LQC DEX 최소 테스트넷 실행 안내

이 안내는 BSC Testnet에서 준비한 tLQC와 소량의 tBNB로 기본 스왑 풀만 확인하는 절차입니다.

## 준비물

- TokenPocket 지갑
- BSC Testnet tBNB 약 0.15
- 준비한 tLQC 컨트랙트 주소
- 배포자 지갑의 개인키(내 컴퓨터에서만 입력)

tLQC 주소:

`0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc`

## 실행

LQC DEX 저장소의 `dex` 폴더에서 실행합니다.

```bash
npm ci
npm run compile

export ALLOW_MINIMAL_TESTNET=true
export BSC_TESTNET_RPC_URL="BSC Testnet RPC 주소"
export DEPLOYER_PRIVATE_KEY="내 지갑 개인키"
export WBNB_ADDRESS="BSC Testnet WBNB 주소"
export TEST_LQC_ADDRESS="0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc"
export MINIMAL_BNB_LIQUIDITY="0.05"

npm run deploy:minimal:testnet
```

## 주의

- `DEPLOYER_PRIVATE_KEY`는 채팅, GitHub, 메신저에 절대 보내지 않습니다.
- TokenPocket의 복구문구는 누구에게도 보내지 않습니다.
- 이 배포는 기본 Factory·Router와 한 개의 tLQC/tBNB 풀만 확인합니다.
- Router 2.0, Safe, timelock, Risk, Guardian은 포함되지 않습니다.
- 실제 운영이나 메인넷 배포용이 아닙니다.
- 배포 결과는 `deployments/minimal-bsc-testnet-97.local.json`에 저장됩니다.
