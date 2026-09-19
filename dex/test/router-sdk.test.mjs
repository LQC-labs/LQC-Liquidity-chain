import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { ethers } from "ethers";

const source = fs.readFileSync(new URL("../app/router-sdk.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context, { filename: "lqc-router-sdk.js" });
const sdk = context.globalThis.LQCRouterSDK;

describe("LQC Router browser SDK", function () {
  const tokenA = "0x0000000000000000000000000000000000000001";
  const tokenB = "0x0000000000000000000000000000000000000002";
  const tokenC = "0x0000000000000000000000000000000000000003";

  it("encodes V2 and approved V3 direct or multi-hop routes", function () {
    const v2 = sdk.encodeRoute({ kind: "v2" }, [tokenA, tokenB], ethers);
    assert.deepEqual(Array.from(ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], v2)[0]), [tokenA, tokenB]);
    const dex = { kind: "v3", pools: [
      { tokenA, tokenB, fee: 500 }, { tokenA: tokenB, tokenB: tokenC, fee: 2500 }
    ] };
    assert.equal(
      sdk.encodeRoute(dex, [tokenA, tokenB, tokenC], ethers),
      ethers.solidityPacked(["address", "uint24", "address", "uint24", "address"], [tokenA, 500, tokenB, 2500, tokenC])
    );
  });

  it("encodes the same reviewed path across multiple DEX adapters", function () {
    const expected = sdk.encodeRoute({ kind: "v2" }, [tokenA, tokenB], ethers);
    assert.deepEqual(sdk.encodeRoutes([{ kind: "v2" }, { kind: "v2" }], [tokenA, tokenB], ethers), [expected, expected]);
  });

  it("rejects unapproved V3 pools, excessive hops, and excessive slippage", function () {
    assert.throws(() => sdk.encodeRoute({ kind: "v3", pools: [] }, [tokenA, tokenB], ethers));
    assert.throws(() => sdk.encodeRoute({ kind: "v2" }, [tokenA, tokenB, tokenC, tokenA, tokenB], ethers));
    assert.throws(() => sdk.minimumAmountOut(100n, 20.01));
    assert.equal(sdk.minimumAmountOut(10000n, 1), 9900n);
  });

  it("calculates price impact and configured gas cost without floating-point loss", function () {
    assert.equal(sdk.priceImpactBps(1000n, 970n, 10n, 10n), 300);
    assert.equal(sdk.priceImpactBps(1000n, 1010n, 10n, 10n), 0);
    assert.equal(sdk.priceImpactFromExpected(950n, 1000n), 500);
    assert.equal(sdk.priceImpactFromExpected(1001n, 1000n), 0);
    assert.equal(sdk.estimatedGasWei({ gasUnits: 250000 }, 3_000_000_000n), 750_000_000_000_000n);
    assert.equal(sdk.routeFeeBps({ kind: "v2", feeBps: 30 }, [tokenA, tokenB]), 30);
    assert.equal(sdk.routeFeeBps({ kind: "v3", pools: [{ tokenA, tokenB, fee: 500 }] }, [tokenA, tokenB]), 5);
    assert.throws(() => sdk.priceImpactBps(0n, 1n, 1n, 1n));
    assert.throws(() => sdk.priceImpactFromExpected(1n, 0n));
  });

  it("summarizes only active split routes as deterministic percentages", function () {
    const dexes = [{ name: "A" }, { name: "B" }, { name: "C" }];
    assert.deepEqual(
      sdk.summarizeSplit(dexes, [600n, 0n, 400n], 1000n).map(({ dex, percent }) => [dex.name, percent]),
      [["A", 60], ["C", 40]]
    );
    assert.throws(() => sdk.summarizeSplit(dexes, [1n], 1n));
  });

  it("selects split routing only when its gas-adjusted net output is higher", function () {
    assert.equal(sdk.isSplitNetBetter(1000n, 20n, 981n), true);
    assert.equal(sdk.isSplitNetBetter(1000n, 20n, 980n), false);
    assert.equal(sdk.isSplitNetBetter(10n, 20n, 1n), true);
    assert.throws(() => sdk.isSplitNetBetter(1n, -1n, 1n));
  });
  it("turns wallet, liquidity, slippage, and risk failures into actionable Korean guidance", function () {
    assert.deepEqual(
      { ...sdk.explainSwapError({ code: "ACTION_REJECTED" }) },
      { code: "USER_REJECTED", message: "지갑에서 거래가 취소되었습니다.", action: "원하시면 견적을 다시 확인한 뒤 재시도하세요.", retryable: true }
    );
    assert.equal(sdk.explainSwapError({ message: "execution reverted: NoValidQuote()" }).code, "NO_ROUTE");
    assert.equal(sdk.explainSwapError({ message: "execution reverted: InsufficientOutput()" }).code, "PRICE_MOVED");
    assert.equal(sdk.explainSwapError({ message: "daily cap exceeded" }).retryable, false);
    assert.equal(sdk.explainSwapError({ message: "RouteChangedDuringApproval" }).code, "ROUTE_CHANGED");
  });

  it("ranks executable primary and fallback routes by net output and priority", function () {
    const ranked = sdk.rankRouteQuotes([
      { name: "A", amountOut: 1000n, cost: 30n, priority: 2 },
      { name: "B", amountOut: 990n, cost: 10n, priority: 1 },
      { name: "C", amountOut: 980n, cost: 0n, priority: 3 },
      null
    ]);
    assert.deepEqual(ranked.map(item => item.name), ["C", "B", "A"]);
    assert.equal(ranked[0].netAmountOut, 980n);
    assert.equal(ranked[0].amountOut, 980n);
    assert.deepEqual(sdk.rankRouteQuotes([{ name: "zero", amountOut: 0n }]), []);
  });

  it("prefers a lower gross quote when it delivers more after route gas", function () {
    const expensive = { name: "High output", dexId: "0x01", routeData: "0xaa", amountOut: 1_010n, cost: 50n, priority: 10 };
    const efficient = { name: "Efficient", dexId: "0x02", routeData: "0xbb", amountOut: 1_000n, cost: 10n, priority: 1 };
    const ranked = sdk.rankRouteQuotes([expensive, efficient]);
    assert.equal(ranked[0].name, "Efficient");
    assert.equal(ranked[0].dexId, "0x02");
    assert.equal(ranked[0].routeData, "0xbb");
    assert.equal(ranked[0].netAmountOut, 990n);
  });

  it("restores a remembered wallet only when an account and the expected chain are present", function () {
    assert.equal(sdk.walletSessionState([], true, "0x61", "0x61"), "disconnected");
    assert.equal(sdk.walletSessionState([tokenA], false, "0x61", "0x61"), "disconnected");
    assert.equal(sdk.walletSessionState([tokenA], true, "0x1", "0x61"), "wrong_network");
    assert.equal(sdk.walletSessionState([tokenA], true, "0x61", "0x61"), "connected");
  });

  it("binds execution to the starting wallet account and BSC testnet", function () {
    const valid=sdk.validateExecutionSession(tokenA,[tokenA],"0x61","0x61",ethers);
    assert.equal(valid.valid,true); assert.equal(valid.account,tokenA.toLowerCase()); assert.equal(valid.chainId,97);
    assert.throws(()=>sdk.validateExecutionSession(tokenA,[tokenB],"0x61","0x61",ethers),/account changed/);
    assert.throws(()=>sdk.validateExecutionSession(tokenA,[tokenA],"0x38","0x61",ethers),/chain changed/);
    assert.throws(()=>sdk.validateExecutionSession(tokenA,[],"0x61","0x61",ethers),/account unavailable/);
    assert.throws(()=>sdk.validateExecutionSession(tokenA,[tokenA],"bad","0x61",ethers),/chain unavailable/);
  });

  it("rejects a pending nonce change before wallet submission", function () {
    assert.deepEqual({...sdk.validatePendingNonce(7,7)},{valid:true,nonce:7});
    assert.throws(()=>sdk.validatePendingNonce(7,8),/nonce changed/);
    assert.throws(()=>sdk.validatePendingNonce(-1,0),/Invalid pending nonce/);
    assert.throws(()=>sdk.validatePendingNonce(1.5,1),/Invalid pending nonce/);
  });

  it("requires approval only when the selected spender allowance is insufficient", function () {
    assert.equal(sdk.requiresTokenApproval(99n, 100n), true);
    assert.equal(sdk.requiresTokenApproval(100n, 100n), false);
    assert.equal(sdk.requiresTokenApproval(101n, 100n), false);
    assert.throws(() => sdk.requiresTokenApproval(-1n, 100n));
    assert.throws(() => sdk.requiresTokenApproval(100n, 0n));
  });

  it("uses exact approvals and clears a smaller nonzero allowance first", function () {
    assert.deepEqual([...sdk.exactApprovalAmounts(500n,400n)],[]);
    assert.deepEqual([...sdk.exactApprovalAmounts(0n,400n)],[400n]);
    assert.deepEqual([...sdk.exactApprovalAmounts(10n,400n)],[0n,400n]);
    assert.throws(()=>sdk.exactApprovalAmounts(-1n,400n),/Invalid approval state/);
    assert.throws(()=>sdk.exactApprovalAmounts(0n,0n),/Invalid approval state/);
  });

  it("creates a verifiable proof that a single route has the highest gas-adjusted output", function () {
    const dexA = ethers.id("DEX_A"), dexB = ethers.id("DEX_B");
    const proof = sdk.buildBestExecutionProof({ chainId: 97, quoteBlock: 12345, expiresAt: 1789000000,
      tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n, slippageBps: 50,
      candidates: [
        { dexId: dexA, name: "A", amountOut: 1010n, cost: 30n, priceImpactBps: 12, routeDataHash: ethers.id("route-a") },
        { dexId: dexB, name: "B", amountOut: 1000n, cost: 10n, priceImpactBps: 8, routeDataHash: ethers.id("route-b") }
      ], plan: { kind: "single", cost: 10n, legs: [{ dexId: dexB, amountIn: 1000n, expectedOut: 1000n, minimumOut: 995n }] }
    }, ethers);
    assert.equal(proof.bestSingle.dexId, dexB.toLowerCase());
    assert.equal(proof.plan.netAmountOut, "990");
    assert.equal(sdk.verifyBestExecutionProof(proof, ethers), true);
    assert.equal("routeData" in proof.candidates[0], false);
  });

  it("proves a split route only when it beats the best single route after gas", function () {
    const dexA = ethers.id("DEX_A"), dexB = ethers.id("DEX_B");
    const input = { chainId: 97, quoteBlock: 12345, expiresAt: 1789000000,
      tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n, slippageBps: 50,
      candidates: [
        { dexId: dexA, name: "A", amountOut: 1000n, cost: 20n, routeDataHash: ethers.id("route-a") },
        { dexId: dexB, name: "B", amountOut: 990n, cost: 20n, routeDataHash: ethers.id("route-b") }
      ], plan: { kind: "split", cost: 30n, legs: [
        { dexId: dexA, amountIn: 600n, expectedOut: 620n, minimumOut: 610n },
        { dexId: dexB, amountIn: 400n, expectedOut: 410n, minimumOut: 400n }
      ] } };
    const proof = sdk.buildBestExecutionProof(input, ethers);
    assert.equal(proof.plan.netAmountOut, "1000");
    assert.equal(proof.improvementBps, 204);
    const weak = structuredClone(input); weak.plan.legs[1].expectedOut = 380n; weak.plan.legs[1].minimumOut = 370n;
    assert.throws(() => sdk.buildBestExecutionProof(weak, ethers), /does not improve/);
  });

  it("detects proof tampering and rejects unreviewed or inconsistent routes", function () {
    const dexA = ethers.id("DEX_A");
    const input = { chainId: 97, quoteBlock: 12345, expiresAt: 1789000000,
      tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n, slippageBps: 50,
      candidates: [{ dexId: dexA, name: "A", amountOut: 1000n, cost: 10n, routeDataHash: ethers.id("route-a") }],
      plan: { kind: "single", cost: 10n, legs: [{ dexId: dexA, amountIn: 1000n, expectedOut: 1000n, minimumOut: 990n }] } };
    const proof = sdk.buildBestExecutionProof(input, ethers);
    proof.plan.minimumOut = "1";
    assert.equal(sdk.verifyBestExecutionProof(proof, ethers), false);
    const unknown = structuredClone(input); unknown.plan.legs[0].dexId = ethers.id("UNKNOWN");
    assert.throws(() => sdk.buildBestExecutionProof(unknown, ethers), /Invalid proof leg/);
    const inconsistent = structuredClone(input); inconsistent.plan.legs[0].amountIn = 999n;
    assert.throws(() => sdk.buildBestExecutionProof(inconsistent, ethers), /allocation/);
  });

  function singleRouteProof(expiresAt = 1789000000) {
    const dexA = ethers.id("DEX_A");
    return sdk.buildBestExecutionProof({ chainId: 97, quoteBlock: 12345, expiresAt,
      tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n, slippageBps: 100,
      candidates: [{ dexId: dexA, name: "A", amountOut: 1000n, cost: 10n, routeDataHash: ethers.id("route-a") }],
      plan: { kind: "single", cost: 10n, legs: [{ dexId: dexA, amountIn: 1000n, expectedOut: 1000n, minimumOut: 990n }] }
    }, ethers);
  }

  it("binds execution-time route legs to the displayed proof", function () {
    const proof = singleRouteProof(), current = { chainId: 97, tokenIn: tokenA, tokenOut: tokenB,
      amountIn: 1000n, kind: "single", legs: [{ dexId: proof.plan.legs[0].dexId, amountIn: 1000n, expectedOut: 995n }] };
    const result = sdk.validateExecutionPlanProof(proof, current, ethers, proof.expiresAt);
    assert.equal(result.valid, true); assert.equal(result.proofHash, proof.proofHash.toLowerCase());
    assert.throws(() => sdk.validateExecutionPlanProof(proof, current, ethers, proof.expiresAt + 1), /StaleProof/);
    assert.throws(() => sdk.validateExecutionPlanProof(proof, { ...current, amountIn: 999n }, ethers, proof.expiresAt), /ProofTradeChanged/);
    assert.throws(() => sdk.validateExecutionPlanProof(proof, { ...current, legs: [{ ...current.legs[0], dexId: ethers.id("OTHER") }] }, ethers, proof.expiresAt), /ProofRouteChanged/);
    assert.throws(() => sdk.validateExecutionPlanProof(proof, { ...current, legs: [{ ...current.legs[0], expectedOut: 989n }] }, ethers, proof.expiresAt), /ProofRouteChanged/);
  });

  it("binds the selected proof to one sender, target, calldata, value, nonce, and deadline", function () {
    const proof = singleRouteProof(), sender = tokenA, target = tokenC;
    const intent = sdk.buildExecutionIntent(proof, { sender, target, calldataHash: ethers.id("swap-calldata"),
      value: 0n, nonce: 7, deadline: 1788999990 }, ethers);
    assert.equal(sdk.verifyExecutionIntent(intent, proof, ethers), true);
    const tampered = structuredClone(intent); tampered.nonce = 8;
    assert.equal(sdk.verifyExecutionIntent(tampered, proof, ethers), false);
    assert.equal(sdk.verifyExecutionIntent(null, proof, ethers), false);
    const invalidShape = structuredClone(intent); invalidShape.deadline = proof.expiresAt + 1;
    assert.equal(sdk.verifyExecutionIntent(invalidShape, proof, ethers), false);
    const negativeValue = structuredClone(intent); negativeValue.value = "-1";
    assert.equal(sdk.verifyExecutionIntent(negativeValue, proof, ethers), false);
    const malformedValue = structuredClone(intent); malformedValue.value = "not-a-number";
    assert.equal(sdk.verifyExecutionIntent(malformedValue, proof, ethers), false);
    assert.throws(() => sdk.buildExecutionIntent(proof, { sender, target, calldataHash: ethers.id("swap-calldata"),
      value: 0n, nonce: 7, deadline: 1789000001 }, ethers), /execution intent/);
  });

  it("creates intent-bound settlement evidence and rejects replay or transaction substitution", function () {
    const proof = singleRouteProof(), execution = { chainId: 97, transactionHash: ethers.id("intent-tx"),
      blockHash: ethers.id("intent-block"), blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 995n, status: 1, sender: tokenA, target: tokenC,
      calldataHash: ethers.id("swap-calldata"), value: 0n, nonce: 7 };
    const intent = sdk.buildExecutionIntent(proof, { sender: execution.sender, target: execution.target,
      calldataHash: execution.calldataHash, value: execution.value, nonce: execution.nonce, deadline: 1788999999 }, ethers);
    const evidence = sdk.buildIntentBoundSettlementReceipt(proof, intent, execution, ethers);
    assert.equal(sdk.verifyIntentBoundSettlementReceipt(evidence, proof, intent, ethers), true);
    assert.throws(() => sdk.buildIntentBoundSettlementReceipt(proof, intent, { ...execution, nonce: 8 }, ethers), /match intent/);
    const tampered = structuredClone(evidence); tampered.intentHash = ethers.id("substituted");
    assert.equal(sdk.verifyIntentBoundSettlementReceipt(tampered, proof, intent, ethers), false);
  });

  it("validates a deterministic multi-DEX quote API request and proof response", function () {
    const proof = singleRouteProof(1788999980);
    const request = sdk.buildQuoteApiRequest({ chainId: 97, tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n,
      requestedAt: 1788999940, expiresAt: 1789000000, clientRequestId: "mobile-quote-7" }, ethers);
    const result = sdk.validateQuoteApiResponse(request, { requestHash: request.requestHash.toLowerCase(), proof }, ethers, 1788999960);
    assert.equal(result.valid, true); assert.equal(result.candidateCount, 1); assert.equal(result.proofHash, proof.proofHash.toLowerCase());
    assert.equal(result.expiresAt, proof.expiresAt);
    assert.throws(() => sdk.validateQuoteApiResponse(request, { requestHash: request.requestHash, proof }, ethers, 1788999981), /proof mismatch/);
    const wrong = structuredClone(proof); wrong.amountIn = "999";
    assert.throws(() => sdk.validateQuoteApiResponse(request, { requestHash: request.requestHash, proof: wrong }, ethers, 1788999960), /proof mismatch/);
    const shorterRequest = sdk.buildQuoteApiRequest({ chainId: 97, tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n,
      requestedAt: 1788999940, expiresAt: 1788999970, clientRequestId: "short-request" }, ethers);
    assert.throws(() => sdk.validateQuoteApiResponse(shorterRequest,
      { requestHash: shorterRequest.requestHash, proof }, ethers, 1788999960), /proof mismatch/);
    assert.throws(() => sdk.buildQuoteApiRequest({ chainId: 56 }, ethers), /quote API request/);
    assert.throws(() => sdk.buildQuoteApiRequest({ chainId: 97, tokenIn: tokenA, tokenOut: tokenB, amountIn: 1000n,
      requestedAt: 1788999900, expiresAt: 1788999960 }, ethers), /request id/);
    assert.throws(() => sdk.buildQuoteApiRequest({ chainId: 97, tokenIn: tokenA, tokenOut: tokenB,
      amountIn: ethers.MaxUint256 + 1n, requestedAt: 1788999900, expiresAt: 1788999960,
      clientRequestId: "oversized" }, ethers), /quote API request/);
    assert.throws(() => sdk.buildQuoteApiRequest({ chainId: 97, tokenIn: tokenA, tokenOut: tokenB,
      amountIn: 1000n, requestedAt: 1788999900, expiresAt: 1788999960,
      clientRequestId: "unsafe request" }, ethers), /request id/);
  });

  it("maps failures to deterministic mobile recovery actions", function () {
    assert.equal(sdk.recoveryActionForError(new Error("StaleQuote")), "REFRESH_QUOTE");
    assert.equal(sdk.recoveryActionForError({ code: "NETWORK_ERROR" }), "SWITCH_NETWORK");
    assert.equal(sdk.recoveryActionForError({ code: "ACTION_REJECTED" }), "RETRY");
    assert.equal(sdk.recoveryActionForError({ code: "INSUFFICIENT_FUNDS" }), "ADD_TEST_GAS");
    assert.equal(sdk.recoveryActionForError(new Error("unexpected")), "REVIEW");
  });

  it("binds a valid best-execution proof to its successful settlement", function () {
    const proof = singleRouteProof();
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: ethers.id("tx"),
      blockHash: ethers.id("block"), blockNumber: 12350, settledAt: 1788999999,
      recipient: tokenA, actualAmountOut: 995n, status: 1 }, ethers);
    assert.equal(receipt.proofHash, proof.proofHash.toLowerCase());
    assert.equal(receipt.minimumSatisfied, true);
    assert.equal(receipt.executionDeltaBps, -50);
    assert.equal(sdk.verifySettlementReceipt(receipt, proof, ethers), true);
  });

  it("rejects failed, expired, cross-chain, and below-minimum settlements", function () {
    const proof = singleRouteProof();
    const base = { chainId: 97, transactionHash: ethers.id("tx"), blockHash: ethers.id("block"),
      blockNumber: 12350, settledAt: 1788999999, recipient: tokenA, actualAmountOut: 995n, status: 1 };
    assert.throws(() => sdk.buildSettlementReceipt(proof, { ...base, status: 0 }, ethers), /result/);
    assert.throws(() => sdk.buildSettlementReceipt(proof, { ...base, chainId: 56 }, ethers), /context/);
    assert.throws(() => sdk.buildSettlementReceipt(proof, { ...base, settledAt: 1789000001 }, ethers), /validity/);
    assert.throws(() => sdk.buildSettlementReceipt(proof, { ...base, actualAmountOut: 989n }, ethers), /minimum output/);
  });

  it("detects settlement tampering and proof substitution", function () {
    const proof = singleRouteProof();
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: ethers.id("tx"),
      blockHash: ethers.id("block"), blockNumber: 12350, settledAt: 1788999999,
      recipient: tokenA, actualAmountOut: 995n, status: 1 }, ethers);
    const tampered = structuredClone(receipt); tampered.actualAmountOut = "999";
    assert.equal(sdk.verifySettlementReceipt(tampered, proof, ethers), false);
    const inconsistent = structuredClone(receipt); inconsistent.actualAmountOut = "999";
    const { settlementHash, ...payload } = inconsistent;
    inconsistent.settlementHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)));
    assert.equal(sdk.verifySettlementReceipt(inconsistent, proof, ethers), false);
    const otherProof = structuredClone(proof); otherProof.proofHash = ethers.id("other-proof");
    assert.equal(sdk.verifySettlementReceipt(receipt, otherProof, ethers), false);
  });

  it("verifies canonical confirmations and decoded output transfer logs", async function () {
    const proof = singleRouteProof(), txHash = ethers.id("tx"), blockHash = ethers.id("block");
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: txHash,
      blockHash, blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 995n, status: 1 }, ethers);
    const transfer = { address: tokenB, topics: [ethers.id("Transfer(address,address,uint256)"),
      ethers.zeroPadValue(tokenB, 32), ethers.zeroPadValue(tokenA, 32)], data: ethers.toBeHex(995n, 32) };
    const provider = { getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash,
      blockNumber: 12350, logs: [transfer] }), getBlock: async () => ({ hash: blockHash }),
      getBlockNumber: async () => 12352 };
    const result = await sdk.verifyCanonicalSettlement(receipt, proof, provider, ethers, 3);
    assert.equal(result.valid, true);
    assert.equal(result.confirmations, 3);
    assert.equal(result.decodedAmountOut, "995");
  });

  it("fails closed on reorgs, weak finality, or mismatched output logs", async function () {
    const proof = singleRouteProof(), txHash = ethers.id("tx"), blockHash = ethers.id("block");
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: txHash,
      blockHash, blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 995n, status: 1 }, ethers);
    const transfer = { address: tokenB, topics: [ethers.id("Transfer(address,address,uint256)"),
      ethers.zeroPadValue(tokenB, 32), ethers.zeroPadValue(tokenA, 32)], data: ethers.toBeHex(994n, 32) };
    const base = { getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash,
      blockNumber: 12350, logs: [transfer] }), getBlock: async () => ({ hash: blockHash }),
      getBlockNumber: async () => 12352 };
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, base, ethers, 3), /output log mismatch/);
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, { ...base,
      getBlock: async () => ({ hash: ethers.id("reorg") }) }, ethers, 3), /not canonical/);
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, { ...base,
      getBlockNumber: async () => 12351 }, ethers, 3), /lacks confirmations/);
  });

  it("verifies native BNB settlement from the reviewed Native Router event", async function () {
    const proof = singleRouteProof(), txHash = ethers.id("native-tx"), blockHash = ethers.id("native-block"), nativeRouter = "0x00000000000000000000000000000000000000c1";
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: txHash,
      blockHash, blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 995n, status: 1 }, ethers);
    const event = { address: nativeRouter, topics: [ethers.id("NativeSwapExecuted(address,address,address,bool,uint256,uint256)"),
      ethers.zeroPadValue(tokenB, 32), ethers.zeroPadValue(tokenA, 32), ethers.zeroPadValue(tokenA, 32)],
      data: ethers.AbiCoder.defaultAbiCoder().encode(["bool", "uint256", "uint256"], [false, 1000n, 995n]) };
    const provider = { getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash,
      blockNumber: 12350, logs: [event] }), getBlock: async () => ({ hash: blockHash }),
      getBlockNumber: async () => 12354 };
    const result = await sdk.verifyCanonicalNativeSettlement(receipt, proof, provider, nativeRouter, ethers, 3);
    assert.equal(result.valid, true);
    assert.equal(result.kind, "native-bnb");
    assert.equal(result.decodedAmountOut, "995");
  });

  it("rejects spoofed, duplicate, or inconsistent native settlement events", async function () {
    const proof = singleRouteProof(), txHash = ethers.id("native-tx"), blockHash = ethers.id("native-block"), nativeRouter = "0x00000000000000000000000000000000000000c1";
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: txHash,
      blockHash, blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 995n, status: 1 }, ethers);
    const event = { address: nativeRouter, topics: [ethers.id("NativeSwapExecuted(address,address,address,bool,uint256,uint256)"),
      ethers.zeroPadValue(tokenB, 32), ethers.zeroPadValue(tokenA, 32), ethers.zeroPadValue(tokenA, 32)],
      data: ethers.AbiCoder.defaultAbiCoder().encode(["bool", "uint256", "uint256"], [false, 1000n, 994n]) };
    const provider = { getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash,
      blockNumber: 12350, logs: [event] }), getBlock: async () => ({ hash: blockHash }),
      getBlockNumber: async () => 12354 };
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, provider, nativeRouter, ethers), /amount mismatch/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, { ...provider,
      getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash, blockNumber: 12350, logs: [event, event] })
    }, nativeRouter, ethers), /event mismatch/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, provider,
      "0x00000000000000000000000000000000000000c2", ethers), /event mismatch/);
  });

  it("covers helper and best-execution fail-closed boundaries", function () {
    assert.throws(() => sdk.estimatedGasWei({}, -1n), /gas price/);
    assert.throws(() => sdk.routeFeeBps({ kind: "v3", pools: [] }, [tokenA, tokenB]), /approved V3 pool/);
    assert.throws(() => sdk.rankRouteQuotes(null), /route quotes/);
    assert.deepEqual(sdk.rankRouteQuotes([{ amountOut: 1n, cost: 2n }]), []);
    assert.equal(sdk.estimatedGasWei({}, 2n, true), 520000n);
    const dex = ethers.id("DEX"), base = { chainId: 97, quoteBlock: 10, expiresAt: 100,
      tokenIn: tokenA, tokenOut: tokenB, amountIn: 100n, slippageBps: 100,
      candidates: [{ dexId: dex, amountOut: 110n, cost: 1n, routeDataHash: ethers.id("route") }],
      plan: { kind: "single", cost: 1n, legs: [{ dexId: dex, amountIn: 100n, expectedOut: 110n, minimumOut: 108n }] } };
    assert.throws(() => sdk.buildBestExecutionProof({ ...base, chainId: 56 }, ethers), /context/);
    assert.throws(() => sdk.buildBestExecutionProof({ ...base, tokenOut: tokenA }, ethers), /trade/);
    assert.throws(() => sdk.buildBestExecutionProof({ ...base, candidates: [] }, ethers), /routes/);
    assert.throws(() => sdk.buildBestExecutionProof({ ...base, candidates: [{ ...base.candidates[0], cost: 111n }] }, ethers), /No executable/);
    assert.throws(() => sdk.buildBestExecutionProof({ ...base, plan: { ...base.plan,
      legs: [{ ...base.plan.legs[0], expectedOut: 111n }] } }, ethers), /not best execution/);
    assert.throws(() => sdk.buildBestExecutionProof({ ...base, slippageBps: 2001 }, ethers), /policy/);
    assert.equal(sdk.verifyBestExecutionProof(null, ethers), false);
  });

  it("covers canonical verifier transport and receipt failure boundaries", async function () {
    const proof = singleRouteProof(), txHash = ethers.id("tx"), blockHash = ethers.id("block");
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: txHash,
      blockHash, blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 1000n, status: 1 }, ethers);
    assert.equal(receipt.executionDeltaBps, 0);
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, {}, ethers), /canonical verifier/);
    const base = { getTransactionReceipt: async () => null, getBlock: async () => ({ hash: blockHash }),
      getBlockNumber: async () => 12352 };
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, base, ethers), /not successful/);
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, { ...base,
      getTransactionReceipt: async () => ({ status: 1, hash: ethers.id("wrong"), blockHash, blockNumber: 12350 })
    }, ethers), /receipt mismatch/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, {}, tokenA, ethers), /native verifier/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, base, tokenA, ethers), /not successful/);
    const invalid = structuredClone(receipt); invalid.settlementHash = ethers.id("invalid");
    await assert.rejects(sdk.verifyCanonicalSettlement(invalid, proof, base, ethers), /Invalid settlement receipt/);
  });

  it("maps remaining wallet execution failures to explicit user guidance", function () {
    assert.equal(sdk.explainSwapError({ code: "INSUFFICIENT_FUNDS" }).code, "INSUFFICIENT_GAS");
    assert.equal(sdk.explainSwapError({ message: "allowance too low" }).code, "APPROVAL_REQUIRED");
    assert.equal(sdk.explainSwapError({ message: "RouteChangedDuringApproval" }).code, "ROUTE_CHANGED");
    assert.equal(sdk.explainSwapError({ code: "NETWORK_ERROR" }).code, "NETWORK_ERROR");
    assert.equal(sdk.explainSwapError({ message: "unexpected provider failure" }).code, "UNKNOWN");
  });

  it("rejects malformed proof payloads and degraded canonical evidence", async function () {
    const dex = ethers.id("DEX"), invalidCandidate = { chainId: 97, quoteBlock: 1, expiresAt: 100,
      tokenIn: tokenA, tokenOut: tokenB, amountIn: 100n, slippageBps: 100,
      candidates: [{ dexId: dex, amountOut: 110n, cost: -1n, routeDataHash: ethers.id("route") }],
      plan: { kind: "single", cost: 1n, legs: [{ dexId: dex, amountIn: 100n, expectedOut: 110n, minimumOut: 108n }] } };
    assert.throws(() => sdk.buildBestExecutionProof(invalidCandidate, ethers), /candidate/);
    assert.throws(() => sdk.buildSettlementReceipt({ proofHash: ethers.id("bad") }, {}, ethers), /best execution proof/);

    const proof = singleRouteProof(), txHash = ethers.id("tx"), blockHash = ethers.id("block");
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: txHash,
      blockHash, blockNumber: 12350, settledAt: 1788999999, recipient: tokenA,
      actualAmountOut: 995n, status: 1 }, ethers);
    const rehash = value => { const copy = structuredClone(value); delete copy.settlementHash;
      return { ...copy, settlementHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(copy))) }; };
    assert.equal(sdk.verifySettlementReceipt(rehash({ ...receipt, tokenOut: tokenA }), proof, ethers), false);
    assert.equal(sdk.verifySettlementReceipt(rehash({ ...receipt, blockNumber: 1 }), proof, ethers), false);
    assert.equal(sdk.verifySettlementReceipt(rehash({ ...receipt, actualAmountOut: "1" }), proof, ethers), false);
    assert.equal(sdk.verifySettlementReceipt(rehash({ ...receipt, actualAmountOut: "bad" }), proof, ethers), false);

    const transfer = { address: tokenB, topics: [ethers.id("Transfer(address,address,uint256)"),
      ethers.zeroPadValue(tokenB, 32), ethers.zeroPadValue(tokenA, 32)], data: ethers.toBeHex(995n, 32) };
    const canonical = { getTransactionReceipt: async () => ({ status: 1, transactionHash: txHash,
      blockHash, blockNumber: 12350, logs: [{ address: tokenA, topics: [], data: "0x" }, transfer] }),
      getBlock: async () => ({ hash: blockHash }), getBlockNumber: async () => 12352 };
    assert.equal((await sdk.verifyCanonicalSettlement(receipt, proof, canonical, ethers)).valid, true);
    await assert.rejects(sdk.verifyCanonicalSettlement(receipt, proof, { ...canonical,
      getBlock: async () => null }, ethers), /not canonical/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, { ...canonical,
      getTransactionReceipt: async () => ({ status: 1, hash: ethers.id("wrong"), blockHash, blockNumber: 12350 })
    }, tokenA, ethers), /receipt mismatch/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, { ...canonical,
      getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash, blockNumber: 12350 }),
      getBlock: async () => null }, tokenA, ethers), /not canonical/);
    await assert.rejects(sdk.verifyCanonicalNativeSettlement(receipt, proof, { ...canonical,
      getTransactionReceipt: async () => ({ status: 1, hash: txHash, blockHash, blockNumber: 12350 }),
      getBlockNumber: async () => 12350 }, tokenA, ethers, 2), /lacks confirmations/);
  });

  it("enables the UI only after every configured deployment address has bytecode", async function () {
    const address = value => ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(value), 20));
    const config = {
      chainId: 97, routerAddress: address(1), quoteRouterAddress: address(2),
      executionRouterAddress: address(3), nativeRouterAddress: address(4),
      splitOptimizerAddress: address(5), autoRouterAddress: address(6), gasCostOracleAddress: address(7),
      tokens: [{ symbol: "BNB", address: "native" }, { symbol: "WBNB", address: address(8) }, { symbol: "LQC", address: address(9) }],
      dexes: [{ id: "LQC", adapter: address(10) }, { id: "PCS", adapter: address(11) }]
    };
    const provider = { getNetwork: async () => ({ chainId: 97n }), getCode: async () => "0x6000" };
    const result = await sdk.verifyUiDeployment(provider, config, ethers);
    assert.equal(result.ready, true); assert.equal(result.chainId, 97); assert.equal(result.checked, 11);
    await assert.rejects(sdk.verifyUiDeployment(null, config, ethers), /Invalid deployment verifier/);
    await assert.rejects(sdk.verifyUiDeployment({ ...provider, getNetwork: async () => ({ chainId: 56n }) }, config, ethers), /chain mismatch/);
    await assert.rejects(sdk.verifyUiDeployment(provider, { ...config, tokens: [], dexes: [] }, ethers), /configuration incomplete/);
    await assert.rejects(sdk.verifyUiDeployment(provider, { ...config, routerAddress: ethers.ZeroAddress }, ethers), /Invalid deployment address routerAddress/);
    await assert.rejects(sdk.verifyUiDeployment({ ...provider, getCode: async target => target.toLowerCase() === address(10).toLowerCase() ? "0x" : "0x6000" }, config, ethers), /adapter:LQC/);
    await assert.rejects(sdk.verifyUiDeployment(provider, { ...config, nativeRouterAddress: config.routerAddress }, ethers), /Duplicate deployment address/);
  });

  it("verifies minimal router bytecode, factory, and WBNB binding before enabling trades", async function () {
    const address = value => ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(value), 20));
    const router = address(1), wbnb = address(2), lqc = address(3), factory = address(4);
    const config = { deploymentMode: "minimal-testnet-smoke", chainId: 97, routerAddress: router,
      tokens: [{ symbol: "BNB", address: "native" }, { symbol: "WBNB", address: wbnb }, { symbol: "LQC", address: lqc }] };
    const iface = new ethers.Interface(["function factory() view returns(address)", "function WBNB() view returns(address)"]);
    const provider = { getNetwork: async () => ({ chainId: 97n }), getCode: async () => "0x6000",
      call: async ({ data }) => data === iface.encodeFunctionData("factory")
        ? iface.encodeFunctionResult("factory", [factory]) : iface.encodeFunctionResult("WBNB", [wbnb]) };
    const result = await sdk.verifyMinimalUiDeployment(provider, config, ethers);
    assert.equal(result.ready, true); assert.equal(result.checked, 4); assert.equal(result.factory, factory);
    await assert.rejects(sdk.verifyMinimalUiDeployment({ ...provider, getNetwork: async () => ({ chainId: 56n }) }, config, ethers), /chain mismatch/);
    await assert.rejects(sdk.verifyMinimalUiDeployment({ ...provider, getCode: async target => target.toLowerCase() === lqc.toLowerCase() ? "0x" : "0x6000" }, config, ethers), /token:LQC/);
    await assert.rejects(sdk.verifyMinimalUiDeployment({ ...provider,
      call: async ({ data }) => data === iface.encodeFunctionData("factory")
        ? iface.encodeFunctionResult("factory", [factory]) : iface.encodeFunctionResult("WBNB", [address(9)]) }, config, ethers), /WBNB mismatch/);
    await assert.rejects(sdk.verifyMinimalUiDeployment({ ...provider, getCode: async target => target.toLowerCase() === factory.toLowerCase() ? "0x" : "0x6000" }, config, ethers), /factory/);
  });

  it("marks a swap complete only from a successful matching mined receipt", function () {
    const transactionHash=ethers.id("swap"),blockHash=ethers.id("swap-block");
    const result=sdk.validateSwapReceipt({status:1,hash:transactionHash,blockHash,blockNumber:123},transactionHash,ethers);
    assert.equal(result.confirmed,true); assert.equal(result.transactionHash,transactionHash.toLowerCase());
    assert.equal(result.blockHash,blockHash.toLowerCase()); assert.equal(result.blockNumber,123);
    assert.throws(()=>sdk.validateSwapReceipt({status:0,hash:transactionHash,blockHash,blockNumber:123},transactionHash,ethers),/failed/);
    assert.throws(()=>sdk.validateSwapReceipt({status:1,hash:ethers.id("other"),blockHash,blockNumber:123},transactionHash,ethers),/hash mismatch/);
    assert.throws(()=>sdk.validateSwapReceipt({status:1,hash:transactionHash,blockHash:"0x",blockNumber:123},transactionHash,ethers),/confirmation/);
    assert.throws(()=>sdk.validateSwapReceipt({status:1,hash:transactionHash,blockHash,blockNumber:0},transactionHash,ethers),/confirmation/);
  });

  it("requires enough token input and native gas funds before wallet submission", function () {
    const token=sdk.validateTransactionFunds({nativeBalance:1_000n,tokenBalance:500n,amountIn:400n,estimatedGas:10n,feePerGas:20n,nativeInput:false});
    assert.equal(token.sufficient,true); assert.equal(token.gasCost,200n); assert.equal(token.requiredNative,200n);
    const native=sdk.validateTransactionFunds({nativeBalance:1_000n,tokenBalance:null,amountIn:700n,estimatedGas:10n,feePerGas:20n,nativeInput:true});
    assert.equal(native.requiredNative,900n);
    assert.throws(()=>sdk.validateTransactionFunds({nativeBalance:1_000n,tokenBalance:399n,amountIn:400n,estimatedGas:10n,feePerGas:20n,nativeInput:false}),/token balance/);
    assert.throws(()=>sdk.validateTransactionFunds({nativeBalance:899n,tokenBalance:null,amountIn:700n,estimatedGas:10n,feePerGas:20n,nativeInput:true}),/native balance/);
    assert.throws(()=>sdk.validateTransactionFunds({nativeBalance:1_000n,tokenBalance:null,amountIn:400n,estimatedGas:10n,feePerGas:20n,nativeInput:false}),/Invalid transaction funds/);
  });

  it("accepts only the newest asynchronous quote response", function () {
    assert.equal(sdk.isLatestQuote(7, 7), true);
    assert.equal(sdk.isLatestQuote(6, 7), false);
    assert.throws(() => sdk.isLatestQuote(-1, 0), /Invalid quote version/);
    assert.throws(() => sdk.isLatestQuote(1.5, 2), /Invalid quote version/);
  });

  it("revalidates trade identity, quote age, block drift, and minimum output before execution", function () {
    const snapshot = { chainId: 97, tokenIn: "0xaaa", tokenOut: "0xbbb", amountIn: 100n,
      amountOut: 200n, minimumOut: 198n, blockNumber: 100, quotedAt: 1_000 };
    const current = { chainId: 97, tokenIn: "0xaaa", tokenOut: "0xbbb", amountIn: 100n,
      amountOut: 199n, blockNumber: 103, now: 20_000 };
    const validated = sdk.validateExecutionQuote(snapshot, current);
    assert.equal(validated.valid, true); assert.equal(validated.ageMs, 19_000);
    assert.equal(validated.blockDrift, 3); assert.equal(validated.minimumOut, 198n);
    assert.throws(() => sdk.validateExecutionQuote(snapshot, { ...current, amountIn: 101n }), /QuoteTradeChanged/);
    assert.throws(() => sdk.validateExecutionQuote(snapshot, { ...current, now: 31_001 }), /StaleQuote/);
    assert.throws(() => sdk.validateExecutionQuote(snapshot, { ...current, blockNumber: 106 }), /StaleQuote/);
    assert.throws(() => sdk.validateExecutionQuote(snapshot, { ...current, amountOut: 197n }), /QuotePriceMoved/);
    assert.throws(() => sdk.validateExecutionQuote(snapshot, current, { maxAgeMs: 999 }), /Invalid quote validation/);
    assert.throws(() => sdk.validateExecutionQuote({ ...snapshot, amountOut: 0n }, current), /Invalid quote amounts/);
    assert.throws(() => sdk.validateExecutionQuote(snapshot, { ...current, blockNumber: -1 }), /Invalid quote context/);
    assert.equal(sdk.explainSwapError(new Error("StaleQuote")).code, "STALE_QUOTE");
    assert.equal(sdk.explainSwapError(new Error("QuotePriceMoved")).code, "PRICE_MOVED");
    assert.equal(sdk.explainSwapError({ code: "CALL_EXCEPTION" }).code, "SIMULATION_FAILED");
  });

});


