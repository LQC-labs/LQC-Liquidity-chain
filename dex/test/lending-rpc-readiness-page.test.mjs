import assert from "node:assert/strict";
import fs from "node:fs";

describe("Lending RPC readiness page",function(){
  const html=fs.readFileSync(new URL("../app/lending-rpc-readiness-testnet.html",import.meta.url),"utf8");
  const js=fs.readFileSync(new URL("../app/lending-rpc-readiness-testnet.js",import.meta.url),"utf8");

  it("checks two independent BSC testnet RPCs at one common block",function(){
    for(const value of ["eth_chainId","eth_blockNumber","eth_getBlockByNumber","eth_getTransactionCount","eth_getBalance"])assert.match(js,new RegExp(value));
    assert.match(js,/EXPECTED_CHAIN=97/);
    assert.match(js,/commonBlock=Math\.min/);
    assert.match(js,/blockHash!==observations\[1\]\.blockHash/);
  });

  it("keeps the private endpoint ephemeral and does not connect a wallet",function(){
    assert.match(html,/type="password"/);
    assert.match(js,/credentials:"omit"/);
    assert.match(js,/pagehide/);
    assert.doesNotMatch(js,/localStorage|sessionStorage|window\.ethereum|eth_sendTransaction|eth_requestAccounts/);
  });

  it("contains no embedded QuickNode credential or transaction path",function(){
    assert.doesNotMatch(html+js,/quiknode\.pro\/[^\s"']+/i);
    assert.doesNotMatch(html+js,/privateKey|mnemonic|sendTransaction|signer/i);
  });
});
