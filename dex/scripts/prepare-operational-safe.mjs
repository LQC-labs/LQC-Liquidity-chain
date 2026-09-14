import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import {
  BSC_TESTNET_CHAIN_ID,
  GOVERNANCE_OWNERS,
  SAFE_FALLBACK_HANDLER,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  SAFE_VERSION,
} from "./prepare-governance-safe.mjs";

export const OPERATIONAL_OWNERS = Object.freeze(GOVERNANCE_OWNERS.slice(0, 5));
export const OPERATIONAL_THRESHOLD = 3;
export const OPERATIONAL_ROLES = Object.freeze({
  guardian: Object.freeze({ label: "Emergency Guardian", env: "GUARDIAN_ADDRESS" }),
  treasury: Object.freeze({ label: "Treasury", env: "TREASURY_ADDRESS" }),
});

const safeInterface = new ethers.Interface([
  "function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
]);
const factoryInterface = new ethers.Interface([
  "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
]);

export function buildOperationalSafeTransaction(role) {
  const config = OPERATIONAL_ROLES[role];
  if (!config) throw new Error("Operational Safe role must be guardian or treasury.");
  const initializer = safeInterface.encodeFunctionData("setup", [
    OPERATIONAL_OWNERS,
    OPERATIONAL_THRESHOLD,
    ethers.ZeroAddress,
    "0x",
    SAFE_FALLBACK_HANDLER,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);
  const saltNonce = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`LQC ${config.label} Safe | BSC Testnet | v1`)));
  const data = factoryInterface.encodeFunctionData("createProxyWithNonce", [SAFE_SINGLETON, initializer, saltNonce]);
  return {
    schemaVersion: 1,
    purpose: `LQC ${config.label} Safe deployment`,
    role,
    roleEnvironmentVariable: config.env,
    network: { name: "BSC Testnet", chainId: BSC_TESTNET_CHAIN_ID },
    safeVersion: SAFE_VERSION,
    policy: { owners: OPERATIONAL_OWNERS, threshold: OPERATIONAL_THRESHOLD },
    contracts: { proxyFactory: SAFE_PROXY_FACTORY, singleton: SAFE_SINGLETON, fallbackHandler: SAFE_FALLBACK_HANDLER },
    saltNonce: saltNonce.toString(),
    transaction: { to: SAFE_PROXY_FACTORY, value: "0", data },
    warning: "Unsigned BSC testnet transaction. Verify chain ID 97, role, and every owner before signing.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(buildOperationalSafeTransaction(process.argv[2]), null, 2)}\n`);
}
