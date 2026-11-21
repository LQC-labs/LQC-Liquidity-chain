import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  prepareRecoveryActivation, prepareRecoveryRevocation, readRecoverySnapshot,
} from "../scripts/prepare-futures-recovery-governance.mjs";

const registry = "0x" + "11".repeat(20);
const oracle = "0x" + "22".repeat(20);
const indexToken = "0x" + "33".repeat(20);
const anotherAddress = "0x" + "44".repeat(20);
const codehash = "0x" + "55".repeat(32);
const configHash = "0x" + "66".repeat(32);
const blockHash = "0x" + "77".repeat(32);
const otherHash = "0x" + "99".repeat(32);
const now = 2_000_000_000n;
const request = {
  chainId: "31337", registry, marketId: "1", indexToken, oracle, codehash, configHash,
  version: "9", epoch: "27", validUntil: (now + 30n).toString(),
};
const snapshot = {
  ...request, marketOracle: oracle, blockHash, blockNumber: "128", blockTimestamp: now.toString(), mode: "1",
  oracleApproved: true, price: "50000000000000000000000", updatedAt: (now - 10n).toString(), maxAge: "120",
};
const approve = "approveRecoveryActivation(uint256,address,bytes32,bytes32,uint256,uint256,uint256)";
const revoke = "setRecoveryApproved(uint256,bool)";
const abi = new ethers.Interface([`function ${approve}`, `function ${revoke}`]);

it("encodes all seven requested arguments in PR #460 ABI order", () => {
  const output = prepareRecoveryActivation(request, snapshot, now);
  assert.equal(output.status, "UNSIGNED_CALLDATA");
  assert.equal(output.chainId, request.chainId);
  assert.equal(output.to, registry);
  assert.equal(output.value, "0");
  assert.equal(output.observedBlock.hash, blockHash);
  assert.equal(output.data.slice(0, 10), ethers.id(approve).slice(0, 10));
  assert.deepEqual(Array.from(abi.decodeFunctionData(approve, output.data)), [
    1n, oracle, codehash, configHash, 9n, 27n, now + 30n,
  ]);
});

it("rejects mismatched chain, Registry, market and index token", () => {
  for (const change of [{ chainId: "97" }, { registry: anotherAddress }, { marketId: "2" }, { indexToken: anotherAddress }]) {
    assert.throws(() => prepareRecoveryActivation(request, { ...snapshot, ...change }, now), /state mismatch/);
  }
});

it("rejects Oracle replacement, runtime drift and historical version or epoch reuse", () => {
  for (const change of [
    { marketOracle: anotherAddress }, { oracle: anotherAddress }, { codehash: otherHash }, { configHash: otherHash },
    { version: "10" }, { epoch: "28" },
  ]) {
    assert.throws(() => prepareRecoveryActivation(request, { ...snapshot, ...change }, now), /state mismatch/);
  }
  assert.throws(() => prepareRecoveryActivation(request, { ...snapshot, oracleApproved: false }, now), /not effective/);
});

it("requires the staged REDUCE_ONLY mode even with an otherwise matching approval", () => {
  for (const mode of ["0", "2"]) {
    assert.throws(() => prepareRecoveryActivation(request, { ...snapshot, mode }, now), /not REDUCE_ONLY/);
  }
});

it("blocks expired approval even with a refreshed quote, and rejects bounds beyond quote expiry", () => {
  assert.throws(() => prepareRecoveryActivation({ ...request, validUntil: now - 1n }, {
    ...snapshot, updatedAt: now,
  }, now), /request expired/);
  assert.throws(() => prepareRecoveryActivation({ ...request, validUntil: now + 111n }, snapshot, now), /exceeds quote/);
  assert.doesNotThrow(() => prepareRecoveryActivation({ ...request, validUntil: now + 110n }, snapshot, now));
});

it("blocks zero, future, and stale prices including an aged snapshot", () => {
  for (const change of [{ price: "0" }, { updatedAt: "0" }, { updatedAt: now + 1n }, { updatedAt: now - 121n },
    { blockTimestamp: now + 1n }]) {
    assert.throws(() => prepareRecoveryActivation(request, { ...snapshot, ...change }, now), /No fresh Oracle price/);
  }
  assert.throws(() => prepareRecoveryActivation({ ...request, validUntil: now + 300n }, snapshot, now + 121n), /No fresh Oracle price/);
});

