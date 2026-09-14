import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const RISK_ABI = ["function owner() view returns(address)", "function pendingOwner() view returns(address)", "function executor() view returns(address)", "function tokenLimits(address) view returns(bool,uint256,uint256)", "function dexTokenCap(bytes32,address) view returns(uint256)"];
const TLQC = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const PANCAKE_V3 = "0x52fe36cd57d2173b4f2a956d3118ad26d720aadec7531ff26bca3a2cc0ef68a7";

export function assessRiskFinalization(snapshot, expected) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const checks = {
    executor: same(snapshot.executor, expected.executionRouter),
    tlqcLimits: snapshot.tlqc.allowed && snapshot.tlqc.maxPerTransaction === expected.tlqc.maxPerTransaction && snapshot.tlqc.maxPerDay === expected.tlqc.maxPerDay,
    tlqcDexCap: snapshot.tlqc.dexCap === expected.tlqc.maxPerTransaction,
    wbnbLimits: snapshot.wbnb.allowed && snapshot.wbnb.maxPerTransaction === expected.wbnb.maxPerTransaction && snapshot.wbnb.maxPerDay === expected.wbnb.maxPerDay,
    wbnbDexCap: snapshot.wbnb.dexCap === expected.wbnb.maxPerTransaction,
    governanceOwner: same(snapshot.owner, expected.governance),
    noPendingOwner: same(snapshot.pendingOwner, ethers.ZeroAddress),
  };
  const configurationReady = [checks.executor, checks.tlqcLimits, checks.tlqcDexCap, checks.wbnbLimits, checks.wbnbDexCap].every(Boolean);
  const ownershipReady = checks.governanceOwner && checks.noPendingOwner;
  return { status: configurationReady && ownershipReady ? "FINALIZED" : configurationReady ? "AWAITING_SAFE_ACCEPTANCE" : "BLOCKED", checks, safeToRepeatRiskConfiguration: false, nextAction: ownershipReady ? "Do not submit another ownership transaction." : "Governance Safe must execute acceptOwnership() once." };
}

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const record = JSON.parse(fs.readFileSync(path.join(root, "deployments/router2-execution-stack-stage3-bsc-testnet-97.json"), "utf8"));
  const provider = new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545", 97, { staticNetwork: true });
  if ((await provider.getNetwork()).chainId !== 97n) throw new Error("BSC Testnet chain 97 is required.");
  const riskAddress = record.executions?.riskRegistry?.address;
  const executionRouter = record.executions?.executionRouter?.address;
  if (!ethers.isAddress(riskAddress) || !ethers.isAddress(executionRouter)) throw new Error("Recorded Router 2.0 execution addresses are required.");
  const risk = new ethers.Contract(riskAddress, RISK_ABI, provider);
  const [owner, pendingOwner, executor, tlqc, wbnb, tlqcCap, wbnbCap, blockNumber] = await Promise.all([risk.owner(), risk.pendingOwner(), risk.executor(), risk.tokenLimits(TLQC), risk.tokenLimits(WBNB), risk.dexTokenCap(PANCAKE_V3, TLQC), risk.dexTokenCap(PANCAKE_V3, WBNB), provider.getBlockNumber()]);
  const normalize = (limits, dexCap) => ({ allowed: limits[0], maxPerTransaction: limits[1].toString(), maxPerDay: limits[2].toString(), dexCap: dexCap.toString() });
  const result = assessRiskFinalization({ owner, pendingOwner, executor, tlqc: normalize(tlqc, tlqcCap), wbnb: normalize(wbnb, wbnbCap) }, { governance: record.dependencies.governanceSafe, executionRouter, tlqc: record.pilotLimits.tLQC, wbnb: record.pilotLimits.WBNB });
  console.log(JSON.stringify({ schemaVersion: 1, network: { name: "BSC Testnet", chainId: 97 }, blockNumber, riskRegistry: riskAddress, ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
