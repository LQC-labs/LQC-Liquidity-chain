import assert from "node:assert/strict";
import fs from "node:fs";

describe("PancakeSwap V3 final read-only state page", function () {
  const source = fs.readFileSync(new URL("../app/pancake-v3-final-state-testnet.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../app/pancake-v3-final-state-testnet.html", import.meta.url), "utf8");

  it("contains no wallet connection or transaction submission", function () {
    assert.doesNotMatch(source, /eth_requestAccounts|eth_sendTransaction|eth_estimateGas/);
    assert.match(html, /지갑 거래 없음/);
    assert.match(html, /승인·서명·수수료 없이/);
  });

  it("checks the pool binding, liquidity, LP NFT owner and zero residual approvals", function () {
    assert.match(source, /token0.*token1.*fee.*liquidity/s);
    assert.match(source, /LP_TOKEN_ID = 37418n/);
    assert.match(source, /addressResult\(owner\).*SIGNER/s);
    assert.match(source, /tlqcAllowance !== 0n \|\| wbnbAllowance !== 0n/);
  });

  it("checks both recorded successful swap receipts against the official router", function () {
    assert.match(source, /0xcdc26400dd1df9abc773ada2f5bd597009fffe209e933128f9f0906350ef3727/);
    assert.match(source, /0x09af1ce5db45ff9750f91b763d1229bf15f0c12d54d5886412a98df670f4772e/);
    assert.match(source, /BigInt\(value.status\) !== 1n/);
    assert.match(source, /value.to.toLowerCase\(\) !== ROUTER.toLowerCase\(\)/);
  });

  it("records the successful final state with zero residual approvals", function () {
    const record = JSON.parse(fs.readFileSync(new URL("../deployments/pancake-v3-pool-bsc-testnet-97.json", import.meta.url)));
    const final = record.finalStateVerification;
    assert.equal(final.poolLiquidity, "500000000000000000000");
    assert.equal(final.lpNftTokenId, "37418");
    assert.equal(final.lpNftOwner, "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB");
    assert.deepEqual(final.routerResidualAllowances, { tLQC: "0", WBNB: "0" });
    assert.ok(final.forwardSwapConfirmationsObserved > 0);
    assert.ok(final.reverseSwapConfirmationsObserved > 0);
    assert.equal(final.status, "success");
  });
});
