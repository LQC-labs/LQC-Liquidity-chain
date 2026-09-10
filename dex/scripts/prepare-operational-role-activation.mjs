import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { buildAppConfig } from "./app-config.mjs";

const emergencyInterface = new ethers.Interface([
  "function setGuardian(address guardian,bool allowed)",
]);

const requiredPolicy = Object.freeze({
  governance: { owners: 7, threshold: 4 },
  risk: { owners: 5, threshold: 3 },
  guardian: { owners: 5, threshold: 3 },
  treasury: { owners: 5, threshold: 3 },
});

function normalizedAddress(value, label) {
  if (!ethers.isAddress(value)) throw new Error(`${label} must be a valid address.`);
  return ethers.getAddress(value);
}

function validatePolicy(policy, label, minimum, expectedAddress) {
  if (!policy || !Array.isArray(policy.owners) || !Number.isInteger(policy.threshold)) {
    throw new Error(`${label} Safe policy evidence is missing.`);
  }
  const policyAddress = normalizedAddress(policy.address, `${label} Safe`);
  if (policyAddress !== expectedAddress) {
    throw new Error(`${label} Safe policy address does not match the recorded operational role.`);
  }
  const owners = policy.owners.map((owner) => normalizedAddress(owner, `${label} signer`));
  if (owners.length < minimum.owners || policy.threshold < minimum.threshold ||
      policy.threshold > owners.length || new Set(owners).size !== owners.length) {
    throw new Error(`${label} Safe policy does not satisfy the required ${minimum.threshold}-of-${minimum.owners} minimum.`);
  }
  if (owners.includes(ethers.ZeroAddress)) throw new Error(`${label} Safe policy contains a zero signer.`);
}

export function buildOperationalRoleActivation(deployment) {
  if (Number(deployment?.network?.chainId) !== 97) {
    throw new Error("Operational role activation is restricted to BSC testnet chain 97.");
  }
  const roles = {
    deployer: normalizedAddress(deployment.deployer, "deployer"),
    governance: normalizedAddress(deployment.owner, "governance"),
    risk: normalizedAddress(deployment.riskAdmin, "risk"),
    guardian: normalizedAddress(deployment.guardian, "guardian"),
    treasury: normalizedAddress(deployment.treasury, "treasury"),
  };
  if (new Set(Object.values(roles)).size !== Object.values(roles).length) {
    throw new Error("Deployer, governance, risk, guardian, and treasury addresses must be separated.");
  }
  if (!/^[0-9a-f]{40}$/i.test(deployment.sourceRevision || "")) {
    throw new Error("Operational role activation must pin a full 40-character source revision.");
  }
  for (const [name, minimum] of Object.entries(requiredPolicy)) {
    validatePolicy(deployment?.multisigPolicies?.[name], name, minimum, roles[name]);
  }
  const deploymentFingerprint = buildAppConfig(deployment).deploymentFingerprint;
  if (deployment.deploymentFingerprint && deployment.deploymentFingerprint !== deploymentFingerprint) {
    throw new Error("Recorded deployment fingerprint does not match the deployment addresses.");
  }
  const emergencyController = normalizedAddress(
    deployment?.contracts?.emergencyController?.address,
    "emergencyController",
  );
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    sourceRevision: deployment.sourceRevision,
    deploymentFingerprint,
    roles,
    governanceActions: [{
      order: 1,
      signer: roles.governance,
      target: emergencyController,
      value: "0",
      method: "setGuardian(address,bool)",
      arguments: [roles.guardian, true],
      data: emergencyInterface.encodeFunctionData("setGuardian", [roles.guardian, true]),
      postcondition: `guardians(${roles.guardian}) == true`,
    }],
    treasuryStatus: "RECORDED_NOT_FUNDED",
    warning: "Review in the Governance Safe. This bundle does not sign or send transactions.",
  };
}

function main() {
  const input = process.argv[2] || process.env.DEPLOYMENT_FILE;
  if (!input) throw new Error("Pass a deployment JSON path or set DEPLOYMENT_FILE.");
  const deployment = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
  process.stdout.write(`${JSON.stringify(buildOperationalRoleActivation(deployment), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
