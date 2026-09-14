import { ethers } from "ethers";
import { pathToFileURL } from "node:url";

export const BSC_TESTNET_CHAIN_ID = 97;
export const SAFE_VERSION = "1.4.1";
export const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const SAFE_FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

export const GOVERNANCE_OWNERS = Object.freeze([
  "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB",
  "0xFBF84C81cfF0b400D33Ac2C3c095DC22E4A91B6c",
  "0x6CEd713de5342b8A9A2869BB132b3f251907970A",
  "0x1bC23531Eea799B1b7A0a7cbd7E7fC24baCb29FB",
  "0xE498CAcDa9cE819307AB1292389F270A46471B25",
  "0x30107526b867Ab345FBd23239157d9Ed225f9Dc0",
  "0x4A20a68834917d901d7C86bAB06061f3f182d7bC",
]);

export const GOVERNANCE_THRESHOLD = 4;
export const DEFAULT_SALT_NONCE = BigInt(
  ethers.keccak256(ethers.toUtf8Bytes("LQC Governance Safe | BSC Testnet | v1")),
);

const safeInterface = new ethers.Interface([
  "function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

const factoryInterface = new ethers.Interface([
  "function createProxyWithNonce(address _singleton,bytes initializer,uint256 saltNonce) returns (address proxy)",
  "function proxyCreationCode() view returns (bytes)",
]);

function normalizeOwners(owners) {
  const normalized = owners.map((owner, index) => {
    if (!ethers.isAddress(owner)) throw new Error(`Owner ${index + 1} is not a valid address.`);
    return ethers.getAddress(owner);
  });
  if (new Set(normalized.map((owner) => owner.toLowerCase())).size !== normalized.length) {
    throw new Error("Safe owners must be unique.");
  }
  return normalized;
}

export function buildGovernanceSafeTransaction({
  owners = GOVERNANCE_OWNERS,
  threshold = GOVERNANCE_THRESHOLD,
  saltNonce = DEFAULT_SALT_NONCE,
} = {}) {
  const normalizedOwners = normalizeOwners(owners);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > normalizedOwners.length) {
    throw new Error("Safe threshold must be between 1 and the owner count.");
  }
  if (normalizedOwners.length !== 7 || threshold !== 4) {
    throw new Error("The LQC Governance Safe must use the reviewed 4-of-7 policy.");
  }
  const initializer = safeInterface.encodeFunctionData("setup", [
    normalizedOwners,
    threshold,
    ethers.ZeroAddress,
    "0x",
    SAFE_FALLBACK_HANDLER,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);
  const data = factoryInterface.encodeFunctionData("createProxyWithNonce", [
    SAFE_SINGLETON,
    initializer,
    saltNonce,
  ]);
  return {
    schemaVersion: 1,
    purpose: "LQC Governance Safe deployment",
    network: { name: "BSC Testnet", chainId: BSC_TESTNET_CHAIN_ID },
    safeVersion: SAFE_VERSION,
    policy: { owners: normalizedOwners, threshold },
    contracts: {
      proxyFactory: SAFE_PROXY_FACTORY,
      singleton: SAFE_SINGLETON,
      fallbackHandler: SAFE_FALLBACK_HANDLER,
    },
    saltNonce: saltNonce.toString(),
    transaction: { to: SAFE_PROXY_FACTORY, value: "0", data },
    warning: "Unsigned BSC testnet transaction. Verify chain ID 97 and every owner before signing.",
  };
}

export async function inspectGovernanceSafe(provider, safeAddress) {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(`Wrong network: expected chain 97, received ${network.chainId}.`);
  }
  const code = await provider.getCode(safeAddress);
  if (code === "0x") throw new Error("No Safe bytecode exists at the supplied address.");
  const safe = new ethers.Contract(safeAddress, safeInterface, provider);
  const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
  const expected = normalizeOwners(GOVERNANCE_OWNERS).map((address) => address.toLowerCase()).sort();
  const actual = owners.map((address) => ethers.getAddress(address).toLowerCase()).sort();
  if (Number(threshold) !== GOVERNANCE_THRESHOLD || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Deployed Safe does not match the reviewed 4-of-7 governance policy.");
  }
  return { status: "VERIFIED", safeAddress: ethers.getAddress(safeAddress), owners, threshold: Number(threshold) };
}

async function main() {
  const bundle = buildGovernanceSafeTransaction();
  process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
