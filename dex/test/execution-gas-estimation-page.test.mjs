import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/app.js",import.meta.url),"utf8");

describe("Execution gas estimation UI binding",function(){
  it("estimates the actual transaction through canonical and wallet RPC evidence",function(){
    for(const term of ["sdk.estimateExecutionGas","canonical-rpc","wallet-rpc","transaction,sender:account","ethers.keccak256(transaction.data)","latestGasEvidence.gasUnits"])assert.ok(source.includes(term),`missing ${term}`);
  });

  it("labels configured units as an explicit last-resort execution fallback",function(){
    assert.match(source,/fallbackGasUnits:BigInt\(cfg\.executionFallbackGasUnits\|\|500000\)/);
    assert.doesNotMatch(source,/executionRpc\('estimateGas'/);
  });
});
