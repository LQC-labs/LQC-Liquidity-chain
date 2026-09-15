import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import {
  buildProofBoundGatewayDeployment,
  recordProofBoundGatewayDeployment,
  recordProofVerifierDeployment,
} from "../scripts/prepare-router2-proof-bound-gateway.mjs";

const address = digit => `0x${digit.repeat(40)}`;
const txHash = digit => `0x${digit.repeat(64)}`;

describe("Router 2.0 proof-bound Gateway deployment preparation", function () {
  it("prepares only the proof verifier before its address exists", async function () {
    const bundle = await buildProofBoundGatewayDeployment();
    assert.equal(bundle.network.chainId, 97);
    assert.deepEqual(bundle.orderedActions.map(action => action.action), ["deploy-best-execution-proof"]);
    assert.equal(bundle.dependencies.executionRouter, ethers.getAddress("0x2e0a7f59ca65ed36977add5e71b8b64ba38d939f"));
    assert.match(bundle.safety, /No private key, signature, transaction, approval, token movement, or swap/);
  });

  it("binds the Gateway constructor to the exact verifier and deployed Router", async function () {
    const proofAddress = address("1");
    const bundle = await buildProofBoundGatewayDeployment(proofAddress);
    const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/router-v2/LQCProofBoundExecutionGateway.sol/LQCProofBoundExecutionGateway.json", import.meta.url)));
    const expected = await new ethers.ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(proofAddress, bundle.dependencies.executionRouter);
    assert.equal(bundle.orderedActions[1].data, expected.data);
    assert.deepEqual(bundle.orderedActions[1].constructorArguments, [ethers.getAddress(proofAddress), bundle.dependencies.executionRouter]);
  });

  it("records deployments only in dependency order", async function () {
    const proofAddress = address("1");
    let bundle = await buildProofBoundGatewayDeployment(proofAddress);
    assert.throws(() => recordProofBoundGatewayDeployment(bundle, address("2"), txHash("3")), /proof verifier/);
    bundle = recordProofVerifierDeployment(bundle, proofAddress, txHash("2"));
    bundle = recordProofBoundGatewayDeployment(bundle, address("3"), txHash("4"));
    assert.equal(bundle.executions.proofVerifier.status, "success");
    assert.equal(bundle.executions.proofBoundGateway.executionRouter, bundle.dependencies.executionRouter);
  });

  it("rejects malformed or mismatched evidence", async function () {
    await assert.rejects(buildProofBoundGatewayDeployment("bad"), /proofVerifierAddress/);
    const bundle = await buildProofBoundGatewayDeployment(address("1"));
    assert.throws(() => recordProofVerifierDeployment(bundle, address("2"), txHash("2")), /must match/);
    assert.throws(() => recordProofVerifierDeployment(bundle, address("1"), "bad"), /transaction hash/);
  });
});