it("revocation always encodes false on the legacy ABI and needs no Oracle quote", () => {
  const output = prepareRecoveryRevocation({ chainId: "31337", registry, marketId: "1", approved: true });
  assert.equal(output.data.slice(0, 10), ethers.id(revoke).slice(0, 10));
  assert.deepEqual(Array.from(abi.decodeFunctionData(revoke, output.data)), [1n, false]);
});

function localReadTransport({ oracleApproved = true, priceReverts = false } = {}) {
  const responses = [
    ["markets(uint256)", ["bytes32", "address", "address", "address", "uint32", "uint32", "bool"],
      [ethers.encodeBytes32String("BTC/tUSD"), indexToken, anotherAddress, oracle, 100000, 500, true]],
    ["marketMode(uint256)", ["uint8"], [1]],
    ["recoveryOracle(uint256)", ["address"], [oracle]],
    ["recoveryOracleCodehash(uint256)", ["bytes32"], [codehash]],
    ["recoveryOracleConfigHash(uint256)", ["bytes32"], [configHash]],
    ["recoveryOracleConfigVersion(uint256)", ["uint256"], [9]],
    ["recoveryApprovalEpoch(uint256)", ["uint256"], [27]],
    ["isRecoveryOracleApproved(uint256)", ["bool"], [oracleApproved]],
    ["RECOVERY_MAX_ORACLE_AGE()", ["uint256"], [120]],
    ["getPrice(address)", ["uint256", "uint256"], [snapshot.price, snapshot.updatedAt]],
  ];
  const calls = [];
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return {
    calls,
    async send(method, params) {
      calls.push(method);
      if (method === "eth_chainId") return "0x7a69";
      if (method === "eth_getBlockByNumber") {
        assert.deepEqual(params, ["latest", false]);
        return { hash: blockHash, number: "0x80", timestamp: ethers.toQuantity(now) };
      }
      assert.equal(method, "eth_call");
      assert.deepEqual(params[1], { blockHash, requireCanonical: true });
      const { to, data } = params[0];
      const match = responses.find(([signature]) => data.slice(0, 10) === ethers.id(signature).slice(0, 10));
      assert.ok(match, "unexpected ABI selector");
      if (match[0] === "getPrice(address)") {
        assert.equal(to, oracle);
        assert.deepEqual(Array.from(coder.decode(["address"], "0x" + data.slice(10))), [indexToken]);
        if (priceReverts) throw new Error("fixture Oracle revert");
      } else {
        assert.equal(to, registry);
        if (match[0].endsWith("(uint256)")) {
          assert.deepEqual(Array.from(coder.decode(["uint256"], "0x" + data.slice(10))), [1n]);
        }
      }
      return coder.encode(match[1], match[2]);
    },
  };
}

it("collector uses only read-only calls pinned to one canonical block hash", async () => {
  const provider = localReadTransport();
  const read = await readRecoverySnapshot(provider, registry, 1);
  assert.equal(read.updatedAt, now - 10n);
  assert.equal(prepareRecoveryActivation(request, read, now).observedBlock.hash, blockHash);
  assert.deepEqual([...new Set(provider.calls)].sort(), ["eth_call", "eth_chainId", "eth_getBlockByNumber"]);
  assert.equal(provider.calls.filter((method) => method === "eth_call").length, 10);
});

it("collector blocks ineffective approval and propagates a reverted Oracle quote", async () => {
  const invalid = localReadTransport({ oracleApproved: false });
  const read = await readRecoverySnapshot(invalid, registry, 1);
  assert.throws(() => prepareRecoveryActivation(request, read, now), /not effective/);
  assert.equal(invalid.calls.filter((method) => method === "eth_call").length, 9);
  await assert.rejects(readRecoverySnapshot(localReadTransport({ priceReverts: true }), registry, 1), /Oracle revert/);
});
