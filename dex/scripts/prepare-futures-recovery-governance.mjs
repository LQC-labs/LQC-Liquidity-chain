import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const registryAbi = new ethers.Interface([
  "function approveRecoveryActivation(uint256 marketId,address expectedOracle,bytes32 expectedCodehash,bytes32 expectedConfigHash,uint256 expectedConfigVersion,uint256 expectedEpoch,uint256 validUntil)",
  "function activateMarket(uint256 marketId,uint256 expectedEpoch)",
  "function recoveryApproved(uint256) view returns (bool)",
  "function recoveryActivationValidUntil(uint256) view returns (uint256)",
  "function setRecoveryApproved(uint256 marketId,bool approved)",
  "function markets(uint256) view returns (bytes32 symbol,address indexToken,address collateralToken,address oracle,uint32 maxLeverageBps,uint32 maintenanceMarginBps,bool active)",
  "function marketMode(uint256) view returns (uint8)",
  "function recoveryOracle(uint256) view returns (address)",
  "function recoveryOracleCodehash(uint256) view returns (bytes32)",
  "function recoveryOracleConfigHash(uint256) view returns (bytes32)",
  "function recoveryOracleConfigVersion(uint256) view returns (uint256)",
  "function recoveryApprovalEpoch(uint256) view returns (uint256)",
  "function isRecoveryOracleApproved(uint256) view returns (bool)",
  "function RECOVERY_MAX_ORACLE_AGE() view returns (uint256)",
]);
const priceAbi = new ethers.Interface([
  "function getPrice(address indexToken) view returns (uint256 price,uint256 updatedAt)",
]);

function uint(value, field) {
  if (typeof value !== "bigint" &&
      !(typeof value === "number" && Number.isSafeInteger(value)) &&
      !(typeof value === "string" && /^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(value))) {
    throw new Error(`Invalid ${field}`);
  }
  const result = BigInt(value);
  if (result < 0n || result > ethers.MaxUint256) throw new Error(`Invalid ${field}`);
  return result;
}

function address(value, field) {
  if (!ethers.isAddress(value) || ethers.getAddress(value) === ethers.ZeroAddress) throw new Error(`Invalid ${field}`);
  return ethers.getAddress(value);
}

function hash(value, field) {
  if (!ethers.isHexString(value, 32) || value === ethers.ZeroHash) throw new Error(`Invalid ${field}`);
  return value.toLowerCase();
}

function target(request) {
  const chainId = uint(request.chainId, "chainId");
  const marketId = uint(request.marketId, "marketId");
  if (chainId === 0n || marketId === 0n) throw new Error("chainId and marketId must be nonzero");
  return { chainId, marketId, registry: address(request.registry, "Registry address") };
}

function equal(expected, observed, field) {
  if (expected !== observed) throw new Error(`Registry state mismatch: ${field}`);
}

/**
 * Reads one canonical block through an explicitly supplied read-only transport.
 * The CLI does not construct a provider and does not invoke this function.
 */
export async function readRecoverySnapshot(provider, registryAddress, marketId) {
  const registry = address(registryAddress, "Registry address");
  const id = uint(marketId, "marketId");
  const [chainId, block] = await Promise.all([
    provider.send("eth_chainId", []),
    provider.send("eth_getBlockByNumber", ["latest", false]),
  ]);
  if (!block) throw new Error("Registry snapshot block unavailable");
  const blockHash = hash(block.hash, "block hash");
  const blockRef = { blockHash, requireCanonical: true };
  const call = async (to, abi, name, args) => {
    const data = abi.encodeFunctionData(name, args);
    const result = await provider.send("eth_call", [{ to, data }, blockRef]);
    return abi.decodeFunctionResult(name, result);
  };
  const read = (name, args = [id]) => call(registry, registryAbi, name, args);
  const [market, [mode], [oracle], [codehash], [configHash], [version], [epoch], [oracleApproved], [maxAge], [activationApproved], [activationValidUntil]] =
    await Promise.all([
      read("markets"), read("marketMode"), read("recoveryOracle"), read("recoveryOracleCodehash"),
      read("recoveryOracleConfigHash"), read("recoveryOracleConfigVersion"), read("recoveryApprovalEpoch"),
      read("isRecoveryOracleApproved"), read("RECOVERY_MAX_ORACLE_AGE", []),
      read("recoveryApproved"), read("recoveryActivationValidUntil"),
    ]);
  const riskState = {
    chainId: uint(chainId, "chainId"), registry, marketId: id,
    blockNumber: uint(block.number, "block number"), blockHash, blockTimestamp: uint(block.timestamp, "block timestamp"),
    indexToken: market.indexToken, marketOracle: market.oracle, mode, oracle, codehash, configHash, version, epoch, oracleApproved, maxAge, activationApproved, activationValidUntil,
  };
  if (oracleApproved !== true || mode !== 1n) return riskState;
  const [price, updatedAt] = await call(market.oracle, priceAbi, "getPrice", [market.indexToken]);
  return { ...riskState, price, updatedAt };
}

