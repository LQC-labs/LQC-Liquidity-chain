import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const RISK_ABI = [
  "function owner() view returns(address)",
  "function tokenLimits(address) view returns(bool,uint256,uint256)",
  "function dexTokenCap(bytes32,address) view returns(uint256)",
];
const REGISTRY_ABI = ["function getDex(bytes32) view returns(address,bool,uint32,string)"];

export function assessLqcFlowFinalization(snapshot, expected) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const checks = {
    governanceOwner: same(snapshot.owner, expected.safe),
    adapter: same(snapshot.dex.adapter, expected.adapter),
    dexEnabled: snapshot.dex.enabled === true,
    tlqcAllowed: snapshot.tlqc.allowed === true,
    wbnbAllowed: snapshot.wbnb.allowed === true,
    tlqcCap: snapshot.tlqc.cap === expected.tlqcCap,
    wbnbCap: snapshot.wbnb.cap === expected.wbnbCap,
  };
  const finalized = Object.values(checks).every(Boolean);
  return {
    status: finalized ? "FINALIZED" : "BLOCKED",
    checks,
    safeToRepeatCapTransactions: false,
    nextAction: finalized
      ? "Do not repeat either Safe cap transaction; continue with bounded route execution verification."
      : "Stop before swaps and review the failed read-only checks.",
  };
}

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const record = JSON.parse(fs.readFileSync(path.join(root, "deployments/router2-lqc-flow-safe-caps-bsc-testnet-97.json"), "utf8"));
  const provider = new ethers.JsonRpcProvider(
    process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    97,
    { staticNetwork: true },
  );
  if ((await provider.getNetwork()).chainId !== 97n) throw new Error("BSC Testnet chain 97 is required.");
  const risk = new ethers.Contract(record.targets.riskRegistry, RISK_ABI, provider);
  const registry = new ethers.Contract(record.targets.dexRegistry, REGISTRY_ABI, provider);
  const [owner, dex, tlqcLimits, wbnbLimits, tlqcCap, wbnbCap, blockNumber] = await Promise.all([
    risk.owner(),
    registry.getDex(record.dexId),
    risk.tokenLimits(record.actions[0].token),
    risk.tokenLimits(record.actions[1].token),
    risk.dexTokenCap(record.dexId, record.actions[0].token),
    risk.dexTokenCap(record.dexId, record.actions[1].token),
    provider.getBlockNumber(),
  ]);
  const result = assessLqcFlowFinalization({
    owner,
    dex: { adapter: dex[0], enabled: dex[1] },
    tlqc: { allowed: tlqcLimits[0], cap: tlqcCap.toString() },
    wbnb: { allowed: wbnbLimits[0], cap: wbnbCap.toString() },
  }, {
    safe: record.safe.address,
    adapter: record.targets.lqcFlowAdapter,
    tlqcCap: record.actions[0].cap,
    wbnbCap: record.actions[1].cap,
  });
  console.log(JSON.stringify({
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    blockNumber,
    riskRegistry: record.targets.riskRegistry,
    dexRegistry: record.targets.dexRegistry,
    dexId: record.dexId,
    ...result,
  }, null, 2));
  if (result.status !== "FINALIZED") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
