import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";
import solc from "solc";

function compileArtifacts() {
  const managerSource = fs.readFileSync(
    new URL("../intent-contracts/LQCIntentQuoteManager.sol", import.meta.url),
    "utf8"
  );
  const mockSource = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.24;
    contract MockSolverEligibility {
        mapping(address => bool) public eligible;
        mapping(address => uint256) public capacity;
        mapping(address => uint16) public riskPenaltyBps;
        function configure(address solver, bool allowed, uint256 cap, uint16 penalty) external {
            eligible[solver] = allowed;
            capacity[solver] = cap;
            riskPenaltyBps[solver] = penalty;
        }
        function canExecute(address solver, uint256 exposure) external view returns (bool) {
            return eligible[solver] && exposure <= capacity[solver];
        }
    }
  `;
  const input = {
    language: "Solidity",
    sources: {
      "intent-contracts/LQCIntentQuoteManager.sol": { content: managerSource },
      "test/MockSolverEligibility.sol": { content: mockSource }
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
    manager: pick("intent-contracts/LQCIntentQuoteManager.sol", "LQCIntentQuoteManager"),
    registry: pick("test/MockSolverEligibility.sol", "MockSolverEligibility")
  };
}

const compiled = compileArtifacts();

describe("LQC signed solver quote manager", function () {
  this.timeout(30000);

  const mnemonic = "test test test test test test test test test test test junk";
  const amountIn = ethers.parseEther("10");
  const exposure = ethers.parseEther("10");
  const intentId = ethers.id("intent-1");
  const tokenIn = "0x0000000000000000000000000000000000000011";
  const tokenOut = "0x0000000000000000000000000000000000000022";

  let provider;
  let admin;
  let solver1;
  let solver2;
  let registry;
  let manager;
  let domain;
  let types;

  beforeEach(async () => {
    provider = new ethers.BrowserProvider(
      ganache.provider({ logging: { quiet: true }, wallet: { mnemonic } })
    );
    admin = await provider.getSigner(0);
    solver1 = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/1");
    solver2 = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/2");

    registry = await new ethers.ContractFactory(
      compiled.registry.abi,
      compiled.registry.bytecode,
      admin
    ).deploy();
    await registry.waitForDeployment();
    manager = await new ethers.ContractFactory(
      compiled.manager.abi,
      compiled.manager.bytecode,
      admin
    ).deploy(await registry.getAddress());
    await manager.waitForDeployment();

    await (await registry.configure(solver1.address, true, exposure, 1000)).wait();
    await (await registry.configure(solver2.address, true, exposure, 0)).wait();

    domain = {
      name: "LQC Intent Quote Manager",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await manager.getAddress()
    };
    types = {
      SolverQuote: [
        { name: "intentId", type: "bytes32" },
        { name: "solver", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "grossAmountOut", type: "uint256" },
        { name: "gasCostInTokenOut", type: "uint256" },
        { name: "protocolFeeInTokenOut", type: "uint256" },
        { name: "netAmountOut", type: "uint256" },
        { name: "minimumAmountOut", type: "uint256" },
        { name: "routeHash", type: "bytes32" },
        { name: "validUntil", type: "uint64" },
        { name: "nonce", type: "uint256" }
      ]
    };
  });

  async function makeQuote(wallet, netAmountOut, nonce = 1n, validUntilOffset = 300) {
    const block = await provider.getBlock("latest");
    const gasCost = ethers.parseEther("1");
    const protocolFee = ethers.parseEther("1");
    const quote = {
      intentId,
      solver: wallet.address,
      tokenIn,
      tokenOut,
      amountIn,
      grossAmountOut: netAmountOut + gasCost + protocolFee,
      gasCostInTokenOut: gasCost,
      protocolFeeInTokenOut: protocolFee,
      netAmountOut,
      minimumAmountOut: ethers.parseEther("80"),
      routeHash: ethers.id(`route-${wallet.address}`),
      validUntil: BigInt(block.timestamp + validUntilOffset),
      nonce
    };
    return { quote, signature: await wallet.signTypedData(domain, types, quote) };
  }

  async function select(quotes, signatures, requiredExposure = exposure) {
    return manager.selectBestQuote(
      intentId,
      tokenIn,
      tokenOut,
      amountIn,
      ethers.parseEther("80"),
      requiredExposure,
      quotes,
      signatures
    );
  }

  it("selects the highest deterministic risk-adjusted net output", async () => {
    const first = await makeQuote(solver1, ethers.parseEther("100"));
    const second = await makeQuote(solver2, ethers.parseEther("95"));

    const result = await select(
      [first.quote, second.quote],
      [first.signature, second.signature]
    );
    assert.equal(result.selectedIndex, 1n);
    assert.equal(result.riskAdjustedAmountOut, ethers.parseEther("95"));
    assert.equal(result.quoteHash, await manager.hashQuote(second.quote));
  });

  it("rejects mutation of any signed economic term", async () => {
    const signed = await makeQuote(solver1, ethers.parseEther("100"));
    const tampered = {
      ...signed.quote,
      netAmountOut: signed.quote.netAmountOut + ethers.parseEther("1"),
      grossAmountOut: signed.quote.grossAmountOut + ethers.parseEther("1")
    };
    await assert.rejects(() => select([tampered], [signed.signature]));
  });

  it("rejects expired signed quotes", async () => {
    const signed = await makeQuote(solver1, ethers.parseEther("100"), 2n, 1);
    await provider.send("evm_increaseTime", [2]);
    await provider.send("evm_mine", []);
    await assert.rejects(() => select([signed.quote], [signed.signature]));
  });

  it("lets a solver invalidate its quote nonce", async () => {
    const signed = await makeQuote(solver1, ethers.parseEther("100"), 9n);
    const solverSigner = await provider.getSigner(1);
    await (await manager.connect(solverSigner).invalidateQuoteNonce(9n)).wait();
    await assert.rejects(() => select([signed.quote], [signed.signature]));
  });

  it("rejects an ineligible or over-capacity solver", async () => {
    const signed = await makeQuote(solver2, ethers.parseEther("100"), 4n);
    await assert.rejects(() =>
      select([signed.quote], [signed.signature], exposure + 1n)
    );
    await (await registry.configure(solver2.address, false, exposure, 0)).wait();
    await assert.rejects(() => select([signed.quote], [signed.signature]));
  });
});
