import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("LQC Intent v1 core", function () {
  this.timeout(30000);

  const mnemonic = "test test test test test test test test test test test junk";
  let rawProvider;
  let provider;
  let owner;
  let user;
  let solver;
  let outsider;
  let newOwner;
  let newSettler;
  let userSigningWallet;
  let outsiderSigningWallet;
  let tokenIn;
  let tokenOut;
  let hub;
  let escrow;
  let chainId;

  const domain = async () => ({
    name: "LQC Intent Hub",
    version: "1",
    chainId,
    verifyingContract: await hub.getAddress()
  });

  const types = {
    Intent: [
      { name: "user", type: "address" },
      { name: "sourceChainId", type: "uint256" },
      { name: "sourceToken", type: "address" },
      { name: "sourceAmount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "destinationToken", type: "address" },
      { name: "recipient", type: "address" },
      { name: "minAmountOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "salt", type: "bytes32" }
    ]
  };

  async function makeIntent(overrides = {}) {
    const block = await provider.getBlock("latest");
    return {
      user: await user.getAddress(),
      sourceChainId: chainId,
      sourceToken: await tokenIn.getAddress(),
      sourceAmount: ethers.parseEther("10"),
      destinationChainId: 11155111n,
      destinationToken: await tokenOut.getAddress(),
      recipient: await user.getAddress(),
      minAmountOut: ethers.parseEther("9"),
      deadline: BigInt(block.timestamp + 300),
      nonce: 1n,
      salt: ethers.id("intent-1"),
      ...overrides
    };
  }

  async function signIntent(intent, signer = userSigningWallet) {
    return signer.signTypedData(await domain(), types, intent);
  }

  beforeEach(async () => {
    rawProvider = ganache.provider({
      wallet: { mnemonic },
      chain: { chainId: 31337 },
      logging: { quiet: true }
    });
    provider = new ethers.BrowserProvider(rawProvider);
    owner = await provider.getSigner(0);
    user = await provider.getSigner(1);
    solver = await provider.getSigner(2);
    outsider = await provider.getSigner(3);
    newOwner = await provider.getSigner(4);
    newSettler = await provider.getSigner(5);
    userSigningWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/1");
    outsiderSigningWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/3");
    chainId = (await provider.getNetwork()).chainId;

    const deploy = async (name, source, signer, ...args) => {
      const item = artifact(name, source);
      const contract = await new ethers.ContractFactory(item.abi, item.bytecode, signer).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };

    tokenIn = await deploy("MockERC20", "mocks/MockERC20", owner, "Input", "IN");
    tokenOut = await deploy("MockERC20", "mocks/MockERC20", owner, "Output", "OUT");
    hub = await deploy(
      "LQCIntentHub",
      "intent-v1/LQCIntentHub",
      owner,
      await owner.getAddress(),
      await owner.getAddress(),
      await outsider.getAddress()
    );
    escrow = new ethers.Contract(
      await hub.sourceEscrow(),
      artifact("LQCSourceEscrow", "intent-v1/LQCSourceEscrow").abi,
      provider
    );

    await (await tokenIn.mint(await user.getAddress(), ethers.parseEther("100"))).wait();
    await (await tokenIn.connect(user).approve(await escrow.getAddress(), ethers.MaxUint256)).wait();
  });

  it("locks source assets for a valid EIP-712 intent", async () => {
    const intent = await makeIntent();
    const signature = await signIntent(intent);
    const hash = await hub.hashIntent(intent);

    await (await hub.connect(outsider).submitIntent(intent, signature)).wait();

    const record = await hub.getIntent(hash);
    const deposit = await escrow.getDeposit(hash);
    assert.equal(record.status, 1n);
    assert.equal(record.destinationChainId, intent.destinationChainId);
    assert.equal(record.destinationToken, intent.destinationToken);
    assert.equal(record.recipient, intent.recipient);
    assert.equal(record.minAmountOut, intent.minAmountOut);
    assert.equal(deposit.user, intent.user);
    assert.equal(deposit.amount, intent.sourceAmount);
    assert.equal(deposit.active, true);
    assert.equal(await tokenIn.balanceOf(await escrow.getAddress()), intent.sourceAmount);
  });

  it("rejects forged signatures, wrong source chains and duplicate nonces", async () => {
    const intent = await makeIntent();
    await assert.rejects(async () => {
      const tx = await hub.submitIntent(intent, await signIntent(intent, outsiderSigningWallet));
      await tx.wait();
    });

    const wrongChain = await makeIntent({ sourceChainId: chainId + 1n, salt: ethers.id("wrong-chain") });
    await assert.rejects(async () => {
      const tx = await hub.submitIntent(wrongChain, await signIntent(wrongChain));
      await tx.wait();
    });

    await (await hub.submitIntent(intent, await signIntent(intent))).wait();
    await (await hub.connect(user).cancelIntent(await hub.hashIntent(intent))).wait();
    const duplicate = await makeIntent({ salt: ethers.id("duplicate-nonce") });
    await assert.rejects(async () => {
      const tx = await hub.submitIntent(duplicate, await signIntent(duplicate));
      await tx.wait();
    });
  });

  it("refunds cancelled and expired intents", async () => {
    const cancelled = await makeIntent();
    const cancelledHash = await hub.hashIntent(cancelled);
    const balanceBefore = await tokenIn.balanceOf(await user.getAddress());
    await (await hub.submitIntent(cancelled, await signIntent(cancelled))).wait();
    await (await hub.connect(user).cancelIntent(cancelledHash)).wait();
    assert.equal(await tokenIn.balanceOf(await user.getAddress()), balanceBefore);
    assert.equal((await hub.getIntent(cancelledHash)).status, 3n);

    const block = await provider.getBlock("latest");
    const expiring = await makeIntent({ nonce: 2n, salt: ethers.id("expiring"), deadline: BigInt(block.timestamp + 5) });
    const expiringHash = await hub.hashIntent(expiring);
    await (await hub.submitIntent(expiring, await signIntent(expiring))).wait();
    await rawProvider.request({ method: "evm_increaseTime", params: [6] });
    await rawProvider.request({ method: "evm_mine", params: [] });
    await (await hub.connect(outsider).expireIntent(expiringHash)).wait();
    assert.equal((await hub.getIntent(expiringHash)).status, 4n);
    assert.equal((await escrow.getDeposit(expiringHash)).active, false);
  });

  it("allows only the settler to release escrow and blocks replay", async () => {
    const intent = await makeIntent();
    const hash = await hub.hashIntent(intent);
    await (await hub.submitIntent(intent, await signIntent(intent))).wait();
    const destinationTxHash = ethers.id("destination-payment-transaction");
    const actualAmountOut = ethers.parseEther("9.5");

    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).settleIntent(
        hash,
        await solver.getAddress(),
        destinationTxHash,
        actualAmountOut
      );
      await tx.wait();
    });

    await assert.rejects(async () => {
      const tx = await hub.settleIntent(
        hash,
        await solver.getAddress(),
        destinationTxHash,
        intent.minAmountOut - 1n
      );
      await tx.wait();
    });

    const solverBefore = await tokenIn.balanceOf(await solver.getAddress());
    await (await hub.settleIntent(hash, await solver.getAddress(), destinationTxHash, actualAmountOut)).wait();
    assert.equal(await tokenIn.balanceOf(await solver.getAddress()), solverBefore + intent.sourceAmount);
    const record = await hub.getIntent(hash);
    assert.equal(record.status, 2n);
    assert.equal(record.actualAmountOut, actualAmountOut);
    assert.equal(record.destinationTxHash, destinationTxHash);
    assert.equal(record.executionHash, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "uint256", "address", "address", "uint256", "bytes32"],
      [
        hash,
        await solver.getAddress(),
        intent.destinationChainId,
        intent.destinationToken,
        intent.recipient,
        actualAmountOut,
        destinationTxHash
      ]
    )));

    await assert.rejects(async () => {
      const tx = await hub.settleIntent(hash, await solver.getAddress(), destinationTxHash, actualAmountOut);
      await tx.wait();
    });
  });

  it("pauses new submissions and settlement without trapping refunds", async () => {
    const intent = await makeIntent();
    const hash = await hub.hashIntent(intent);
    await (await hub.submitIntent(intent, await signIntent(intent))).wait();
    await (await hub.connect(outsider).setPaused(true)).wait();

    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).setPaused(false);
      await tx.wait();
    });

    const second = await makeIntent({ nonce: 2n, salt: ethers.id("paused") });
    await assert.rejects(async () => {
      const tx = await hub.submitIntent(second, await signIntent(second));
      await tx.wait();
    });
    await (await hub.connect(user).cancelIntent(hash)).wait();
    assert.equal((await hub.getIntent(hash)).status, 3n);
    await (await hub.setPaused(false)).wait();
    assert.equal(await hub.paused(), false);
  });

  it("uses two-step transfers for owner and the high-risk settler role", async () => {
    const nextOwnerAddress = await newOwner.getAddress();
    await (await hub.transferOwnership(nextOwnerAddress)).wait();
    assert.equal(await hub.owner(), await owner.getAddress());
    assert.equal(await hub.pendingOwner(), nextOwnerAddress);
    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).acceptOwnership();
      await tx.wait();
    });
    await (await hub.connect(newOwner).acceptOwnership()).wait();
    assert.equal(await hub.owner(), nextOwnerAddress);

    const nextSettlerAddress = await newSettler.getAddress();
    await (await hub.connect(newOwner).setSettler(nextSettlerAddress)).wait();
    assert.equal(await hub.settler(), await owner.getAddress());
    assert.equal(await hub.pendingSettler(), nextSettlerAddress);
    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).acceptSettler();
      await tx.wait();
    });
    await (await hub.connect(newSettler).acceptSettler()).wait();
    assert.equal(await hub.settler(), nextSettlerAddress);
  });
});
