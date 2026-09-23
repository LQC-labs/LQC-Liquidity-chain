import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {assertProductionOracleMobileContext,assertProductionOracleMobileBudget,PRODUCTION_ORACLE_MOBILE} from "../app/futures/production-oracle-mobile-deployment.js";

describe("Master 7/7-7 production Oracle mobile packet",()=>{
  it("requires BSC Testnet and the approved deployer",()=>{
    assert.equal(assertProductionOracleMobileContext({chainId:"0x61",account:PRODUCTION_ORACLE_MOBILE.deployer}).chainId,97);
    assert.throws(()=>assertProductionOracleMobileContext({chainId:"0x38",account:PRODUCTION_ORACLE_MOBILE.deployer}),/chain 97/);
    assert.throws(()=>assertProductionOracleMobileContext({chainId:"0x61",account:"0x1111111111111111111111111111111111111111"}),/Wrong signer/);
  });
  it("protects 0.3 tBNB reserve and 0.1 tBNB cumulative spend cap",()=>{
    const one=10n**18n;
    const r=assertProductionOracleMobileBudget({startBalanceWei:one,currentBalanceWei:one,estimatedCostWei:10n**16n});
    assert.equal(r.projectedSpendWei,10n**16n);
    assert.throws(()=>assertProductionOracleMobileBudget({startBalanceWei:one,currentBalanceWei:95n*10n**16n,estimatedCostWei:6n*10n**16n}),/0.1 tBNB/);
    assert.throws(()=>assertProductionOracleMobileBudget({startBalanceWei:4n*10n**17n,currentBalanceWei:4n*10n**17n,estimatedCostWei:11n*10n**16n}),/0.1 tBNB|0.3 tBNB/);
  });
  it("never supports private-key input",()=>assert.equal(PRODUCTION_ORACLE_MOBILE.privateKeyInputSupported,false));
  it("uses actual TWAP observe success instead of an arbitrary cardinality threshold",()=>{
    const source=readFileSync(new URL("../app/futures/production-oracle-mobile-deployer-page.js",import.meta.url),"utf8");
    assert.doesNotMatch(source,/Number\(slot\[3\]\)<2/);
    assert.match(source,/observe",\[\[c\.window,0\]\]/);
    assert.match(source,/observeReady:true/);
  });
});
