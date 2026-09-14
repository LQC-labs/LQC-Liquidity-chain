import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { TEST_LQC, TEST_WBNB } from "../scripts/prepare-pancake-v3-pool.mjs";
import { SIGNER_1 } from "../scripts/prepare-pancake-v3-liquidity.mjs";
import { PILOT_LIMITS, buildExecutionStack, recordExecutionRouterDeployment, recordRiskRegistryDeployment } from "../scripts/prepare-router2-execution-stack.mjs";

const address = digit => `0x${digit.repeat(40)}`;

describe("Router 2.0 capped execution stack preparation", function () {
  it("prepares only the Risk Registry deployment before addresses exist", async function () {
    const bundle = await buildExecutionStack();
    assert.equal(bundle.network.chainId, 97);
    assert.equal(bundle.signer, SIGNER_1);
    assert.equal(bundle.orderedActions.length, 1);
    assert.equal(bundle.orderedActions[0].action, "deploy-risk-registry");
    assert.match(bundle.safety, /No transaction, approval, token movement, or swap/);
  });

  it("binds Execution Router to the recorded DEX and supplied Risk registries", async function () {
    const bundle = await buildExecutionStack(address("1"));
    assert.deepEqual(bundle.orderedActions.map(item => item.action), ["deploy-risk-registry", "deploy-execution-router"]);
    const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/router-v2/LQCExecutionRouter.sol/LQCExecutionRouter.json", import.meta.url)));
    const deploy = new ethers.ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(bundle.dependencies.dexRegistry, address("1"));
    assert.equal((await deploy).data, bundle.orderedActions[1].data);
  });

  it("adds bounded tLQC and WBNB limits before governance transfer", async function () {
    const bundle = await buildExecutionStack(address("1"), address("2"));
    assert.deepEqual(bundle.orderedActions.map(item => item.action), [
      "deploy-risk-registry", "deploy-execution-router", "set-executor", "allow-tlqc",
      "cap-pancake-v3-tlqc", "allow-wbnb", "cap-pancake-v3-wbnb", "begin-governance-transfer",
    ]);
    assert.equal(bundle.pilotLimits.tLQC.maxPerTransaction, ethers.parseUnits("1000", 18).toString());
    assert.equal(bundle.pilotLimits.WBNB.maxPerTransaction, ethers.parseUnits("0.01", 18).toString());
    assert(PILOT_LIMITS.tLQC.maxPerDay > PILOT_LIMITS.tLQC.maxPerTransaction);
    assert(PILOT_LIMITS.WBNB.maxPerDay > PILOT_LIMITS.WBNB.maxPerTransaction);
    assert.equal(TEST_LQC.length, 42);
    assert.equal(TEST_WBNB.length, 42);
  });

  it("rejects malformed staged addresses", async function () {
    await assert.rejects(buildExecutionStack("bad"), /riskRegistryAddress/);
    await assert.rejects(buildExecutionStack(address("1"), "bad"), /executionRouterAddress/);
  });

  it("records the successful Risk Registry before preparing the next deployment", async function () {
    const bundle = await buildExecutionStack(address("1"));
    const recorded = recordRiskRegistryDeployment(bundle, address("1"), `0x${"2".repeat(64)}`);
    assert.equal(recorded.executions.riskRegistry.address, address("1"));
    assert.equal(recorded.executions.riskRegistry.status, "success");
    assert.equal(recorded.orderedActions[1].action, "deploy-execution-router");
    assert.throws(() => recordRiskRegistryDeployment(bundle, "bad", `0x${"2".repeat(64)}`), /valid deployed/);
  });

  it("records the bound Execution Router before any configuration transaction", async function () {
    const riskAddress = address("1"); const routerAddress = address("2");
    let bundle = await buildExecutionStack(riskAddress, routerAddress);
    bundle = recordRiskRegistryDeployment(bundle, riskAddress, `0x${"3".repeat(64)}`);
    const recorded = recordExecutionRouterDeployment(bundle, routerAddress, `0x${"4".repeat(64)}`);
    assert.equal(recorded.executions.executionRouter.address, routerAddress);
    assert.equal(recorded.executions.executionRouter.riskRegistry, riskAddress);
    assert.equal(recorded.orderedActions[2].action, "set-executor");
  });
});
