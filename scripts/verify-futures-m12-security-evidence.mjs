// 76-17-⑥-⑤ / M12 — offline security-evidence gate for candidate Futures Oracle and governance.
// It does NOT authenticate arbitrary self-reported attestations, perform RPC or authorize activation.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const A=/^0x[0-9a-fA-F]{40}$/, H=/^0x[0-9a-fA-F]{64}$/;
const ZERO="0x"+"0".repeat(40);
const a=x=>typeof x==="string"&&A.test(x)&&x.toLowerCase()!==ZERO?x.toLowerCase():null;
const h=x=>typeof x==="string"&&H.test(x)&&x.toLowerCase()!=="0x"+"0".repeat(64)?x.toLowerCase():null;
const int=x=>Number.isSafeInteger(x)&&x>=0;
const LEGACY=new Set([
"0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
"0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
"0xe4f1320c8709631776c7e39e0916584935882525",
"0xbf6a446c5e17228e70e45645ab47f751bdfc4b41"
]);
export function verifyM12SecurityEvidence(v) {
 const r={workId:"76-17-⑥-⑤/M12",status:"BLOCKED",scope:"OFFLINE_SECURITY_EVIDENCE_ONLY",
   confirmed:[],blockers:[],failures:[],independentReviewAccepted:false,
   productionOracleApproved:false,marketActivationAuthorized:false,
   deploymentAuthorized:false,legacyMigrationAuthorized:false,assetTransferAuthorized:false};
 const fail=s=>r.failures.push(s),hold=s=>r.blockers.push(s);
 try{
   if(!v||v.schema!=="lqc-futures-m12-security-evidence-v1"||v.chainId!==97)
     throw Error("schema/chain mismatch");
   const x=v.candidate||{};
   const fields=["registry","vault","engine","oracle","feed","collateralToken"];
   const addresses={};
   for(const key of fields) {
     if(x[key]===null||x[key]===undefined||x[key]==="UNASSIGNED"){
       hold(key+" candidate unassigned");continue;
     }
     const address=a(x[key]);
     if(!address)throw Error(key+" malformed address");
     if(LEGACY.has(address))throw Error(key+" aliases historical core");
     if(Object.values(addresses).includes(address))throw Error(key+" aliases other candidate component");
     addresses[key]=address;
   }
   if(x.callsLegacySetEngine!==false||x.copiesLegacyLedger!==false||
      x.transfersLegacyCollateral!==false)throw Error("legacy mutation permitted");
   if(v.oracle?.providerMode!=="UNSELECTED"&&
      !["PYTH_PRO","CHAINLINK","VERIFIED_EXTERNAL_FEED"].includes(v.oracle?.providerMode))
     throw Error("unsupported oracle providerMode");
   if(!h(v.oracle?.runtimeCodehash))hold("oracle runtime hash not anchored");
   if(!h(v.oracle?.feedRuntimeCodehash))hold("feed runtime hash not anchored");
   if(!h(v.oracle?.feedImplementationCodehash))hold("feed implementation hash not anchored");
   if(!h(v.oracle?.configHash))hold("oracle config hash not anchored");
   if(!int(v.oracle?.configVersion)||v.oracle.configVersion===0)hold("oracle configVersion not pinned");
   if(!int(v.oracle?.heartbeatSeconds)||v.oracle.heartbeatSeconds===0)hold("oracle heartbeat not pinned");
   else if(v.oracle.heartbeatSeconds>86400)throw Error("oracle heartbeat exceeds contract limit");
   if(!int(v.oracle?.lastVerifiedPriceAgeSeconds))hold("oracle quote freshness not measured");
   else if(v.oracle.lastVerifiedPriceAgeSeconds>120)throw Error("quote age exceeds 120-second recovery boundary");
   if(v.oracle?.proxyProvenance!=="VERIFIED_INDEPENDENTLY")
     hold("feed/proxy implementation provenance not independently attested");
   if(v.oracle?.priceDecimalsReviewed!==true)hold("price decimals/normalization not reviewed");
   if(v.oracle?.referenceCircuitBreakerReviewed!==true)hold("reference feed/deviation circuit breaker not reviewed");
   const recovery=v.recovery||{};
   if(!int(recovery.marketId)||recovery.marketId===0)hold("marketId unassigned");
   if(!int(recovery.expectedEpoch))hold("expected recovery epoch not pinned");
   if(!int(recovery.approvalValidUntil))hold("activation approval expiry not pinned");
   if(!int(recovery.snapshotTimestamp))hold("snapshot timestamp not pinned");
   if(int(recovery.approvalValidUntil)&&int(recovery.snapshotTimestamp)&&
      recovery.approvalValidUntil<=recovery.snapshotTimestamp)
     throw Error("recovery approval already expired at snapshot");
   if(recovery.explicitEpochBoundActivation!==true)
     hold("activateMarket(marketId, expectedEpoch) transaction binding not independently verified");
   if(recovery.legacyActiveEntryPointsBlocked!==true)
     hold("legacy ACTIVE entry points not independently tested");
   if(recovery.guardianCannotReactivate!==true)
     hold("guardian reactivation restriction not independently tested");
   if(recovery.emergencyHaltVerified!==true)
     hold("HALTED emergency behavior not independently tested");
   const roles=v.authority||{};
   for(const key of ["registryOwner","vaultOwner","oracleOwner","guardian","safeAddress"]) {
     if(!a(roles[key]))hold(key+" address unassigned");
   }
   if(a(roles.safeAddress)&&a(roles.guardian)&&a(roles.safeAddress)===a(roles.guardian))
     hold("Safe and Guardian shared address; independent emergency role separation not established");
   if(roles.safeThreshold==null)hold("Safe threshold unassigned");
   else if(!int(roles.safeThreshold)||roles.safeThreshold===0)throw Error("invalid multisig threshold");
   if(roles.safeSignerCount==null)hold("Safe signer count unassigned");
   else if(!int(roles.safeSignerCount)||roles.safeSignerCount===0)throw Error("invalid Safe signer count");
   if(int(roles.safeThreshold)&&int(roles.safeSignerCount)&&roles.safeThreshold>roles.safeSignerCount)
     throw Error("Safe threshold exceeds signer count");
   if(roles.safeSignerProvenanceVerified!==true)hold("Safe signer membership/threshold not independently attested");
   if(roles.ownerAcceptanceVerified!==true)hold("2-step ownership acceptance not independently attested");
   if(roles.guardianEmergencyOnlyVerified!==true)hold("Guardian restriction not independently attested");
   const review=v.review||{};
   if(!h(review.sourceCommit))hold("reviewed source commit not anchored");
   if(review.independentAuditStatus!=="APPROVED")hold("independent security audit not approved");
   if(review.oracleLicenseCleared!==true)hold("Oracle integration/license status not established");
   if(review.epochReplayRegressionPassed!==true)hold("old-epoch calldata regression evidence missing");
   if(review.withdrawalRightsPreserved!==true)hold("historic user's rights not independently protected");
   if(review.deploymentApproval!==true)hold("test-only deployment approval absent");
   if(review.rawEvidenceVerifiedIndependently!==true)hold("raw receipts/Safe/Oracle evidence not independently verified");
   if(!r.failures.length&&r.blockers.length===0)
     r.confirmed.push("Supplied manifest is structurally consistent; authenticity still unproven");
   hold("Offline manifest cannot authenticate chain source, Safe signers or independent audit; M12 never authorizes a transaction");
 }catch(e){fail(String(e.message||e))}
 r.status=r.failures.length?"FAIL":"BLOCKED";
 return r;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3){console.error("Usage: node scripts/verify-futures-m12-security-evidence.mjs INPUT.json");process.exitCode=2;}
 else try{const r=verifyM12SecurityEvidence(JSON.parse(readFileSync(process.argv[2],"utf8")));
  console.log(JSON.stringify(r,null,2));if(r.status==="FAIL")process.exitCode=1;
 }catch(e){console.error(String(e.message));process.exitCode=2;}
}
