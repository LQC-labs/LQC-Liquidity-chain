import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("LQC proof-bound gateway adversarial EVM", function () {
  this.timeout(30000);
  let provider, owner, tokenIn, tokenOut, registry, gateway, proof, request, candidates, routes;

  beforeEach(async () => {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner();
    const deploy = (name, source, ...args) => new ethers.ContractFactory(artifact(name, source).abi, artifact(name, source).bytecode, owner).deploy(...args);

    tokenIn = await deploy("MockProofGatewayAttackToken", "mocks/MockProofGatewayAttackToken");
    tokenOut = await deploy("MockERC20", "mocks/MockERC20", "Output", "OUT");
    const wrapped = await deploy("MockWBNB", "mocks/MockWBNB");
    const factory = await deploy("LQCFlowFactory", "LQCFlowFactory", await owner.getAddress());
    await Promise.all([tokenIn.waitForDeployment(), tokenOut.waitForDeployment(), wrapped.waitForDeployment(), factory.waitForDeployment()]);

    const flow = await deploy("LQCFlowRouter", "LQCFlowRouter", await factory.getAddress(), await wrapped.getAddress());
    registry = await deploy("LQCDexRegistry", "router-v2/LQCDexRegistry", await owner.getAddress());
    await Promise.all([flow.waitForDeployment(), registry.waitForDeployment()]);
    const router = await deploy("LQCExecutionRouter", "router-v2/LQCExecutionRouter", await registry.getAddress(), ethers.ZeroAddress);
    const adapter = await deploy("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter", await flow.getAddress());
    proof = await deploy("LQCBestExecutionProof", "router-v2/LQCBestExecutionProof");
    await Promise.all([router.waitForDeployment(), adapter.waitForDeployment(), proof.waitForDeployment()]);
    gateway = await deploy("LQCProofBoundExecutionGateway", "router-v2/LQCProofBoundExecutionGateway", await proof.getAddress(), await router.getAddress());
    await gateway.waitForDeployment();

    const liquidity = ethers.parseEther("10000");
    await (await tokenIn.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenOut.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenIn.approve(await flow.getAddress(), liquidity)).wait();
    await (await tokenOut.approve(await flow.getAddress(), liquidity)).wait();
    const block = await provider.getBlock("latest");
    await (await flow.addLiquidity(await tokenIn.getAddress(), await tokenOut.getAddress(), liquidity, liquidity, 0, 0, await owner.getAddress(), block.timestamp + 3600)).wait();
    await (await tokenIn.mint(await owner.getAddress(), ethers.parseEther("100"))).wait();

    const dexId = ethers.id("FLOW");
    await (await registry.addDex(dexId, await adapter.getAddress(), "Flow", 100)).wait();
    routes = [ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[await tokenIn.getAddress(), await tokenOut.getAddress()]])];
    request = { chainId: (await provider.getNetwork()).chainId, tokenIn: await tokenIn.getAddress(), tokenOut: await tokenOut.getAddress(), amountIn: ethers.parseEther("10"), recipient: await owner.getAddress(), slippageBps: 100, validUntil: BigInt(block.timestamp + 300) };
    const quote = await adapter.quoteExactInput(request.tokenIn, request.tokenOut, request.amountIn, routes[0]);
    const quoteBlock = await provider.getBlockNumber();
    const routeHash = await proof.computeRouteHash(request, quoteBlock, dexId, await adapter.getAddress(), routes[0], quote, 0, 0);
    candidates = [{ dexId, adapter: await adapter.getAddress(), quoteBlock, grossAmountOut: quote, gasCostInTokenOut: 0, protocolFeeInTokenOut: 0, netAmountOut: quote, minimumAmountOut: quote * 9900n / 10000n, priority: 100, routeHash }];
    await (await tokenIn.approve(await gateway.getAddress(), request.amountIn)).wait();
  });

  it("blocks a token callback reentrancy while completing the outer proven swap", async () => {
    const callbackData = gateway.interface.encodeFunctionData("executeBestCandidate", [request, candidates, routes, 0]);
    await (await tokenIn.configureCallback(await gateway.getAddress(), await gateway.getAddress(), callbackData)).wait();
    const outputBefore = await tokenOut.balanceOf(await owner.getAddress());

    await (await gateway.executeBestCandidate(request, candidates, routes, 0)).wait();

    assert.equal(await tokenIn.callbackAttempted(), true);
    assert.equal(await tokenIn.callbackSucceeded(), false);
    assert.equal(await tokenIn.callbackRevertSelector(), gateway.interface.getError("Reentrancy").selector);
    assert((await tokenOut.balanceOf(await owner.getAddress())) > outputBefore);
  });

  it("detects residual dust and rolls back every state change", async () => {
    const proofHash = await proof.bestCandidateProofHash(request, candidates, 0);
    const ownerInputBefore = await tokenIn.balanceOf(await owner.getAddress());
    const ownerOutputBefore = await tokenOut.balanceOf(await owner.getAddress());
    await (await tokenIn.configureResidualDust(await gateway.getAddress(), true)).wait();

    await assert.rejects(
      gateway.executeBestCandidate(request, candidates, routes, 0),
      error => error?.info?.error?.data?.result?.slice(0, 10) === gateway.interface.getError("ResidualToken").selector || /revert/i.test(String(error))
    );

    assert.equal(await gateway.consumedProof(proofHash), false);
    assert.equal(await tokenIn.balanceOf(await gateway.getAddress()), 0n);
    assert.equal(await tokenIn.balanceOf(await owner.getAddress()), ownerInputBefore);
    assert.equal(await tokenOut.balanceOf(await owner.getAddress()), ownerOutputBefore);
  });
});
