import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";
import solc from "solc";

const artifact = (name, source) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
    )
  );

function compileSettlementArtifacts() {
  const registrySource = fs.readFileSync(
    new URL("../intent-contracts/LQCIntentSolverRegistry.sol", import.meta.url),
    "utf8"
  );
  const ledgerSource = fs.readFileSync(
    new URL("../intent-contracts/LQCIntentSettlementLedger.sol", import.meta.url),
    "utf8"
  );
  const safeTransferSource = fs.readFileSync(
    new URL("../contracts/libraries/SafeTransferLib.sol", import.meta.url),
    "utf8"
  );
  const input = {
    language: "Solidity",
    sources: {
      "intent-contracts/LQCIntentSolverRegistry.sol": { content: registrySource },
      "intent-contracts/LQCIntentSettlementLedger.sol": { content: ledgerSource },
      "contracts/libraries/SafeTransferLib.sol": { content: safeTransferSource }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "shanghai",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  const pick = (source, name) => {
    const value = output.contracts[source][name];
    return { abi: value.abi, bytecode: `0x${value.evm.bytecode.object}` };
  };
  return {
    registry: pick("intent-contracts/LQCIntentSolverRegistry.sol", "LQCIntentSolverRegistry"),
    ledger: pick("intent-contracts/LQCIntentSettlementLedger.sol", "LQCIntentSettlementLedger")
  };
}

const compiled = compileSettlementArtifacts();

describe("LQC unsettled exposure settlement ledger", function () {
  this.timeout(30000);

  const minimumBond = ethers.parseEther("100");
  const exposure = ethers.parseEther("30");
  const intentId = ethers.id("settlement-intent");
  const quoteHash = ethers.id("settlement-quote");
  const settlementId = ethers.id("settlement-1");

  let provider;
  let admin;
  let solver;
  let outsider;
  let token;
  let registry;
  let ledger;

  beforeEach(async () => {
    provider = new ethers.BrowserProvider(
      ganache.provider({
        logging: { quiet: true },
        wallet: { mnemonic: "test test test test test test test test test test test junk" }
      })
    );
    admin = await provider.getSigner(0);
    solver = await provider.getSigner(1);
    outsider = await provider.getSigner(2);

    const tokenArtifact = artifact("MockERC20", "mocks/MockERC20");
    token = await new ethers.ContractFactory(
      tokenArtifact.abi,
      tokenArtifact.bytecode,
      admin
    ).deploy("Solver Bond", "SBOND");
    await token.waitForDeployment();

    registry = await new ethers.ContractFactory(
      compiled.registry.abi,
      compiled.registry.bytecode,
      admin
    ).deploy(await token.getAddress(), minimumBond, await admin.getAddress());
    await registry.waitForDeployment();
    ledger = await new ethers.ContractFactory(
      compiled.ledger.abi,
      compiled.ledger.bytecode,
      admin
    ).deploy(await registry.getAddress(), await admin.getAddress());
    await ledger.waitForDeployment();

    await (await token.mint(await solver.getAddress(), minimumBond)).wait();
    await (await token.connect(solver).approve(await registry.getAddress(), minimumBond)).wait();
    await (await registry.connect(solver).depositBond(minimumBond)).wait();
    await (await registry.scheduleSolver(await solver.getAddress())).wait();
    await provider.send("evm_increaseTime", [24 * 60 * 60]);
    await provider.send("evm_mine", []);
    await (await registry.activateSolver(await solver.getAddress())).wait();

    await (await registry.scheduleSettlementController(await ledger.getAddress())).wait();
    await (await ledger.scheduleOperator(await admin.getAddress())).wait();
    await provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
    await provider.send("evm_mine", []);
    await (await registry.activateSettlementController()).wait();
    await (await ledger.activateOperator()).wait();
  });

  async function reserve(
    id = settlementId,
    intent = intentId,
    quote = quoteHash,
    lifetime = 3600
  ) {
    const block = await provider.getBlock("latest");
    await (
      await ledger.reserveSettlement(
        id,
        intent,
        quote,
        await solver.getAddress(),
        exposure,
        block.timestamp + lifetime
      )
    ).wait();
  }

  it("reserves capacity, finalizes once, and releases solver exposure", async () => {
    const before = await registry.availableCapacity(await solver.getAddress());
    await reserve();
    assert.equal(await registry.reservedExposure(await solver.getAddress()), exposure);
    assert.equal(await registry.availableCapacity(await solver.getAddress()), before - exposure);

    const proofHash = ethers.id("proof-1");
    await (await ledger.finalizeSettlement(settlementId, proofHash)).wait();
    assert.equal(await registry.reservedExposure(await solver.getAddress()), 0n);
    assert.equal((await ledger.settlements(settlementId)).status, 2n);
    assert.equal(await ledger.finalizedIntent(intentId), true);
    assert.equal(await ledger.consumedProof(proofHash), true);

    await assert.rejects(async () => {
      const tx = await ledger.finalizeSettlement(settlementId, proofHash);
      await tx.wait();
    });
  });

  it("blocks duplicate intent and quote reservations", async () => {
    await reserve();
    const block = await provider.getBlock("latest");

    await assert.rejects(async () => {
      const tx = await ledger.reserveSettlement(
        ethers.id("settlement-2"),
        intentId,
        ethers.id("quote-2"),
        await solver.getAddress(),
        exposure,
        block.timestamp + 3600
      );
      await tx.wait();
    });
    await assert.rejects(async () => {
      const tx = await ledger.reserveSettlement(
        ethers.id("settlement-3"),
        ethers.id("intent-3"),
        quoteHash,
        await solver.getAddress(),
        exposure,
        block.timestamp + 3600
      );
      await tx.wait();
    });
  });

  it("pauses only new reservations while allowing existing settlement completion", async () => {
    await reserve();
    await (await ledger.pauseReservations()).wait();

    const proofHash = ethers.id("proof-paused");
    await (await ledger.finalizeSettlement(settlementId, proofHash)).wait();
    assert.equal((await ledger.settlements(settlementId)).status, 2n);
    assert.equal(await registry.reservedExposure(await solver.getAddress()), 0n);

    const block = await provider.getBlock("latest");
    await assert.rejects(async () => {
      const tx = await ledger.reserveSettlement(
        ethers.id("paused-new"),
        ethers.id("paused-intent"),
        ethers.id("paused-quote"),
        await solver.getAddress(),
        exposure,
        block.timestamp + 3600
      );
      await tx.wait();
    });
  });

  it("preserves permissionless expiry release after the controller is disabled", async () => {
    await reserve(settlementId, intentId, quoteHash, 10);
    await (await registry.disableSettlementController()).wait();
    assert.equal(await registry.settlementControllerEnabled(), false);

    await provider.send("evm_increaseTime", [11]);
    await provider.send("evm_mine", []);
    await (
      await ledger.connect(outsider).releaseExpiredSettlement(
        settlementId,
        { gasLimit: 500000n }
      )
    ).wait();

    assert.equal((await ledger.settlements(settlementId)).status, 3n);
    assert.equal(await registry.reservedExposure(await solver.getAddress()), 0n);
    assert.equal(await ledger.activeIntentSettlement(intentId), ethers.ZeroHash);
  });

  it("prevents bond withdrawal from consuming reserved exposure backing", async () => {
    await reserve();
    const unavailable = ethers.parseEther("71");
    await assert.rejects(async () => {
      const tx = await registry.connect(solver).requestWithdrawal(unavailable);
      await tx.wait();
    });

    await (await ledger.releaseSettlement(settlementId)).wait();
    await (
      await registry.connect(solver).requestWithdrawal(
        unavailable,
        { gasLimit: 500000n }
      )
    ).wait();
    assert.equal(
      (await registry.solvers(await solver.getAddress())).pendingWithdrawal,
      unavailable
    );
  });
});
