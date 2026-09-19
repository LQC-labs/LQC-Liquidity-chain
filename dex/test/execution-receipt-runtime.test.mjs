import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

// Behavioral tests against compiled bytecode, not source-text assertions.
// These isolated local EVM transactions never connect to BSC or use real keys/funds.
const artifact = JSON.parse(fs.readFileSync(new URL(
  "../artifacts/contracts/intent-v1/LQCExecutionReceipt.sol/LQCExecutionReceipt.json",
  import.meta.url
), "utf8"));
const hashTypes = ["uint256", "address", "bytes32", "bytes32", "address", "bytes32", "uint256", "uint256"];
const abi = ethers.AbiCoder.defaultAbiCoder();

async function fixture(chainId = 97) {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { chainId, hardfork: "shanghai", time: new Date("2030-01-01T00:00:00Z") },
    miner: { timestampIncrement: 1 },
    wallet: { deterministic: true, totalAccounts: 4 }
  });
  const provider = new ethers.BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  try {
    const owner = await provider.getSigner(0);
    const recorder = await provider.getSigner(1);
    const outsider = await provider.getSigner(2);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    const receipt = await factory.deploy(await owner.getAddress());
    await receipt.waitForDeployment();
    await (await receipt.setRecorder(await recorder.getAddress())).wait();
    return { rpc, provider, owner, recorder, outsider, factory, receipt };
  } catch (error) {
    provider.destroy();
    await rpc.disconnect();
    throw error;
  }
}

async function close(f) {
  if (!f) return;
  f.provider.destroy();
  await f.rpc.disconnect();
}

async function expectError(f, operation, name) {
  await assert.rejects(operation, error => {
    const data = error.data ?? error.info?.error?.data?.result;
    try { return f.receipt.interface.parseError(data)?.name === name; }
    catch { return error.revert?.name === name; }
  });
}

async function store(f, args) {
  const txReceipt = await (await f.receipt.connect(f.recorder).record(...args)).wait();
  assert.equal(txReceipt.status, 1);
  const event = txReceipt.logs.map(log => {
    try { return f.receipt.interface.parseLog(log); } catch { return null; }
  }).find(log => log?.name === "ReceiptRecorded");
  assert.ok(event, "ReceiptRecorded event missing");
  return { txReceipt, event, row: await f.receipt.receipts(args[0]) };
}

function hashOf(chainId, address, args, recordedAt) {
  return ethers.keccak256(abi.encode(hashTypes, [chainId, address, ...args, recordedAt]));
}

