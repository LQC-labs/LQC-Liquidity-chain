import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

function artifact(path, name) {
  return JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${path}/${name}.json`, import.meta.url)));
}
const A = {
  Token: artifact("test/IntentE2EMocks.sol", "IntentE2EToken"),
  Registry: artifact("test/IntentE2EMocks.sol", "IntentE2ERegistry"),
  Adapter: artifact("test/IntentE2EMocks.sol", "IntentE2EAdapter"),
  Router: artifact("router-v2/LQCExecutionRouter.sol", "LQCExecutionRouter"),
  Escrow: artifact("intent-v1/LQCSourceEscrow.sol", "LQCSourceEscrow"),
  Hub: artifact("intent-v1/LQCIntentHub.sol", "LQCIntentHub"),
  Solver: artifact("intent-v1/LQCInternalSolver.sol", "LQCInternalSolver"),
  Binding: artifact("intent-v1/LQCIntentSolverBinding.sol", "LQCIntentSolverBinding"),
  Receipt: artifact("intent-v1/LQCExecutionReceipt.sol", "LQCExecutionReceipt")
};

const factory = (a, signer) => new ethers.ContractFactory(a.abi, a.bytecode, signer);
async function deploy(a, signer, ...args) {
  const contract = await factory(a, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}
async function expectFailure(action) {
  await assert.rejects(action, error =>
    error.code === "CALL_EXCEPTION" || error.code === "UNKNOWN_ERROR" ||
    /revert|missing revert data/i.test(String(error))
  );
}

async function fixture() {
  const chain = ganache.provider({
    chain: { chainId: 97, hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { deterministic: true, totalAccounts: 8 }
  });
  const provider = new ethers.BrowserProvider(chain);
  const [owner, guardian, operator, user, recipient, outsider] =
    await Promise.all([0,1,2,3,4,5].map(i => provider.getSigner(i)));

  const tokenIn = await deploy(A.Token, owner);
  const tokenOut = await deploy(A.Token, owner);
  const registry = await deploy(A.Registry, owner);
  const adapter = await deploy(A.Adapter, owner);
  const router = await deploy(A.Router, owner, await registry.getAddress(), ethers.ZeroAddress);
  const receipt = await deploy(A.Receipt, owner, await owner.getAddress());

  // Escrow and Hub reference one another, so deploy against the deterministic CREATE addresses.
  let nonce = BigInt(await provider.send("eth_getTransactionCount", [await owner.getAddress(), "pending"]));
  const escrowAddress = ethers.getCreateAddress({ from: await owner.getAddress(), nonce });
  const hubAddress = ethers.getCreateAddress({ from: await owner.getAddress(), nonce: nonce + 1n });
  const escrow = await deploy(A.Escrow, owner, hubAddress);
  assert.equal(await escrow.getAddress(), escrowAddress);
  const hub = await deploy(A.Hub, owner, escrowAddress, await owner.getAddress(), await guardian.getAddress());
  assert.equal(await hub.getAddress(), hubAddress);

  // Solver accepts only Binding; Binding in turn accepts only Escrow.
  nonce = BigInt(await provider.send("eth_getTransactionCount", [await owner.getAddress(), "pending"]));
  const solverAddress = ethers.getCreateAddress({ from: await owner.getAddress(), nonce });
  const bindingAddress = ethers.getCreateAddress({ from: await owner.getAddress(), nonce: nonce + 1 });
  const solver = await deploy(A.Solver, owner, bindingAddress, await router.getAddress());
  assert.equal(await solver.getAddress(), solverAddress);
  const binding = await deploy(
    A.Binding, owner, hubAddress, solverAddress, escrowAddress, await receipt.getAddress()
  );
  assert.equal(await binding.getAddress(), bindingAddress);

  const dexId = ethers.id("BSC_TEST_DEX");
  await (await registry.setDex(dexId, await adapter.getAddress(), true)).wait();
  await (await receipt.setRecorder(bindingAddress)).wait();
  await (await hub.setExecutionBinding(bindingAddress)).wait();
  await (await hub.setSolver(await operator.getAddress())).wait();
  await (await tokenIn.mint(await user.getAddress(), 1_000n)).wait();
  await (await tokenOut.mint(await adapter.getAddress(), 10_000n)).wait();

  async function lockAndRoute({ suffix="one", input=100n, output=175n, minimum=170n }={}) {
    const intentHash = ethers.id(`intent-${suffix}`);
    const intentNonce = BigInt(ethers.id(`nonce-${suffix}`));
    const block = await provider.getBlock("latest");
    const deadline = BigInt(block.timestamp + 3600);
    await (await tokenIn.connect(user).approve(escrowAddress, input)).wait();
    await (await escrow.connect(user).lock(intentHash, await tokenIn.getAddress(), input, intentNonce, deadline)).wait();
    const route = {
      intentHash, dexId,
      tokenIn: await tokenIn.getAddress(), tokenOut: await tokenOut.getAddress(),
      amountIn: input, amountOutMinimum: minimum,
      recipient: await recipient.getAddress(), deadline,
      routeData: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [output])
    };
    return { intentHash, intentNonce, deadline, route, input, output };
  }

  return {
    chain, provider, owner, operator, user, recipient, outsider,
    tokenIn, tokenOut, escrow, hub, solver, binding, receipt, adapter, dexId,
    lockAndRoute
  };
}
async function close(f) {
  await f.provider.destroy();
  await f.chain.disconnect();
}

describe("6/5 BSC same-chain Intent E2E runtime gate", function () {
  this.timeout(30000);
  let f;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { if (f) await close(f); });

  it("executes Escrow -> Binding -> Solver -> Router and records the measured output atomically", async function () {
    const x = await f.lockAndRoute();
    const recipientBefore = await f.tokenOut.balanceOf(await f.recipient.getAddress());
    const tx = await f.hub.connect(f.operator).executeRoutedIntent(
      await f.user.getAddress(), x.intentNonce, x.route
    );
    const mined = await tx.wait();
    assert.equal(mined.status, 1);
    assert.equal(await f.tokenOut.balanceOf(await f.recipient.getAddress()) - recipientBefore, x.output);
    assert.equal((await f.escrow.intentRecord(x.intentHash)).status, 2n);
    assert.equal((await f.escrow.escrows(x.intentHash)).amount, 0n);
    assert.equal(await f.tokenIn.balanceOf(await f.escrow.getAddress()), 0n);
    assert.equal(await f.tokenIn.balanceOf(await f.binding.getAddress()), 0n);
    assert.equal(await f.tokenIn.balanceOf(await f.solver.getAddress()), 0n);

    const row = await f.receipt.receipts(x.intentHash);
    assert.notEqual(row.executionHash, ethers.ZeroHash);
    assert.equal(row.solver, await f.solver.getAddress());
    assert.equal(row.routeId, f.dexId);
    assert.equal(row.amountOut, x.output);
    assert.notEqual(await f.receipt.getReceiptHash(x.intentHash), ethers.ZeroHash);
  });

  it("rejects direct calls that bypass Hub and Escrow authorization", async function () {
    const x = await f.lockAndRoute({ suffix: "auth" });
    await expectFailure(async () => f.binding.connect(f.outsider).forward.staticCall(
      x.intentHash, await f.user.getAddress(), x.intentNonce, x.route
    ));
    await expectFailure(async () => f.solver.connect(f.outsider).execute.staticCall(x.route));
    assert.equal((await f.escrow.intentRecord(x.intentHash)).status, 1n);
    assert.equal((await f.escrow.escrows(x.intentHash)).amount, x.input);
  });

  it("rolls back custody, lifecycle and receipt when Router minimum output fails", async function () {
    const x = await f.lockAndRoute({ suffix: "slippage", output: 90n, minimum: 100n });
    const escrowBefore = await f.tokenIn.balanceOf(await f.escrow.getAddress());
    await expectFailure(async () => f.hub.connect(f.operator).executeRoutedIntent.staticCall(
      await f.user.getAddress(), x.intentNonce, x.route
    ));
    await expectFailure(async () => {
      const tx = await f.hub.connect(f.operator).executeRoutedIntent(
        await f.user.getAddress(), x.intentNonce, x.route, { gasLimit: 4_000_000n }
      );
      await tx.wait();
    });
    assert.equal((await f.escrow.intentRecord(x.intentHash)).status, 1n);
    assert.equal((await f.escrow.escrows(x.intentHash)).amount, x.input);
    assert.equal(await f.tokenIn.balanceOf(await f.escrow.getAddress()), escrowBefore);
    assert.equal(await f.tokenOut.balanceOf(await f.recipient.getAddress()), 0n);
    assert.equal((await f.receipt.receipts(x.intentHash)).executionHash, ethers.ZeroHash);
  });

  it("rejects route fields that do not exactly match escrowed token and amount", async function () {
    const x = await f.lockAndRoute({ suffix: "mismatch" });
    const wrong = { ...x.route, amountIn: x.input - 1n };
    await expectFailure(async () => f.hub.connect(f.operator).executeRoutedIntent.staticCall(
      await f.user.getAddress(), x.intentNonce, wrong
    ));
    assert.equal((await f.escrow.intentRecord(x.intentHash)).status, 1n);
    assert.equal((await f.escrow.escrows(x.intentHash)).amount, x.input);
  });

  it("rolls the swap back if receipt persistence fails", async function () {
    const x = await f.lockAndRoute({ suffix: "receipt" });
    const executionHash = await f.binding.executionHash(x.route);
    await (await f.receipt.connect(f.owner).setRecorder(await f.owner.getAddress())).wait();
    await (await f.receipt.connect(f.owner).record(
      x.intentHash, executionHash, await f.solver.getAddress(), f.dexId, 1n
    )).wait();
    await (await f.receipt.connect(f.owner).setRecorder(await f.binding.getAddress())).wait();

    await expectFailure(async () => f.hub.connect(f.operator).executeRoutedIntent.staticCall(
      await f.user.getAddress(), x.intentNonce, x.route
    ));
    assert.equal((await f.escrow.intentRecord(x.intentHash)).status, 1n);
    assert.equal((await f.escrow.escrows(x.intentHash)).amount, x.input);
    assert.equal(await f.tokenOut.balanceOf(await f.recipient.getAddress()), 0n);
    assert.equal((await f.receipt.receipts(x.intentHash)).amountOut, 1n);
  });

  it("enforces pause, expiry and one-time lifecycle execution", async function () {
    const x = await f.lockAndRoute({ suffix: "lifecycle" });
    await (await f.hub.connect(f.owner).setPaused(true)).wait();
    await expectFailure(async () => f.hub.connect(f.operator).executeRoutedIntent.staticCall(
      await f.user.getAddress(), x.intentNonce, x.route
    ));
    await (await f.hub.connect(f.owner).setPaused(false)).wait();
    await (await f.hub.connect(f.operator).executeRoutedIntent(
      await f.user.getAddress(), x.intentNonce, x.route
    )).wait();
    await expectFailure(async () => f.hub.connect(f.operator).executeRoutedIntent.staticCall(
      await f.user.getAddress(), x.intentNonce, x.route
    ));
  });
});
