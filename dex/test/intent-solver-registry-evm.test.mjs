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

function compileRegistryArtifact() {
  const registrySource = fs.readFileSync(
    new URL("../intent-contracts/LQCIntentSolverRegistry.sol", import.meta.url),
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
      "contracts/libraries/SafeTransferLib.sol": { content: safeTransferSource }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "shanghai",
      outputSelection: {
        "intent-contracts/LQCIntentSolverRegistry.sol": {
          LQCIntentSolverRegistry: ["abi", "evm.bytecode.object"]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  const compiled =
    output.contracts["intent-contracts/LQCIntentSolverRegistry.sol"].LQCIntentSolverRegistry;
  return { abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}` };
}

const registryArtifact = compileRegistryArtifact();

describe("LQC limited external solver registry", function () {
  this.timeout(30000);

  let provider;
  let admin;
  let solver;
  let outsider;
  let bondToken;
  let registry;
  const minimumBond = ethers.parseEther("100");

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
    bondToken = await new ethers.ContractFactory(
      tokenArtifact.abi,
      tokenArtifact.bytecode,
      admin
    ).deploy("Solver Bond", "SBOND");
    await bondToken.waitForDeployment();

    registry = await new ethers.ContractFactory(
      registryArtifact.abi,
      registryArtifact.bytecode,
      admin
    ).deploy(await bondToken.getAddress(), minimumBond, await admin.getAddress());
    await registry.waitForDeployment();
  });

  async function deposit(amount = minimumBond) {
    await (await bondToken.mint(await solver.getAddress(), amount)).wait();
    await (await bondToken.connect(solver).approve(await registry.getAddress(), amount)).wait();
    await (await registry.connect(solver).depositBond(amount)).wait();
  }

  async function activate() {
    await (await registry.scheduleSolver(await solver.getAddress())).wait();
    await provider.send("evm_increaseTime", [24 * 60 * 60]);
    await provider.send("evm_mine", []);
    await (await registry.connect(outsider).activateSolver(await solver.getAddress())).wait();
  }

  it("requires both minimum bond and the activation delay", async () => {
    await (await registry.scheduleSolver(await solver.getAddress())).wait();

    await assert.rejects(async () => {
      const tx = await registry.activateSolver(await solver.getAddress());
      await tx.wait();
    });

    await provider.send("evm_increaseTime", [24 * 60 * 60]);
    await provider.send("evm_mine", []);
    await assert.rejects(async () => {
      const tx = await registry.activateSolver(await solver.getAddress());
      await tx.wait();
    });

    await deposit();
    await (await registry.connect(outsider).activateSolver(await solver.getAddress())).wait();
    assert.equal((await registry.solvers(await solver.getAddress())).active, true);
  });

  it("caps executable exposure at the solver bond", async () => {
    await deposit();
    await activate();

    assert.equal(await registry.canExecute(await solver.getAddress(), minimumBond), true);
    assert.equal(await registry.canExecute(await solver.getAddress(), minimumBond + 1n), false);
  });

  it("disables immediately on withdrawal request and enforces a seven-day delay", async () => {
    await deposit();
    await activate();
    const withdrawal = ethers.parseEther("60");

    await (await registry.connect(solver).requestWithdrawal(withdrawal)).wait();
    const state = await registry.solvers(await solver.getAddress());
    assert.equal(state.active, false);
    assert.equal(state.pendingWithdrawal, withdrawal);
    assert.equal(await registry.canExecute(await solver.getAddress(), 1n), false);

    await assert.rejects(async () => {
      const tx = await registry.connect(solver).withdrawBond();
      await tx.wait();
    });

    await provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await provider.send("evm_mine", []);
    const before = await bondToken.balanceOf(await solver.getAddress());
    await (await registry.connect(solver).withdrawBond()).wait();
    assert.equal(await bondToken.balanceOf(await solver.getAddress()), before + withdrawal);
    assert.equal(
      (await registry.solvers(await solver.getAddress())).bond,
      minimumBond - withdrawal
    );
  });

  it("lets only admin or guardian disable and keeps admin transfer two-step", async () => {
    await deposit();
    await activate();

    await assert.rejects(async () => {
      const tx = await registry.connect(outsider).disableSolver(await solver.getAddress());
      await tx.wait();
    });

    await (await registry.setGuardian(await outsider.getAddress())).wait();
    await (await registry.connect(outsider).disableSolver(await solver.getAddress())).wait();
    assert.equal((await registry.solvers(await solver.getAddress())).active, false);

    await (await registry.proposeAdmin(await outsider.getAddress())).wait();
    assert.equal(await registry.admin(), await admin.getAddress());
    await (await registry.connect(outsider).acceptAdmin()).wait();
    assert.equal(await registry.admin(), await outsider.getAddress());
  });
});
