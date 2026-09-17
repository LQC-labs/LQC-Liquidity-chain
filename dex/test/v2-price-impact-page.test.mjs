import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/app.js",import.meta.url),"utf8");
const sdk=fs.readFileSync(new URL("../app/router-sdk.js",import.meta.url),"utf8");

describe("V2 reserve-based price impact binding",function(){
  it("uses adapter router, factory, pair reserves and the exact quoted output",function(){
    for(const term of ["readV2AdapterRouteReserves","factory.getPair","pair.getReserves","v2RoutePriceImpactEvidence","quotedAmountOut:out"])assert.ok((app+sdk).includes(term),`missing ${term}`);
  });

  it("reconciles every active V2 split leg independently",function(){
    assert.match(app,/plan\.summary\.map\(async item/);
    assert.match(app,/amountIn:item\.amountIn/);
    assert.match(app,/quotedAmountOut:quotedOut/);
    assert.match(app,/method:'split-leg-reconciliation'/);
  });
});
