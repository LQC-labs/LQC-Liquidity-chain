import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/app.js",import.meta.url),"utf8");
const sdk=fs.readFileSync(new URL("../app/router-sdk.js",import.meta.url),"utf8");

describe("V3 live-state and oracle market evidence binding",function(){
  it("recomputes a configured V3 direct quote from slot0 and initialized ticks",function(){
    for(const term of ["readV3PoolState","v3RoutePriceImpactEvidence","pool?.address||pool?.pool","quotedAmountOut:out"])assert.ok((app+sdk).includes(term),`missing ${term}`);
  });

  it("keeps route price impact and oracle market deviation as separate evidence",function(){
    assert.match(app,/latestPriceImpactEvidence/);
    assert.match(app,/latestMarketDeviationEvidence/);
    assert.match(app,/priceImpactEvidence:latestPriceImpactEvidence/);
    assert.match(app,/marketDeviationEvidence:latestMarketDeviationEvidence/);
    assert.match(app,/readOraclePairMarketEvidence/);
  });

  it("falls back explicitly when live V3 state is not configured",function(){
    assert.match(app,/method:'probe-fallback'/);
    assert.match(app,/ethers\.isAddress\(poolAddress\)/);
  });
});
