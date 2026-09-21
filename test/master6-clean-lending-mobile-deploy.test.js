import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js=fs.readFileSync("dex/app/master6-clean-lending-deploy-testnet.js","utf8");
const html=fs.readFileSync("dex/app/master6-clean-lending-deploy-testnet.html","utf8");

test("Master 6/12 mobile deploy page binds exact approved deployer, packet and chain",()=>{
  assert.match(js,/CHAIN_ID=97/);
  assert.match(js,/0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB/);
  assert.match(js,/sha256:dc538396aff204b65e19430033d5d11520c17b10239f49876d1364559fc3d84f/);
  assert.match(js,/sourceCommit!==SOURCE_COMMIT/);
  assert.match(js,/executionAuthorized!==true\|\|p\.activationAuthorized!==false\|\|p\.transactionOccurred!==false/);
});

test("Master 6/12 mobile deploy page is one-at-a-time and fail closed",()=>{
  assert.match(js,/pending nonce/);
  assert.match(js,/두 RPC bytecode 상태가 일치하지 않습니다/);
  assert.match(js,/current|현재 gas estimate/);
  assert.match(js,/eth_sendTransaction/);
  assert.match(js,/const s=await dualState\(\)/);
  assert.match(js,/receipt\.contractAddress/);
  assert.match(js,/runtime bytecode/);
  assert.doesNotMatch(js,/configurationActions.*eth_sendTransaction/s);
  assert.match(html,/Governance 설정과 Lending 시장 활성화는 수행하지 않습니다/);
});

test("Master 6/12 mobile deploy page hashes init code with packet UTF-8 semantics",()=>{
  assert.match(js,/new TextEncoder\(\)\.encode\(String\(value\)\)/);
  assert.match(js,/sha256Text\(d\.data\)/);
  assert.doesNotMatch(js,/hexData\.slice\(2\)/);
});

test("Master 6/12 mobile deploy page pins refreshed script cache version",()=>{
  assert.match(html,/master6-clean-lending-deploy-testnet\.js\?v=2/);
});
