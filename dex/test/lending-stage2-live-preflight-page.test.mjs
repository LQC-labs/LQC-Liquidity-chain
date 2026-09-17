import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../app/lending-stage2-live-preflight-testnet.html",import.meta.url),"utf8"),js=fs.readFileSync(new URL("../app/lending-stage2-live-preflight-testnet.js",import.meta.url),"utf8");
describe("LQC Lending Stage-2 live preflight page",function(){
  it("is explicitly read-only and requires two independent RPCs",function(){assert.match(html,/읽기 전용/);assert.match(html,/지갑 연결·서명·배포·거래·가스비가 없습니다/);assert.match(js,/bsc-testnet-rpc\.publicnode\.com/);assert.match(js,/독립된 QuickNode HTTPS 주소/);assert.doesNotMatch(js,/window\.ethereum|eth_sendTransaction|eth_requestAccounts/)});
  it("pins the verified Stage-1 dependencies and Stage-2 manifest",function(){for(const value of["0xcCf1B865d763Ed77558F4c8758B3926b5417DF6b","0xd7abc17e2EA4953C6dA495010fc1022C4d34F3f2","sha256:4aadaf0967412ba2c8ebf692a597fa22666fc08b942113cf89d69bfc75eb1d18"])assert.ok(js.includes(value));assert.match(js,/owner/);assert.match(js,/guardian/)});
  it("hashes init code as the exact UTF-8 manifest string",function(){assert.match(js,/new TextEncoder\(\)\.encode\(value\)/);assert.doesNotMatch(js,/ethers\.getBytes\(value\)/)});
  it("forces mobile browsers to load the corrected digest script",function(){assert.match(html,/lending-stage2-live-preflight-testnet\.js\?v=2/)});
  it("checks empty CREATE addresses, gas disagreement, balance and a 120 percent limit",function(){assert.match(js,/ethers\.getCreateAddress/);assert.match(js,/예상주소가 이미 사용 중/);assert.match(js,/가스 추정 편차가 5%/);assert.match(js,/value\*120n\+99n/);assert.match(js,/a\.balance<budget/)});
  it("removes the QuickNode fragment and never stores it",function(){assert.match(js,/history\.replaceState/);assert.match(js,/pagehide/);assert.doesNotMatch(js,/localStorage|sessionStorage/)});
});
