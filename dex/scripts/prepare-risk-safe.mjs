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

export const RISK_OWNERS = Object.freeze(GOVERNANCE_OWNERS.slice(0, 5));
export const RISK_THRESHOLD = 3;
export const RISK_SALT_NONCE = BigInt(
  ethers.keccak256(ethers.toUtf8Bytes("LQC Risk Safe | BSC Testnet | v1")),
);

const safeInterface = new ethers.Interface([
  "function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
]);
const factoryInterface = new ethers.Interface([
  "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
]);

export function buildRiskSafeTransaction() {
  const initializer = safeInterface.encodeFunctionData("setup", [
    RISK_OWNERS,
    RISK_THRESHOLD,
    ethers.ZeroAddress,
    "0x",
    SAFE_FALLBACK_HANDLER,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);
  const data = factoryInterface.encodeFunctionData("createProxyWithNonce", [SAFE_SINGLETON, initializer, RISK_SALT_NONCE]);
  return {
    schemaVersion: 1,
    purpose: "LQC Risk Safe deployment",
    network: { name: "BSC Testnet", chainId: BSC_TESTNET_CHAIN_ID },
    safeVersion: SAFE_VERSION,
    policy: { owners: RISK_OWNERS, threshold: RISK_THRESHOLD },
    contracts: { proxyFactory: SAFE_PROXY_FACTORY, singleton: SAFE_SINGLETON, fallbackHandler: SAFE_FALLBACK_HANDLER },
    saltNonce: RISK_SALT_NONCE.toString(),
    transaction: { to: SAFE_PROXY_FACTORY, value: "0", data },
    warning: "Unsigned BSC testnet transaction. Verify chain ID 97 and every owner before signing.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(buildRiskSafeTransaction(), null, 2)}\n`);
}