describe("5/1 EIP-712 Execution Intent",function(){
  it("binds domain, verifying contract and execution fields with EIP-712",async function(){
    const wallet=ethers.Wallet.createRandom(),verifying=ethers.Wallet.createRandom().address;
    const intent={chainId:97,proofHash:ethers.keccak256(ethers.toUtf8Bytes("proof")),sender:wallet.address.toLowerCase(),target:ethers.Wallet.createRandom().address.toLowerCase(),calldataHash:ethers.keccak256(ethers.toUtf8Bytes("call")),value:"0",nonce:7,deadline:2000000000};
    const typed=sdk.executionIntentTypedData(intent,verifying,ethers),hash=sdk.executionIntentTypedDataHash(intent,verifying,ethers),sig=await wallet.signTypedData(typed.domain,typed.types,typed.message);
    assert.equal(typed.domain.chainId,97);assert.equal(typed.domain.verifyingContract,verifying.toLowerCase());assert.equal(hash,ethers.TypedDataEncoder.hash(typed.domain,typed.types,typed.message));assert.equal(sdk.verifyExecutionIntentSignature(intent,verifying,sig,ethers),true);
    assert.equal(sdk.verifyExecutionIntentSignature({...intent,nonce:8},verifying,sig,ethers),false);
  });
});


