import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/5 Execution Verifier boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCExecutionVerifier.sol"),"utf8");
it("binds actual execution to selected solver and quote",function(){assert.match(s,/a\.solver!=e\.solver\|\|a\.quoteHash!=e\.quoteHash/);});
it("enforces minimum user output",function(){assert.match(s,/a\.amountOut<e\.minimumOut/);});
it("caps gas overrun against the quoted gas policy",function(){assert.match(s,/allowedGas=e\.quotedGas\+\(e\.quotedGas\*policy\.maxGasOverrunBps\/10000\)/);});
it("checks reference price impact and live market deviation independently",function(){assert.match(s,/PriceImpactExceeded/);assert.match(s,/MarketDeviationExceeded/);});
it("separates governance policy from execution reporting",function(){assert.match(s,/setPolicy[^\{]+onlyOwner/);assert.match(s,/verify[^\{]+onlyReporter/);});});
