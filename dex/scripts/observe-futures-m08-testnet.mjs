// 76-17-⑥-⑤ / M08 — BSC testnet historical Futures read-only snapshot.
// Never signs, sends transactions, or treats incomplete account enumeration as migration approval.
import { writeFileSync } from "node:fs";
import { ethers } from "ethers";

const DEPLOYMENTS = Object.freeze({
  registry: "0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
  vault: "0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
  oracle: "0xbf6a446c5e17228e70e45645ab47f751bdfc4b41",
  engine: "0xe4f1320c8709631776c7e39e0916584935882525"
});
const EXPECTED_CHAIN = 97n;
const rpc = process.env.BSC_TESTNET_READONLY_RPC || "https://bsc-testnet-dataseed.bnbchain.org";
const provider = new ethers.JsonRpcProvider(rpc, Number(EXPECTED_CHAIN), { staticNetwork: true });
const abi = {
  registry: new ethers.Interface([
    "function owner() view returns (address)",
    "function marketCount() view returns (uint256)",
    "function markets(uint256) view returns (bytes32 symbol,address indexToken,address collateralToken,address oracle,uint32 maxLeverageBps,uint32 maintenanceMarginBps,bool active)",
    "function marketMode(uint256) view returns (uint8)"
  ]),
  vault: new ethers.Interface([
    "function owner() view returns (address)",
    "function engine() view returns (address)",
    "function totalAccounted(address) view returns (uint256)",
    "function fundingPoolBalance(address) view returns (uint256)",
    "function insuranceFeeReserve(address) view returns (uint256)",
    "function treasuryFeeReserve(address) view returns (uint256)",
    "function residualBadDebt(address) view returns (uint256)",
    "function totalInsuranceCovered(address) view returns (uint256)"
  ]),
  engine: new ethers.Interface([
    "function registry() view returns (address)",
    "function vault() view returns (address)",
    "function openInterestUsd(uint256) view returns (uint256)"
  ]),
  erc20: new ethers.Interface([
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ])
};
const output = {
  schema: "lqc-futures-m08-bsc-testnet-readonly-v1",
  chainIdExpected: "97",
  baseline: "historical test-only stack deployed 2026-09-19",
  transactionOccurred: false, signingPerformed: false, deploymentPerformed: false,
  operationalCutoverAuthorized: false, migrationGate: "BLOCKED",
  accountDiscoveryComplete: false,
  note: "This report cannot establish current open user positions or account inventory completeness."
};
const str = x => typeof x === "bigint" ? x.toString() : x;
async function read(to, iface, name, args, blockNumber) {
  const raw = await provider.call({ to, data: iface.encodeFunctionData(name, args) }, blockNumber);
  return iface.decodeFunctionResult(name, raw);
}
async function run() {
  const chain = (await provider.getNetwork()).chainId;
  const actualChain = await provider.send("eth_chainId", []);
  if (chain !== EXPECTED_CHAIN || BigInt(actualChain) !== EXPECTED_CHAIN) throw new Error("chainId does not equal 97");
  const bn = await provider.getBlockNumber();
  const block = await provider.getBlock(bn);
  if (!block?.hash) throw new Error("snapshot block unavailable");
  output.blockNumber = String(bn);
  output.blockHash = block.hash;
  output.contracts = {};
  for (const [name, address] of Object.entries(DEPLOYMENTS)) {
    const code = await provider.getCode(address, bn);
    output.contracts[name] = {
      address: ethers.getAddress(address),
      runtimePresent: code !== "0x",
      runtimeHash: code === "0x" ? null : ethers.keccak256(code)
    };
  }
  if (Object.values(output.contracts).some(x => !x.runtimePresent)) {
    output.status = "BLOCKED";
    output.reason = "historical deployment runtime missing at pinned block";
    return;
  }
  const [registryOwner, marketCount, vaultOwner, vaultEngine, engineRegistry, engineVault] = await Promise.all([
    read(DEPLOYMENTS.registry, abi.registry, "owner", [], bn),
    read(DEPLOYMENTS.registry, abi.registry, "marketCount", [], bn),
    read(DEPLOYMENTS.vault, abi.vault, "owner", [], bn),
    read(DEPLOYMENTS.vault, abi.vault, "engine", [], bn),
    read(DEPLOYMENTS.engine, abi.engine, "registry", [], bn),
    read(DEPLOYMENTS.engine, abi.engine, "vault", [], bn)
  ]);
  output.wiring = {
    registryOwner: registryOwner[0], vaultOwner: vaultOwner[0], vaultEngine: vaultEngine[0],
    engineRegistry: engineRegistry[0], engineVault: engineVault[0]
  };
  output.wiringMatchesRecorded = (
    vaultEngine[0].toLowerCase() === DEPLOYMENTS.engine &&
    engineRegistry[0].toLowerCase() === DEPLOYMENTS.registry &&
    engineVault[0].toLowerCase() === DEPLOYMENTS.vault
  );
  const n = marketCount[0];
  output.marketCount = n.toString();
  if (n > 30n) throw new Error("unexpectedly large market count; bounded read limit 30");
  output.markets = [];
  const collateralTokens = new Set();
  for (let i = 1n; i <= n; i++) {
    const [m, mode, oi] = await Promise.all([
      read(DEPLOYMENTS.registry, abi.registry, "markets", [i], bn),
      read(DEPLOYMENTS.registry, abi.registry, "marketMode", [i], bn).catch(() => null),
      read(DEPLOYMENTS.engine, abi.engine, "openInterestUsd", [i], bn).catch(() => null)
    ]);
    collateralTokens.add(m[2].toLowerCase());
    output.markets.push({
      marketId: i.toString(), indexToken: m[1], collateralToken: m[2], oracle: m[3],
      active: m[6], mode: mode === null ? "UNAVAILABLE_IN_HISTORICAL_REGISTRY" : str(mode[0]),
      openInterestUsd: oi === null ? "UNAVAILABLE_IN_HISTORICAL_ENGINE" : str(oi[0])
    });
  }
  output.vaultTokens = [];
  for (const token of collateralTokens) {
    const keys = ["totalAccounted","fundingPoolBalance","insuranceFeeReserve","treasuryFeeReserve","residualBadDebt","totalInsuranceCovered"];
    const fields = {};
    for (const name of keys) {
      try {
        fields[name] = str((await read(DEPLOYMENTS.vault, abi.vault, name, [token], bn))[0]);
      } catch {
        fields[name] = "UNAVAILABLE_IN_HISTORICAL_VAULT";
      }
    }
    fields.actualTokenBalance = str((await read(token, abi.erc20, "balanceOf", [DEPLOYMENTS.vault], bn))[0]);
    fields.decimals = str((await read(token, abi.erc20, "decimals", [], bn))[0]);
    output.vaultTokens.push({ token, ...fields });
  }
  output.status = "READ_ONLY_PARTIAL_OBSERVATION";
  output.reason = "Only bounded market aggregate reads. No trusted complete account inventory or historical event reconciliation.";
}
try {
  await run();
} catch (e) {
  output.status = "BLOCKED";
  output.reason = String(e?.message || e).slice(0, 500);
}
writeFileSync("futures-m08-readonly-report.json", JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
