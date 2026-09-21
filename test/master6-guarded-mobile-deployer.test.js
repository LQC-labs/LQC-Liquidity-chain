import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js=fs.readFileSync("dex/app/master6-clean-lending-deploy-testnet.js","utf8");
const html=fs.readFileSync("dex/app/master6-clean-lending-deploy-testnet.html","utf8");

test("Master 6/12 mobile deployer is pinned to chain 97, verified deployer, and frozen packet",()=>{
  assert.match(js,/const CHAIN_ID=97/);
  assert.match(js,/0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB/);
  assert.match(js,/sha256:dc538396aff204b65e19430033d5d11520c17b10239f49876d1364559fc3d84f/);
  assert.match(js,/activationAuthorized!==false/);
  assert.match(js,/market\?\.enabled!==false/);
});

test("Master 6/12 mobile deployer enforces one-at-a-time nonce, address, gas, receipt and runtime-code checks",()=>{
  assert.match(js,/eth_getTransactionCount/);
  assert.match(js,/pending nonce/);
  assert.match(js,/eth_getCode/);
  assert.match(js,/eth_estimateGas/);
  assert.match(js,/approvedGasLimit/);
  assert.match(js,/eth_getTransactionReceipt/);
  assert.match(js,/contractAddress/);
  assert.match(js,/currentIndex\+\+/);
  assert.match(html,/다음 승인 계약 1건 배포/);
});

test("Master 6/12 mobile deployer never embeds a private key or activates governance",()=>{
  assert.doesNotMatch(js,/PRIVATE_KEY|privateKey|DEPLOYER_PRIVATE_KEY/);
  assert.doesNotMatch(js,/execTransaction|setCore|configureMarket|setLiquidationEngine/);
  assert.match(html,/Market enabled=false/);
});
