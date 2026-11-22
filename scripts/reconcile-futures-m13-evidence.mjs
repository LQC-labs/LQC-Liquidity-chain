// 76-17-⑥-⑤ / M13 — offline cross-gate evidence reconciliation.
// No network, wallet, private key, transaction, deployment or automatic approval.
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {verifyM10Manifest} from "./verify-futures-m10-manifest.mjs";
import {verifyM12SecurityEvidence} from "./verify-futures-m12-security-evidence.mjs";

const HEX64=/^0x[0-9a-fA-F]{64}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const LOWER=x=>typeof x==="string"?x.toLowerCase():x;
const validAddress=x=>typeof x==="string"&&ADDRESS.test(x)&&!/^0x0{40}$/i.test(x);
const isUnset=x=>x===null||x===undefined||x==="UNASSIGNED"||x==="UNVERIFIED";
const required=["registry","vault","engine","oracle","collateralToken"];
function b(out,reason){out.blockers.push(reason)}
function f(out,reason){out.failures.push(reason)}
export function reconcileM13Bundle(bundle){
 const out={workId:"76-17-⑥-⑤/M13",schema:"lqc-m13-candidate-evidence-verdict-v1",
   status:"BLOCKED",crossGateConsistency:"UNVERIFIED",failures:[],blockers:[],
   evidenceSources:[],chainReadOnlyEvidenceAccepted:false,independentProvenanceAccepted:false,
   deploymentAuthorized:false,marketActivationAuthorized:false,
   historicalVaultSetEngineAuthorized:false,assetTransferAuthorized:false,pr460MergeAuthorized:false};
 try{
   if(!bundle||bundle.schema!=="lqc-m13-evidence-bundle-v1")
     throw Error("M13 evidence bundle schema missing");
   const m10=bundle.m10Manifest,m11=bundle.m11Verdict,m12=bundle.m12Evidence;
   if(!m10||!m11||!m12)throw Error("M10, M11 and M12 evidence inputs all required");
   const v10=verifyM10Manifest(m10),v12=verifyM12SecurityEvidence(m12);
   out.gates={m10:v10.status,m11:m11.status,m12:v12.status};
   if(v10.status==="FAIL"||v12.status==="FAIL")throw Error("invalid M10 or M12 manifest");
   if(m11.schema!=="lqc-m11-chain-snapshot-v1"||m11.chainId!==97)
     throw Error("M11 chain verdict schema mismatch");
   if(!["FAIL","BLOCKED"].includes(m11.status))throw Error("M11 self-reported PASS forbidden");
   if(m11.status==="FAIL")throw Error("M11 candidate chain mismatch reported");
   for(const key of ["deploymentAuthorized","assetTransferAuthorized","historicalSetEngineAuthorized",
       "marketActivationAuthorized"])if(m11[key]!==false)throw Error("M11 authority flag invalid: "+key);
   if(m10.chainId!==97||m10.candidate?.chainId!==97||m12.chainId!==97)
     throw Error("cross-gate chainId mismatch");
   const c10=m10.candidate||{},c12=m12.candidate||{};
   for(const key of required){
     const aa=c10[key], bb=c12[key];
     if(isUnset(aa)||isUnset(bb)){b(out,key+" candidate not assigned in both M10 and M12");continue}
     if(!validAddress(aa)||!validAddress(bb)||LOWER(aa)!==LOWER(bb))
       throw Error(key+" candidate address disagreement");
   }
   if(c12.feed==null||c12.feed==="UNASSIGNED")
     b(out,"Oracle feed not assigned and independently proven");
   else if(!validAddress(c12.feed))throw Error("Oracle feed address malformed");
   const legacyFlags=[
     [c10.reusesHistoricalVault,c12.callsLegacySetEngine],
     [c10.callsHistoricalSetEngine,c12.callsLegacySetEngine],
     [c10.automaticallyTransfersLegacyAssets,c12.transfersLegacyCollateral],
     [c10.copiesLegacyPositions,c12.copiesLegacyLedger]
   ];
   if(legacyFlags.some(x=>x.some(value=>value!==false)))
     throw Error("legacy mutation or account-copying explicitly permitted");
   const anchor=m10.m11||{};
   if(m11.rpcQueried!==true){
     if(m11.snapshotBlock!=null||m11.snapshotHash!=null||
        m11.candidateAddressesVerified===true||
        Array.isArray(m11.checks)&&m11.checks.length)
       throw Error("M11 presents on-chain evidence without RPC provenance");
     b(out,"M11 no candidate RPC snapshot collected");
   } else {
     if(!Number.isSafeInteger(anchor.blockNumber)||anchor.blockNumber<0||
        !HEX64.test(anchor.blockHash||"")||
        m11.snapshotBlock!==anchor.blockNumber||
        LOWER(m11.snapshotHash)!==LOWER(anchor.blockHash))
       throw Error("M11 candidate snapshot block/hash contradicts M10 anchor");
     if(m11.candidateAddressesVerified!==true)
       b(out,"M11 candidate wiring/bytecode not fully verified");
     const requiredM11Checks=[
       "registryRuntimeCodehash","vaultRuntimeCodehash","engineRuntimeCodehash",
       "oracleRuntimeCodehash","vaultEngine","engineRegistry","engineVault",
       "registryOwner","vaultOwner","oracleOwner","registryGuardian","marketOracleAndCollateral"];
     const observed=new Map();
     for(const c of m11.checks||[]){
       if(!c||typeof c.name!=="string"||observed.has(c.name))
         throw Error("M11 duplicate or malformed check");
       observed.set(c.name,c);
     }
     for(const key of requiredM11Checks){
       if(observed.get(key)?.status!=="MATCH")b(out,"M11 required check missing: "+key);
     }
     for(const k of ["registry","vault","engine","oracle"]){
       const ref=observed.get(k+"RuntimeCodehash")?.codehash;
       const pinned=m10.source?.[k+"RuntimeCodehash"];
       if(ref!==undefined&&pinned!==undefined&&LOWER(ref)!==LOWER(pinned))
         throw Error("M11/M10 runtime hash contradiction: "+k);
     }
     for(const k of ["registry","vault","oracle"]){
       const ref=observed.get(k+"Owner")?.owner;
       const pin=anchor.owners?.[k];
       if(ref!==undefined&&pin!==undefined&&LOWER(ref)!==LOWER(pin))
         throw Error("M11/M10 owner contradiction: "+k);
       const authorityField={registry:"registryOwner",vault:"vaultOwner",oracle:"oracleOwner"}[k];
       if(ref!==undefined&&validAddress(m12.authority?.[authorityField])&&
          LOWER(ref)!==LOWER(m12.authority[authorityField]))
         throw Error("M11/M12 owner contradiction: "+k);
     }
     if(observed.get("registryGuardian")?.guardian&&
        validAddress(m12.authority?.guardian)&&
        LOWER(observed.get("registryGuardian").guardian)!==LOWER(m12.authority.guardian))
       throw Error("M11/M12 Guardian contradiction");
     if(Number.isSafeInteger(anchor.marketId)&&Number.isSafeInteger(m12.recovery?.marketId)&&
        anchor.marketId!==m12.recovery.marketId)throw Error("M10/M12 market ID contradiction");
     out.chainReadOnlyEvidenceAccepted=requiredM11Checks.every(k=>observed.get(k)?.status==="MATCH");
     b(out,"M11 provider witness/raw RPC responses not independently signed or verified");
   }
   if(validAddress(c12.oracle)&&validAddress(c10.oracle)&&LOWER(c12.oracle)===LOWER(c10.oracle)){
     const oracleHash=m12.oracle?.runtimeCodehash;
     const m10Hash=m10.source?.oracleRuntimeCodehash;
     if(HEX64.test(oracleHash||"")&&HEX64.test(m10Hash||"")&&
        LOWER(oracleHash)!==LOWER(m10Hash))
       throw Error("M10/M12 Oracle runtime code hash contradictory");
   }
   if(m12.review?.independentAuditStatus!=="APPROVED")
     b(out,"independent security review not approved");
   if(m12.authority?.safeSignerProvenanceVerified!==true)
     b(out,"Safe signer threshold/membership unverified");
   if(m12.oracle?.proxyProvenance!=="VERIFIED_INDEPENDENTLY")
     b(out,"feed/proxy implementation provenance unverified");
   const origins=bundle.evidenceOrigins;
   if(!origins||!Array.isArray(origins)||origins.length!==3){
     b(out,"three independent evidence provenance records not supplied");
   }else{
     const keys=new Set();
     for(const o of origins){
       if(!["M10","M11","M12"].includes(o?.gate)||keys.has(o.gate))
         throw Error("invalid or duplicate evidence gate origin");
       keys.add(o.gate);
       if(!HEX64.test(o.gitCommit||"")||!o.artifactReference)
         b(out,o.gate+" immutable commit/artifact provenance not provided");
       out.evidenceSources.push({gate:o.gate,gitCommit:o.gitCommit||null,
         artifactReference:o.artifactReference||null});
     }
     if(keys.size!==3)throw Error("incomplete gate provenance");
     b(out,"provided evidence paths and commits require independent third-party verification");
   }
   out.crossGateConsistency="STRUCTURALLY_RECONCILED";
   b(out,"M13 offline cross-gate result cannot confer security approval or deployment authorization");
 }catch(e){f(out,String(e.message||e));out.crossGateConsistency="FAIL"}
 out.status=out.failures.length?"FAIL":"BLOCKED";
 out.independentProvenanceAccepted=false;
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3){console.error("Usage: node scripts/reconcile-futures-m13-evidence.mjs BUNDLE.json");process.exitCode=2}
 else try{
   const v=reconcileM13Bundle(JSON.parse(readFileSync(process.argv[2],"utf8")));
   if(process.env.M13_VERDICT_FILE)writeFileSync(process.env.M13_VERDICT_FILE,JSON.stringify(v,null,2)+"\n");
   console.log(JSON.stringify(v,null,2));
   if(v.status==="FAIL")process.exitCode=1;
 }catch(e){console.error(String(e.message));process.exitCode=2}
}