describe("5/1 EIP-712 security boundaries",function(){
  it("rejects domain and every execution-field mutation",async function(){
    const wallet=ethers.Wallet.createRandom(),verifying=ethers.Wallet.createRandom().address,otherVerifier=ethers.Wallet.createRandom().address;
    const intent={chainId:97,proofHash:ethers.keccak256(ethers.toUtf8Bytes("proof-5-1")),sender:wallet.address.toLowerCase(),target:ethers.Wallet.createRandom().address.toLowerCase(),calldataHash:ethers.keccak256(ethers.toUtf8Bytes("calldata-5-1")),value:"123",nonce:9,deadline:2000000000};
    const typed=sdk.executionIntentTypedData(intent,verifying,ethers),sig=await wallet.signTypedData(typed.domain,typed.types,typed.message);
    assert.equal(sdk.verifyExecutionIntentSignature(intent,verifying,sig,ethers),true);
    assert.equal(sdk.verifyExecutionIntentSignature(intent,otherVerifier,sig,ethers),false);
    const mutations=[
      {...intent,chainId:56},
      {...intent,proofHash:ethers.keccak256(ethers.toUtf8Bytes("other-proof"))},
      {...intent,sender:ethers.Wallet.createRandom().address.toLowerCase()},
      {...intent,target:ethers.Wallet.createRandom().address.toLowerCase()},
      {...intent,calldataHash:ethers.keccak256(ethers.toUtf8Bytes("other-call"))},
      {...intent,value:"124"},
      {...intent,nonce:10},
      {...intent,deadline:intent.deadline-1}
    ];
    for(const changed of mutations)assert.equal(sdk.verifyExecutionIntentSignature(changed,verifying,sig,ethers),false);
  });
  it("rejects malformed typed-data inputs and signatures",function(){
    const verifying=ethers.Wallet.createRandom().address,intent={chainId:97,proofHash:ethers.ZeroHash,sender:ethers.Wallet.createRandom().address.toLowerCase(),target:ethers.Wallet.createRandom().address.toLowerCase(),calldataHash:ethers.ZeroHash,value:"0",nonce:0,deadline:1};
    assert.throws(()=>sdk.executionIntentTypedData({...intent,value:"-1"},verifying,ethers));
    assert.throws(()=>sdk.executionIntentTypedData({...intent,nonce:-1},verifying,ethers));
    assert.throws(()=>sdk.executionIntentTypedData(intent,ethers.ZeroAddress,ethers));
    assert.equal(sdk.verifyExecutionIntentSignature(intent,verifying,"0x1234",ethers),false);
  });
});


