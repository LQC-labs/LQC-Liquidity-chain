import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/tokenomics-12pct.json"), "utf8"));
const asNumber = (value) => Number.parseInt(value, 10);
const total = config.allocations.reduce((sum, item) => sum + asNumber(item.total), 0);
const tge = config.allocations.reduce((sum, item) => sum + asNumber(item.tgeUnlocked), 0);
const failures = [];
if (total !== asNumber(config.token.maxSupply)) failures.push(`allocations total ${total} != max supply ${config.token.maxSupply}`);
if (tge !== asNumber(config.tgeCirculatingSupply)) failures.push(`TGE total ${tge} != declared ${config.tgeCirculatingSupply}`);
if (tge * 100 / total !== config.tgeCirculatingPercent) failures.push("TGE percentage mismatch");
for (const item of config.allocations) {
  if (asNumber(item.tgeUnlocked) > asNumber(item.total)) failures.push(`${item.id}: unlocked exceeds total`);
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`Tokenomics valid: total=${total.toLocaleString()} LQC, TGE=${tge.toLocaleString()} LQC (${config.tgeCirculatingPercent}%).`);

