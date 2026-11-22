// 76-17-⑥-⑤ / M10 — offline-only predeployment isolation manifest verifier.
// No RPC, no signer, no transaction, no deployment authority. Missing evidence => BLOCKED.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const ZERO="0x"+"0".repeat(40);
const OLD=Object.freeze({
  chainId:97,
  registry:"0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
  vault:"0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
  engine:"0xe4f1320c8709631776c7e39e0916584935882525",
  oracle:"0xbf6a446c5e17228e70e45645ab47f751bdfc4b41"
});
const normalize=(x)=>typeof x==="string"&&ADDRESS.test(x)&&x.toLowerCase()!==ZERO?x.toLowerCase():null;
const digest=(x)=>typeof x==="string"&&HASH.test(x)&&x.toLowerCase()!=="0x"+"0".repeat(64);
function bad(r,s){r.errors.push(s)}
function hold(r,s){r.blockers.push(s)}
export function verifyM10Manifest(m) {
  const r={schema:"lqc-m10-isolation-verdict-v1",status:"BLOCKED",scope:"OFFLINE_PREDEPLOYMENT_ONLY",
    failures:[],errors:[],blockers:[],operationalDeploymentAuthorized:false,
    historicalVaultSetEngineAuthorized:false,assetTransferAuthorized:false};
  try{
    if(!m||m.schema!=="lqc-m10-isolation-manifest-v1") throw Error("manifest schema missing");
    if(m.chainId!==97)throw Error("chainId mismatch");
    const old=m.historical;
    if(!old||old.chainId!==OLD.chainId)throw Error("historical chain mismatch");
    for(const key of ["registry","vault","engine","oracle"])
      if(normalize(old[key])!==OLD[key])throw Error("historical "+key+" address mismatch");
    const candidate=m.candidate;
    if(!candidate||typeof candidate!=="object")throw Error("candidate object missing");
    const names=["registry","vault","engine","oracle","collateralToken"];
    const values={};
    const known=new Set(Object.values(OLD).filter(x=>typeof x==="string"));
    for(const name of names){
      const value=candidate[name];
      if(value==null||value==="UNASSIGNED"){hold(r,"candidate "+name+" address not assigned");continue;}
      const address=normalize(value);
      if(!address)throw Error("candidate "+name+" invalid address");
      if(known.has(address))throw Error("candidate "+name+" aliases historical contract");
      if(Object.values(values).includes(address))throw Error("candidate component addresses reused");
      values[name]=address;
    }
    if(candidate.collateralToken && candidate.collateralToken!=="UNASSIGNED" &&
      normalize(candidate.collateralToken)===null)throw Error("invalid collateral token");
    if(candidate.chainId!==97)throw Error("candidate chainId mismatch");
    if(candidate.reusesHistoricalVault===true||candidate.callsHistoricalSetEngine===true||
       candidate.automaticallyTransfersLegacyAssets===true||candidate.copiesLegacyPositions===true)
      throw Error("candidate explicitly permits unsafe historical migration");
    for(const k of ["reusesHistoricalVault","callsHistoricalSetEngine",
      "automaticallyTransfersLegacyAssets","copiesLegacyPositions"])
      if(candidate[k]!==false)hold(r,k+" must be explicitly false");
    const wiring=m.wiring;
    if(!wiring||typeof wiring!=="object")throw Error("wiring evidence missing");
    const edges=[["vaultEngine","engine"],["engineRegistry","registry"],["engineVault","vault"],["marketOracle","oracle"]];
    for(const [edge,target] of edges){
      if(wiring[edge]==null||wiring[edge]==="UNVERIFIED"){hold(r,edge+" unverified");continue;}
      const a=normalize(wiring[edge]);
      if(!a)throw Error(edge+" malformed");
      if(values[target] && a!==values[target])throw Error(edge+" points to wrong contract");
      if(!values[target])hold(r,edge+" cannot be checked without target");
    }
    if(m.snapshot?.blockNumber!==144115366||
       m.snapshot?.blockHash!=="0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208")
      throw Error("historical snapshot anchor mismatch");
    if(m.snapshot?.knownUserAvailableBaseUnits!=="5000000000000000000000")
      throw Error("known user balance evidence mismatch");
    if(m.snapshot?.userRightsDisposition!=="PRESERVE_IN_HISTORICAL_VAULT")
      throw Error("legacy user rights disposition not preserved");
    if(!digest(m.source?.registryRuntimeCodehash))hold(r,"registry runtime code hash missing");
    if(!digest(m.source?.vaultRuntimeCodehash))hold(r,"vault runtime code hash missing");
    if(!digest(m.source?.engineRuntimeCodehash))hold(r,"engine runtime code hash missing");
    if(!digest(m.source?.oracleRuntimeCodehash))hold(r,"oracle runtime code hash missing");
    for(const field of ["oracleFeedProvenanceVerified","oraclePriceFreshnessVerified",
      "oracleConfigHashVerified","recoveryEpochBound","ownerAndGuardianReviewed",
      "multisigApprovalDocumented","independentSecurityReview",
      "testOnlyDeploymentApproval","independentAccountInventoryAttestation"]){
      if(m.gates?.[field]!==true)hold(r,field+" missing independent evidence");
    }
    // This manifest checks structure and reviewer claims, not underlying chain authenticity.
    hold(r,"offline assertions cannot prove contract bytecode, feed authenticity, or signer approvals");
    hold(r,"M10 does not grant deployment or asset-moving permissions");
  }catch(err){r.errors.push(String(err.message||err));}
  r.failures=r.errors;
  r.status=r.errors.length?"FAIL":"BLOCKED";
  return r;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3){console.error("Usage: node scripts/verify-futures-m10-manifest.mjs MANIFEST.json");process.exitCode=2;}
  else try{const r=verifyM10Manifest(JSON.parse(readFileSync(process.argv[2],"utf8")));
    console.log(JSON.stringify(r,null,2));if(r.status==="FAIL")process.exitCode=1;
  }catch(e){console.error(String(e.message));process.exitCode=2}
}
