import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const ROUTER_ABI = ["function factory() view returns(address)", "function WBNB() view returns(address)"];
const ERC20_ABI = ["function balanceOf(address) view returns(uint256)"];

const same = (left, right) => ethers.getAddress(left) === ethers.getAddress(right);

export function minimalMonitorConfigFromDeployment(deployment) {
  if (Number(deployment?.network?.chainId) !== 97 || deployment?.mode !== "minimal-testnet-smoke") {
    throw new Error("Minimal deployment record must target BSC testnet chain 97.");
  }
  const mapped = { router: deployment?.contracts?.router, factory: deployment?.contracts?.factory,
    tlqc: deployment?.contracts?.tLQC, wbnb: deployment?.contracts?.wbnb };
  for (const [name, address] of Object.entries(mapped)) {
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) throw new Error(`Minimal deployment record is missing ${name}.`);
  }
  return mapped;
}

export function buildMinimalRouterReport({ checkedAt, blockNumber, router, expectedFactory, expectedWbnb,
  observedFactory, observedWbnb, balances }) {
  for (const [name, address] of Object.entries({ router, expectedFactory, expectedWbnb, observedFactory, observedWbnb })) {
    if (!ethers.isAddress(address)) throw new Error(`${name} is not a valid address.`);
  }
  if (!Array.isArray(balances) || balances.length < 3) throw new Error("Minimal Router balance evidence is incomplete.");
  const checks = [
    { id: "binding.factory", status: same(observedFactory, expectedFactory) ? "PASS" : "CRITICAL",
      detail: `observed ${ethers.getAddress(observedFactory)}; expected ${ethers.getAddress(expectedFactory)}` },
    { id: "binding.wbnb", status: same(observedWbnb, expectedWbnb) ? "PASS" : "CRITICAL",
      detail: `observed ${ethers.getAddress(observedWbnb)}; expected ${ethers.getAddress(expectedWbnb)}` }
  ];
  const seen = new Set();
  for (const item of balances) {
    if (!item || typeof item.asset !== "string" || seen.has(item.asset)) throw new Error("Minimal Router balance evidence is ambiguous.");
    seen.add(item.asset);
    let balance;
    try { balance = BigInt(item.balance); } catch { throw new Error(`Invalid ${item.asset} balance.`); }
    if (balance < 0n) throw new Error(`Invalid ${item.asset} balance.`);
    checks.push({ id: `custody.router.${item.asset}`, status: balance === 0n ? "PASS" : "CRITICAL",
      detail: `${balance} base units held` });
  }
  const critical = checks.filter(check => check.status === "CRITICAL").length;
  return { schemaVersion: 1, checkedAt, network: { chainId: 97, blockNumber: Number(blockNumber) },
    router: ethers.getAddress(router), status: critical ? "CRITICAL" : "HEALTHY",
    counts: { pass: checks.length - critical, critical }, checks };
}

export async function monitorMinimalRouter({ provider, router, factory, tlqc, wbnb, checkedAt = new Date().toISOString() }) {
  const network = await provider.getNetwork();
  if (BigInt(network.chainId) !== 97n) throw new Error(`Refusing monitoring on chain ${network.chainId}; expected BSC testnet 97.`);
  for (const [name, address] of Object.entries({ router, factory, tlqc, wbnb })) {
    if (!ethers.isAddress(address)) throw new Error(`${name} is not a valid address.`);
    if (await provider.getCode(address) === "0x") throw new Error(`${name} has no deployed bytecode.`);
  }
  const contract = new ethers.Contract(router, ROUTER_ABI, provider);
  const tlqcToken = new ethers.Contract(tlqc, ERC20_ABI, provider);
  const wbnbToken = new ethers.Contract(wbnb, ERC20_ABI, provider);
  const [blockNumber, observedFactory, observedWbnb, nativeBalance, tlqcBalance, wbnbBalance] = await Promise.all([
    provider.getBlockNumber(), contract.factory(), contract.WBNB(), provider.getBalance(router),
    tlqcToken.balanceOf(router), wbnbToken.balanceOf(router)
  ]);
  return buildMinimalRouterReport({ checkedAt, blockNumber, router, expectedFactory: factory, expectedWbnb: wbnb,
    observedFactory, observedWbnb, balances: [
      { asset: "BNB", balance: nativeBalance.toString() },
      { asset: "tLQC", balance: tlqcBalance.toString() },
      { asset: "WBNB", balance: wbnbBalance.toString() }
    ] });
}

async function main() {
  if (!process.env.BSC_TESTNET_RPC_URL) throw new Error("Set BSC_TESTNET_RPC_URL. Never commit RPC credentials or private keys.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.MINIMAL_DEPLOYMENT_FILE ||
    path.join(root, "deployments/minimal-bsc-testnet-97.local.json"));
  let config;
  if (fs.existsSync(deploymentPath)) {
    config = minimalMonitorConfigFromDeployment(JSON.parse(fs.readFileSync(deploymentPath, "utf8")));
  } else {
    config = { router: process.env.MINIMAL_ROUTER_ADDRESS, factory: process.env.MINIMAL_FACTORY_ADDRESS,
      tlqc: process.env.TLQC_ADDRESS, wbnb: process.env.WBNB_ADDRESS };
  }
  const report = await monitorMinimalRouter({ provider: new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL), ...config });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "CRITICAL") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
