import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const ROUTER_ABI = ["function factory() view returns(address)", "function WBNB() view returns(address)"];
const ERC20_ABI = ["function balanceOf(address) view returns(uint256)"];

const same = (left, right) => ethers.getAddress(left) === ethers.getAddress(right);

export function parseRpcUrls(value) {
  const urls = String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  if (urls.length === 0 || urls.length > 8) throw new Error("Provide between one and eight BSC Testnet RPC URLs.");
  if (new Set(urls).size !== urls.length) throw new Error("BSC Testnet RPC URLs must be unique.");
  for (const url of urls) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("BSC Testnet RPC URL is invalid."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("BSC Testnet RPC URLs must use HTTPS without embedded credentials.");
    }
  }
  return urls;
}

export function createReadProvider(urls, timeoutMs = 10000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("RPC timeout must be 1-30 seconds.");
  const providers = parseRpcUrls(urls).map((url, index) => {
    const request = new ethers.FetchRequest(url); request.timeout = timeoutMs;
    return { provider: new ethers.JsonRpcProvider(request, 97, { staticNetwork: true }),
      priority: index + 1, stallTimeout: Math.min(2500, timeoutMs), weight: 1 };
  });
  return providers.length === 1 ? providers[0].provider : new ethers.FallbackProvider(providers, 97, { quorum: 1 });
}

const rpcLabel = value => { const parsed = new URL(value); return `${parsed.protocol}//${parsed.host}`; };
const rpcFailureCode = error => String(error?.code || "").toUpperCase() === "TIMEOUT" ? "TIMEOUT" :
  String(error?.message || "").includes("chain") ? "WRONG_CHAIN" : "UNAVAILABLE";

export async function selectHealthyRpc(value, timeoutMs = 10000, providerFactory = url => createReadProvider(url, timeoutMs)) {
  const urls = parseRpcUrls(value), diagnostics = [];
  for (const url of urls) {
    const label = rpcLabel(url), provider = providerFactory(url);
    try {
      const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
      if (BigInt(network.chainId) !== 97n) throw new Error(`wrong chain ${network.chainId}`);
      if (!Number.isSafeInteger(Number(blockNumber)) || Number(blockNumber) < 1) throw new Error("invalid block");
      diagnostics.push({ endpoint: label, status: "SELECTED", chainId: 97, blockNumber: Number(blockNumber) });
      return { provider, selectedEndpoint: label, diagnostics };
    } catch (error) {
      diagnostics.push({ endpoint: label, status: "FAILED", code: rpcFailureCode(error) });
    }
  }
  const failure = new Error("No healthy BSC Testnet RPC endpoint is available.");
  failure.diagnostics = diagnostics;
  throw failure;
}

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
  const rpcUrls = process.env.BSC_TESTNET_RPC_URLS || process.env.BSC_TESTNET_RPC_URL;
  if (!rpcUrls) throw new Error("Set BSC_TESTNET_RPC_URLS or BSC_TESTNET_RPC_URL. Never commit RPC credentials or private keys.");
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
  const timeoutMs = Number(process.env.MONITOR_RPC_TIMEOUT_MS || 10000);
  const selected = await selectHealthyRpc(rpcUrls, timeoutMs);
  const report = await monitorMinimalRouter({ provider: selected.provider, ...config });
  report.rpc = { selectedEndpoint: selected.selectedEndpoint, diagnostics: selected.diagnostics };
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "CRITICAL") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