describe("5/1 canonical EIP-712 intent identity",function(){
  it("uses the EIP-712 digest as the single canonical intent identity",function(){
    const verifying=ethers.Wallet.createRandom().address,intent={version:1,type:"LQC_EXECUTION_INTENT",chainId:97,proofHash:ethers.id("proof-canonical"),sender:ethers.Wallet.createRandom().address.toLowerCase(),target:ethers.Wallet.createRandom().address.toLowerCase(),calldataHash:ethers.id("call-canonical"),value:"0",nonce:11,deadline:2000000000};
    const canonical=sdk.canonicalExecutionIntent(intent,verifying,ethers),digest=sdk.executionIntentTypedDataHash(intent,verifying,ethers);
    assert.equal(canonical.intentHash,digest);assert.equal(canonical.typedDataHash,digest);assert.equal(canonical.hashScheme,"EIP712_V1");assert.equal(canonical.verifyingContract,verifying.toLowerCase());assert.equal(sdk.verifyCanonicalExecutionIntent(canonical,verifying,ethers),true);
    assert.equal(sdk.verifyCanonicalExecutionIntent({...canonical,nonce:12},verifying,ethers),false);assert.equal(sdk.verifyCanonicalExecutionIntent(canonical,ethers.Wallet.createRandom().address,ethers),false);
  });
});
