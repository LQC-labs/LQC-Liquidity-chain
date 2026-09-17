import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { validateLendingTestnetConfig } from "./validate-lending-testnet-config.mjs";
import { LENDING_STAGE0_DEFAULTS } from "./prepare-lending-stage0-feeds.mjs";

const ids = ["collateral-primary", "collateral-secondary", "debt-primary", "debt-secondary"];
export function finalizeLendingStage0Config({ baseConfig, manifest, verification }) {
  const { manifestDigest, ...manifestBody } = manifest, { verificationDigest, ...verificationBody } = verification;
  if (canonicalDigest(manifestBody) !== manifestDigest || canonicalDigest(verificationBody) !== verificationDigest || verification.status !== "VERIFIED_LENDING_STAGE0_FEEDS" || verification.manifestDigest !== manifestDigest || verification.transactionOccurred !== true) throw new Error("Invalid verified Stage-0 evidence");
  if (manifest.market?.collateralAsset.toLowerCase() !== LENDING_STAGE0_DEFAULTS.collateralAsset.toLowerCase() || manifest.market?.debtAsset.toLowerCase() !== LENDING_STAGE0_DEFAULTS.debtAsset.toLowerCase()) throw new Error("Stage-0 market asset substitution");
  if (baseConfig.market?.collateralAsset?.toLowerCase() !== manifest.market.collateralAsset.toLowerCase() || baseConfig.market?.debtAsset?.toLowerCase() !== manifest.market.debtAsset.toLowerCase()) throw new Error("Lending base config market mismatch");
  if (baseConfig.roles?.governanceSafe?.toLowerCase() !== manifest.governanceSafe.toLowerCase() || verification.deployments?.length !== 4) throw new Error("Lending governance or feed evidence mismatch");
  for (let i = 0; i < 4; i++) if (verification.deployments[i]?.id !== ids[i] || verification.deployments[i]?.owner?.toLowerCase() !== manifest.governanceSafe.toLowerCase() || verification.deployments[i]?.decimals !== 8 || verification.deployments[i]?.roundId !== "1") throw new Error("Verified feed order or state mismatch");
  const [collateralPrimary, collateralSecondary, debtPrimary, debtSecondary] = verification.deployments.map(x => x.address);
  const config = { ...baseConfig, oracle: { ...baseConfig.oracle, collateralPrimary, collateralSecondary, debtPrimary, debtSecondary } }, preflight = validateLendingTestnetConfig(config);
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE0_FINALIZED_CONFIG", status: "READY_FOR_LENDING_STAGE1_REVIEW", manifestDigest, verificationDigest, config, configPreflightDigest: preflight.preflightDigest, transactionOccurred: false, safety: "Deterministic configuration binding only. No RPC, wallet, key, signature, approval, deployment, token movement, or transaction." };
  return { ...body, finalizedConfigDigest: canonicalDigest(body) };
}

async function main() {
  const [baseFile, manifestFile, verificationFile, outputFile] = process.argv.slice(2); if (!baseFile || !manifestFile || !verificationFile) throw new Error("Usage: node finalize-lending-stage0-config.mjs <base-config> <manifest> <verification> [output]");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file))), result = finalizeLendingStage0Config({ baseConfig: read(baseFile), manifest: read(manifestFile), verification: read(verificationFile) });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
