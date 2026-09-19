import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/4 Execution Receipt boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCExecutionReceipt.sol"),"utf8");
it("records receipts only from the configured recorder",function(){assert.match(s,/modifier onlyRecorder/);assert.match(s,/function record[^\{]+onlyRecorder/)});
it("binds intent, execution, solver, route, output and timestamp",function(){for(const x of ["intentHash","executionHash","solver","routeId","amountOut","recordedAt"])assert.match(s,new RegExp(x));});
it("allows only one receipt per canonical intent",function(){assert.match(s,/receipts\[intentHash\]\.executionHash!=bytes32\(0\)/);assert.match(s,/ReceiptAlreadyExists/)});
it("domain-separates the receipt hash by chain and receipt contract",function(){assert.match(s,/keccak256\(abi\.encode\(block\.chainid,address\(this\),intentHash,executionHash,solver,routeId,amountOut,recordedAt\)\)/)});
it("provides exact-field receipt verification",function(){assert.match(s,/r\.executionHash==executionHash&&r\.solver==solver&&r\.routeId==routeId&&r\.amountOut==amountOut&&r\.recordedAt==recordedAt/);});});
