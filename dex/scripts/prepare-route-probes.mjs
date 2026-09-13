import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

export function buildRouteProbes(deployment, amountInRaw = "1000000000000000") {
  const lqc = deployment?.contracts?.lqc?.address;
  const wbnb = deployment?.contracts?.wbnb?.address;
  if (!ethers.isAddress(lqc) || !ethers.isAddress(wbnb)) throw new Error("Deployment must contain valid lqc and wbnb addresses.");
  if (BigInt(amountInRaw) <= 0n) throw new Error("PROBE_AMOUNT_IN_RAW must be positive.");
  return (deployment.dexes || []).map(dex => {
    if (!ethers.isHexString(dex?.id, 32) || !ethers.isAddress(dex?.adapter)) throw new Error("Every DEX needs a valid id and adapter.");
    const probe = { label: `${dex.name} tLQC/WBNB`, dexId: dex.id, tokenIn: lqc, tokenOut: wbnb,
      amountInRaw: String(amountInRaw), path: [lqc, wbnb] };
    if (dex.kind === "v3") {
      if (!Array.isArray(dex.feeTiers) || !dex.feeTiers.map(Number).includes(2500)) {
        throw new Error(`${dex.name} must include the reviewed 2500 fee tier.`);
      }
      probe.fees = [2500];
    }
    return probe;
  });
}

function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentFile = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const outputFile = path.resolve(process.env.ROUTE_PROBES_FILE || path.join(root, "deployments/bsc-testnet-route-probes.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const probes = buildRouteProbes(deployment, process.env.PROBE_AMOUNT_IN_RAW || "1000000000000000");
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(probes, null, 2) + "\n");
  console.log(`Prepared ${probes.length} read-only quote probes in ${outputFile}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
