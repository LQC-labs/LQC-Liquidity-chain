import assert from "node:assert/strict";
import fs from "node:fs";

describe("Lending Stage-1 live preflight page",function(){
  const html=fs.readFileSync(new URL("../app/lending-stage1-live-preflight-testnet.html",import.meta.url),"utf8"),js=fs.readFileSync(new URL("../app/lending-stage1-live-preflight-testnet.js",import.meta.url),"utf8"),manifest=JSON.parse(fs.readFileSync(new URL("../deployments/lending-stage1-manifest-bsc-testnet-97.json",import.meta.url)));
  it("pins the exact two-contract manifest, roles and UTF-8 digest convention",function(){assert.match(js,new RegExp(manifest.manifestDigest));assert.match(js,/LQCOracleManager/);assert.match(js,/LQCInterestRateModel/);assert.match(js,/0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A/);assert.match(js,/0xDc8003a7046be67F257D294b2680C20988A6bC2B/);assert.match(js,/crypto\.subtle\.digest/);assert.match(js,/new TextEncoder\(\)\.encode\(data\)/);assert.doesNotMatch(js,/ethers\.getBytes\(data\)/)});
  it("checks both CREATE addresses and bounded live gas across two RPCs",function(){for(const value of["eth_chainId","eth_getBlockByNumber","eth_getTransactionCount","eth_getBalance","eth_getCode","eth_estimateGas","eth_gasPrice"])assert.match(js,new RegExp(value));assert.match(js,/CONTRACTS\.map/);assert.match(js,/\*100n>high\*5n/);assert.match(js,/value\*120n\+99n/);assert.match(js,/required=totalLimit\*gasPrice/)});
  it("is read-only and keeps the private endpoint ephemeral",function(){assert.match(html,/type="password"/);assert.match(js,/credentials:"omit"/);assert.match(js,/history\.replaceState/);assert.match(js,/pagehide/);assert.doesNotMatch(js,/localStorage|sessionStorage|window\.ethereum|eth_sendTransaction|eth_requestAccounts|privateKey|mnemonic/)});
  it("contains no embedded QuickNode credential",function(){assert.doesNotMatch(html+js,/quiknode\.pro\/[^\s"']+/i)});
});