describe("6/4 Execution Receipt runtime security", function () {
  this.timeout(30000);
  let f, args;

  beforeEach(async function () {
    f = await fixture();
    args = [ethers.id("receipt-intent"), ethers.id("receipt-execution"),
      await f.outsider.getAddress(), ethers.id("receipt-route"), 100n];
  });
  afterEach(async function () { await close(f); f = undefined; });

  it("rejects an absent receipt even when all comparison fields are zero", async function () {
    assert.equal(await f.receipt.verify(args[0], ethers.ZeroHash, ethers.ZeroAddress, ethers.ZeroHash, 0n, 0n), false);
    assert.equal(await f.receipt.verify(ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroAddress, ethers.ZeroHash, 0n, 0n), false);
  });

  it("never returns a receipt hash for an unrecorded intent", async function () {
    await expectError(f, () => f.receipt.getReceiptHash(args[0]), "InvalidReceipt");
    await expectError(f, () => f.receipt.getReceiptHash(ethers.ZeroHash), "InvalidReceipt");
  });

  it("round-trips stored fields, event, timestamp and canonical receipt hash", async function () {
    const { txReceipt, event, row } = await store(f, args);
    const block = await f.provider.getBlock(txReceipt.blockNumber);
    assert.deepEqual(Array.from(row), [args[1], args[2], args[3], args[4], BigInt(block.timestamp)]);
    assert.deepEqual(Array.from(event.args), [...args, row.recordedAt]);
    assert.equal(await f.receipt.verify(...args, row.recordedAt), true);
    assert.equal(await f.receipt.getReceiptHash(args[0]), hashOf(97n, await f.receipt.getAddress(), args, row.recordedAt));
  });

  it("rejects mutation of every field including intent identity", async function () {
    const { row } = await store(f, args);
    const values = [...args, row.recordedAt];
    const mutations = [ethers.id("other-intent"), ethers.id("other-execution"),
      await f.owner.getAddress(), ethers.id("other-route"), 101n, row.recordedAt + 1n];
    for (let i = 0; i < values.length; i++) {
      const changed = [...values]; changed[i] = mutations[i];
      assert.equal(await f.receipt.verify(...changed), false, `field ${i} must be bound`);
    }
  });

  it("prevents unauthorized recorder changes and unauthorized writes", async function () {
    await expectError(f, () => f.receipt.connect(f.outsider).setRecorder.staticCall(args[2]), "Unauthorized");
    await expectError(f, () => f.receipt.connect(f.outsider).record.staticCall(...args), "Unauthorized");
    await expectError(f, () => f.receipt.connect(f.owner).record.staticCall(...args), "Unauthorized");
    assert.equal((await f.receipt.receipts(args[0])).executionHash, ethers.ZeroHash);
  });

  it("rejects a zero recorder and revokes the old recorder on rotation", async function () {
    await expectError(f, () => f.receipt.setRecorder.staticCall(ethers.ZeroAddress), "InvalidAddress");
    await (await f.receipt.setRecorder(args[2])).wait();
    await expectError(f, () => f.receipt.connect(f.recorder).record.staticCall(...args), "Unauthorized");
    await (await f.receipt.connect(f.outsider).record(...args)).wait();
    assert.equal((await f.receipt.receipts(args[0])).executionHash, args[1]);
  });

  for (const [index, value, name] of [
    [0, ethers.ZeroHash, "intent hash"], [1, ethers.ZeroHash, "execution hash"],
    [2, ethers.ZeroAddress, "solver"], [3, ethers.ZeroHash, "route"], [4, 0n, "output"]
  ]) {
    it(`rejects zero ${name} without creating a record`, async function () {
      const invalid = [...args]; invalid[index] = value;
      await expectError(f, () => f.receipt.connect(f.recorder).record.staticCall(...invalid), "InvalidReceipt");
      assert.equal((await f.receipt.receipts(invalid[0])).executionHash, ethers.ZeroHash);
    });
  }

  it("rejects duplicate writes on the EVM and leaves the first receipt unchanged", async function () {
    const { row } = await store(f, args);
    const originalHash = await f.receipt.getReceiptHash(args[0]);
    const changed = [...args]; changed[4] = 999n;
    await expectError(f, () => f.receipt.connect(f.recorder).record.staticCall(...changed), "ReceiptAlreadyExists");
    await assert.rejects(async () => {
      const tx = await f.receipt.connect(f.recorder).record(...changed, { gasLimit: 300000n });
      await tx.wait();
    }, error => error.code === "CALL_EXCEPTION" && error.receipt?.status === 0);
    assert.deepEqual(Array.from(await f.receipt.receipts(args[0])), Array.from(row));
    assert.equal(await f.receipt.getReceiptHash(args[0]), originalHash);
  });

  it("keeps receipts for distinct intents independent", async function () {
    const first = await store(f, args);
    const other = [...args]; other[0] = ethers.id("second-intent"); other[4] = 200n;
    const second = await store(f, other);
    assert.equal(await f.receipt.verify(...args, first.row.recordedAt), true);
    assert.equal(await f.receipt.verify(...other, second.row.recordedAt), true);
    assert.notEqual(await f.receipt.getReceiptHash(args[0]), await f.receipt.getReceiptHash(other[0]));
  });

  it("separates identical report fields across receipt-contract addresses", async function () {
    const other = await f.factory.deploy(await f.owner.getAddress());
    await other.waitForDeployment();
    await (await other.setRecorder(await f.recorder.getAddress())).wait();
    // Two read-only previews in the same block bind identical fields and timestamp.
    const left = await f.receipt.connect(f.recorder).record.staticCall(...args);
    const right = await other.connect(f.recorder).record.staticCall(...args);
    const block = await f.provider.getBlock("latest");
    assert.equal(left, hashOf(97n, await f.receipt.getAddress(), args, BigInt(block.timestamp)));
    assert.equal(right, hashOf(97n, await other.getAddress(), args, BigInt(block.timestamp)));
    assert.notEqual(left, right);
  });

  it("separates identical records on isolated EVM chains 97 and 56", async function () {
    const other = await fixture(56);
    try {
      assert.equal(await f.receipt.getAddress(), await other.receipt.getAddress());
      const left = await store(f, args);
      const right = await store(other, args);
      assert.equal(left.row.recordedAt, right.row.recordedAt);
      assert.deepEqual(Array.from(left.row), Array.from(right.row));
      const leftHash = await f.receipt.getReceiptHash(args[0]);
      const rightHash = await other.receipt.getReceiptHash(args[0]);
      assert.equal(leftHash, hashOf(97n, await f.receipt.getAddress(), args, left.row.recordedAt));
      assert.equal(rightHash, hashOf(56n, await other.receipt.getAddress(), args, right.row.recordedAt));
      assert.notEqual(leftHash, rightHash);
    } finally { await close(other); }
  });
});