// The request is prepared independently. Snapshot values never replace requested values.
export function prepareRecoveryActivation(request, snapshot, nowSeconds = Math.floor(Date.now() / 1000)) {
  const { chainId, marketId, registry } = target(request);
  const now = uint(nowSeconds, "current time");
  const oracle = address(request.oracle, "expected Oracle address");
  const codehash = hash(request.codehash, "expected code hash");
  const configHash = hash(request.configHash, "expected configuration hash");
  const version = uint(request.version, "expected configuration version");
  const epoch = uint(request.epoch, "expected recovery epoch");
  const validUntil = uint(request.validUntil, "approval expiry");
  if (validUntil === 0n || validUntil < now) throw new Error("Approval request expired");

  equal(chainId, uint(snapshot.chainId, "observed chain ID"), "chainId");
  equal(registry, address(snapshot.registry, "observed Registry address"), "Registry");
  equal(marketId, uint(snapshot.marketId, "observed market ID"), "marketId");
  equal(address(request.indexToken, "expected market token"), address(snapshot.indexToken, "observed market token"), "indexToken");
  if (uint(snapshot.mode, "market mode") !== 1n) throw new Error("Market is not REDUCE_ONLY");
  if (snapshot.oracleApproved !== true) throw new Error("Registry Oracle approval is not effective");
  equal(oracle, address(snapshot.marketOracle, "market Oracle"), "market Oracle");
  equal(oracle, address(snapshot.oracle, "approved Oracle"), "approved Oracle");
  equal(codehash, hash(snapshot.codehash, "observed code hash"), "runtime code hash");
  equal(configHash, hash(snapshot.configHash, "observed configuration hash"), "configuration hash");
  equal(version, uint(snapshot.version, "observed configuration version"), "configuration version");
  equal(epoch, uint(snapshot.epoch, "observed recovery epoch"), "recovery epoch");

  const blockHash = hash(snapshot.blockHash, "block hash");
  const blockNumber = uint(snapshot.blockNumber, "block number");
  const blockTime = uint(snapshot.blockTimestamp, "block timestamp");
  const updatedAt = uint(snapshot.updatedAt, "Oracle timestamp");
  const price = uint(snapshot.price, "Oracle price");
  const maxAge = uint(snapshot.maxAge, "Registry Oracle max age");
  if (blockTime > now || updatedAt === 0n || updatedAt > blockTime || price === 0n ||
      maxAge === 0n || now - updatedAt > maxAge) throw new Error("No fresh Oracle price");
  if (validUntil > updatedAt + maxAge) throw new Error("Approval expiry exceeds quote lifetime");

  const data = registryAbi.encodeFunctionData("approveRecoveryActivation", [
    marketId, oracle, codehash, configHash, version, epoch, validUntil,
  ]);
  return {
    status: "UNSIGNED_CALLDATA",
    chainId: chainId.toString(),
    observedBlock: { number: blockNumber.toString(), hash: blockHash, timestamp: blockTime.toString() },
    to: registry, value: "0", data,
  };
}

// Keep final activation separate from the call requesting Governance approval.
export function prepareRecoveryCompletion(request, snapshot, nowSeconds = Math.floor(Date.now() / 1000)) {
  const output = prepareRecoveryActivation(request, snapshot, nowSeconds);
  if (snapshot.activationApproved !== true) throw new Error("Registry activation approval is not effective");
  equal(uint(request.validUntil, "requested expiry"), uint(snapshot.activationValidUntil, "observed activation expiry"),
    "activation expiry");
  return {
    ...output,
    data: registryAbi.encodeFunctionData("activateMarket", [
      uint(request.marketId, "marketId"), uint(request.epoch, "expected recovery epoch"),
    ]),
  };
}

export function prepareRecoveryRevocation(request) {
  const { chainId, marketId, registry } = target(request);
  return {
    status: "UNSIGNED_CALLDATA",
    chainId: chainId.toString(),
    to: registry,
    value: "0",
    data: registryAbi.encodeFunctionData("setRecoveryApproved", [marketId, false]),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action, requestPath, snapshotPath, ...extra] = process.argv.slice(2);
    const usesSnapshot = action === "activate" || action === "complete";
    if (!requestPath || extra.length || (usesSnapshot ? !snapshotPath : action !== "revoke" || snapshotPath)) {
      throw new Error("Usage: node prepare-futures-recovery-governance.mjs (activate|complete) REQUEST.json SNAPSHOT.json | revoke REQUEST.json");
    }
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    let output;
    if (usesSnapshot) {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
      output = action === "complete" ? prepareRecoveryCompletion(request, snapshot) : prepareRecoveryActivation(request, snapshot);
    } else {
      output = prepareRecoveryRevocation(request);
    }
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}
