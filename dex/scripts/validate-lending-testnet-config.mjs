import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const address = (value, label) => {
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`Invalid ${label} address`);
  return ethers.getAddress(value);
};
const integer = (value, label) => {
  const result = BigInt(value);
  if (result <= 0n) throw new Error(`${label} must be positive`);
  return result;
};

export function validateLendingTestnetConfig(config) {
  if (config?.schemaVersion !== 1 || config?.network?.chainId !== 97) throw new Error("Lending config must target BSC Testnet chain 97");
  const governance = address(config.roles?.governanceSafe, "governance Safe"), guardian = address(config.roles?.guardianSafe, "guardian Safe"), treasury = address(config.roles?.treasurySafe, "treasury Safe");
  if (new Set([governance, guardian, treasury]).size !== 3) throw new Error("Lending Safe roles must be distinct");
  if (config.roles.governanceThreshold !== 4 || config.roles.governanceOwners !== 7 || config.roles.guardianThreshold !== 3 || config.roles.guardianOwners !== 5) throw new Error("Lending Safe policy must remain Governance 4/7 and Guardian 3/5");
  const collateral = address(config.market?.collateralAsset, "collateral"), debt = address(config.market?.debtAsset, "debt");
  if (collateral === debt) throw new Error("Collateral and debt assets must differ");
  if (![6,8,18].includes(config.market.collateralDecimals) || ![6,8,18].includes(config.market.debtDecimals)) throw new Error("Unsupported Lending asset decimals");
  if (config.market.maxLtvBps !== 5000 || config.market.liquidationThresholdBps !== 7000 || config.market.liquidationBonusBps !== 500) throw new Error("Lending risk policy must remain 50% LTV, 70% liquidation threshold and 5% bonus");
  const supplyCap = integer(config.market.supplyCap,"supply cap"), borrowCap = integer(config.market.borrowCap,"borrow cap"), minBorrow = integer(config.market.minBorrow,"minimum borrow");
  if (borrowCap >= supplyCap || minBorrow >= borrowCap) throw new Error("Lending caps are not conservatively ordered");
  const feeds = [config.oracle?.collateralPrimary,config.oracle?.collateralSecondary,config.oracle?.debtPrimary,config.oracle?.debtSecondary].map((value,index)=>address(value,`oracle ${index+1}`));
  if (new Set(feeds).size !== 4 || config.oracle.maxStalenessSeconds > 3600 || config.oracle.maxDeviationBps > 200 || config.oracle.maxStalenessSeconds <= 0 || config.oracle.maxDeviationBps <= 0) throw new Error("Lending requires four distinct dual feeds with <=1h staleness and <=2% deviation");
  if (config.rate.baseAprBps < 0 || config.rate.slope1AprBps <= 0 || config.rate.slope2AprBps <= 0 || config.rate.optimalUtilizationBps !== 8000 || config.rate.reserveFactorBps !== 1000 || config.rate.baseAprBps + config.rate.slope1AprBps + config.rate.slope2AprBps > 20000) throw new Error("Unsafe Lending interest model");
  const executor = address(config.composite?.executor,"Composite Executor"), core = address(config.composite?.lendingCore,"Lending Core"), adapter = address(config.composite?.supplyAdapter,"Supply Adapter");
  if (new Set([executor,core,adapter,governance,guardian,treasury,collateral,debt,...feeds]).size !== 12) throw new Error("Lending roles, assets, feeds and contracts must not alias");
  const marketId = ethers.solidityPackedKeccak256(["address","address"],[collateral,debt]);
  if (String(config.composite.marketId).toLowerCase() !== marketId.toLowerCase()) throw new Error("Composite Adapter market binding mismatch");
  const body = {schemaVersion:1,recordType:"LQC_LENDING_TESTNET_CONFIG_PREFLIGHT",status:"PASS_LENDING_TESTNET_CONFIG_PREFLIGHT",network:{name:"BSC Testnet",chainId:97},roles:{governanceSafe:governance,guardianSafe:guardian,treasurySafe:treasury},market:{...config.market,collateralAsset:collateral,debtAsset:debt,marketId},oracle:{...config.oracle,feeds},rate:config.rate,composite:{executor,lendingCore:core,supplyAdapter:adapter,marketId},checks:["chain-97","safe-role-separation","governance-4-of-7","guardian-3-of-5","ltv-50-percent","liquidation-threshold-70-percent","liquidation-bonus-5-percent","bounded-caps","four-distinct-dual-feeds","bounded-interest-model","market-pinned-composite-adapter"],transactionOccurred:false,safety:"Offline configuration validation only. No RPC, wallet, key, signature, approval, deployment, token movement, or transaction."};
  return {...body,preflightDigest:canonicalDigest(body)};
}

async function main(){const[inputFile,outputFile]=process.argv.slice(2);if(!inputFile)throw new Error("Usage: node validate-lending-testnet-config.mjs <config.json> [output.json]");const result=validateLendingTestnetConfig(JSON.parse(fs.readFileSync(path.resolve(inputFile),"utf8")));if(outputFile)fs.writeFileSync(path.resolve(outputFile),`${JSON.stringify(result,null,2)}\n`,{flag:"wx"});else console.log(JSON.stringify(result,null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
