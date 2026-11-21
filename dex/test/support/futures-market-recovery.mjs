import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const send = async (call) => (await call).wait();

export async function activationRequest(registry, marketId) {
  const address = await registry.recoveryOracle(marketId);
  return [
    marketId, address, await registry.recoveryOracleCodehash(marketId),
    await registry.recoveryOracleConfigHash(marketId), await registry.recoveryOracleConfigVersion(marketId),
    await registry.recoveryApprovalEpoch(marketId), await registry.recoveryOracleApprovalValidUntil(marketId),
  ];
}

export async function approveActiveFuturesMarket(registry, marketId) {
  await send(registry.approveRecoveryActivation(...await activationRequest(registry, marketId)));
}

export async function activateApprovedFuturesMarket(registry, marketId) {
  const epoch = await registry.recoveryApprovalEpoch(marketId);
  await send(registry.activateMarket(marketId, epoch, { gasLimit: 500_000n }));
}

export async function enterReduceOnlyWithOracle(registry, marketId) {
  const market = await registry.markets(marketId);
  const codehash = ethers.keccak256(await registry.runner.provider.getCode(market.oracle));
  await send(registry.approveRecoveryOracle(marketId, market.oracle, codehash, { gasLimit: 500_000n }));
  await send(registry.setMarketMode(marketId, 1, { gasLimit: 500_000n }));
}

export async function activateFuturesFixture(registry, marketId, oracle) {
  assert.equal(await registry.marketMode(marketId), 2n);
  const market = await registry.markets(marketId);
  const [price] = await oracle.getPrice(market.indexToken);
  if (price === 0n) {
    await send(oracle.setPrice(market.indexToken, ethers.parseEther("50000"), { gasLimit: 100_000n }));
  }
  const artifactPath = "../../artifacts/contracts/futures/mocks/MockLQCFuturesRecoveryOracle.sol/MockLQCFuturesRecoveryOracle.json";
  const artifact = JSON.parse(readFileSync(new URL(artifactPath, import.meta.url)));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, registry.runner);
  const wrapper = await factory.deploy(market.indexToken, await oracle.getAddress());
  await wrapper.waitForDeployment();
  await send(registry.setOracle(marketId, await wrapper.getAddress()));
  await enterReduceOnlyWithOracle(registry, marketId);
  await approveActiveFuturesMarket(registry, marketId);
  await activateApprovedFuturesMarket(registry, marketId);
}
