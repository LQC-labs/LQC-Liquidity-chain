import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  buildOperationalRoleActivation,
  verifyOperationalRoleActivation,
} from "../scripts/prepare-operational-role-activation.mjs";

const address = (value) => `0x${value.toString(16).padStart(40, "0")}`;
const policy = (start, owners, threshold) => ({
  address: address(start),
  owners: Array.from({ length: owners }, (_, index) => address(start + index + 20)),
  threshold,
});
const deployment = {
  network: { name: "BSC Testnet", chainId: 97 },
  deployer: address(1), owner: address(2), riskAdmin: address(3), guardian: address(4), treasury: address(5),
  sourceRevision: "a".repeat(40),
  multisigPolicies: {
    governance: policy(2, 7, 4), risk: policy(3, 5, 3),
    guardian: policy(4, 5, 3), treasury: policy(5, 5, 3),
  },
  contracts: {
    emergencyController: { address: address(6) }, router: { address: address(7) },
    quoteRouter: { address: address(8) }, executionRouter: { address: address(9) },
    nativeRouter: { address: address(10) }, splitOptimizer: { address: address(11) },
    autoRouter: { address: address(12) }, gasCostOracle: { address: address(13) },
    wbnb: { address: address(14), decimals: 18 }, lqc: { address: address(15), decimals: 18 },
  },
  dexes: [{ id: ethers.id("LQC_FLOW"), adapter: address(16), name: "LQC Flow" }],
};

describe("LQC operational role activation bundle", function () {
  it("builds one reviewable guardian activation for the Governance Safe", function () {
    const bundle = buildOperationalRoleActivation(deployment);
    assert.equal(bundle.network.chainId, 97);
    assert.equal(bundle.governanceActions.length, 1);
    assert.equal(bundle.governanceActions[0].signer, ethers.getAddress(deployment.owner));
    assert.equal(bundle.governanceActions[0].target, ethers.getAddress(deployment.contracts.emergencyController.address));
    assert.deepEqual(bundle.governanceActions[0].arguments, [ethers.getAddress(deployment.guardian), true]);
    assert.match(bundle.governanceActions[0].data, /^0x[0-9a-f]+$/);
    assert.match(bundle.deploymentFingerprint, /^0x[0-9a-f]{64}$/);
    assert.match(bundle.bundleDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(bundle.treasuryStatus, "RECORDED_NOT_FUNDED");
    assert.equal(verifyOperationalRoleActivation(bundle, deployment).status, "VERIFIED");
  });

  it("rejects the wrong network, shared roles, and weak or missing Safe evidence", function () {
    assert.throws(() => buildOperationalRoleActivation({ ...deployment, network: { chainId: 56 } }), /chain 97/);
    assert.throws(() => buildOperationalRoleActivation({ ...deployment, guardian: deployment.riskAdmin }), /must be separated/);
    const weak = structuredClone(deployment); weak.multisigPolicies.guardian.threshold = 2;
    assert.throws(() => buildOperationalRoleActivation(weak), /3-of-5/);
    const missing = structuredClone(deployment); delete missing.multisigPolicies.treasury;
    assert.throws(() => buildOperationalRoleActivation(missing), /evidence is missing/);
    const wrongPolicyAddress = structuredClone(deployment);
    wrongPolicyAddress.multisigPolicies.guardian.address = address(99);
    assert.throws(() => buildOperationalRoleActivation(wrongPolicyAddress), /does not match/);
    assert.throws(() => buildOperationalRoleActivation({ ...deployment, sourceRevision: "draft" }), /40-character/);
    assert.throws(() => buildOperationalRoleActivation({ ...deployment, deploymentFingerprint: ethers.ZeroHash }), /fingerprint/);
    const tampered = buildOperationalRoleActivation(deployment);
    tampered.governanceActions[0].arguments[1] = false;
    assert.throws(() => verifyOperationalRoleActivation(tampered, deployment), /does not match/);
  });
});
