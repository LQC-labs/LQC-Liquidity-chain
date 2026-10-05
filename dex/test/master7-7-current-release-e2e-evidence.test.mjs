import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { commitEvidence, observationBlock, bytecodeBuffer } from "../scripts/master7-7-evidence-context.mjs";
import { validateReadiness, validateChainReports } from "../scripts/verify-master7-7-evidence-reports.mjs";

const root = path.resolve(import.meta.dirname, "..");

describe("Master 7/7 chain-97 read-only evidence", () => {
  const wiring = fs.readFileSync(path.join(root, "scripts", "verify-futures-bsc-testnet.js"), "utf8");
  const readiness = fs.readFileSync(path.join(root, "scripts", "verify-master7-7-current-release-readiness.mjs"), "utf8");

  it("keeps chain-97 verification read-only", () => {
    assert.doesNotMatch(wiring, /getSigner\(|sendTransaction\(|wallet\.|new ethers\.Wallet|\.connect\(signer/i);
    assert.match(wiring, /transactionOccurred:\s*false/);
    assert.match(wiring, /deploymentAuthorized:\s*false/);
    assert.match(wiring, /activationAuthorized:\s*false/);
  });

  it("pins recorded Futures wiring addresses", () => {
    assert.match(wiring, /0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0/i);
    assert.match(wiring, /0xb532c65294a7b35ca510a7df025e934fa17c8d7e/i);
    assert.match(wiring, /0xe4f1320c8709631776c7e39e0916584935882525/i);
    assert.match(wiring, /0x89d992f696B40ABbDB6610144faeF336911D8175/i);
  });

  it("persists reproducible evidence with runtime code hashes", () => {
    assert.match(wiring, /futures-chain97-wiring-report\.json/);
    assert.match(wiring, /codeHash:\s*ethers\.keccak256\(code\)/);
    assert.match(wiring, /observedBlockNumber/);
    assert.match(wiring, /observedBlockTimestamp/);
  });

  it("pins exact commit and compiled artifact hashes", () => {
    assert.match(readiness, /commitEvidence\(root\)/);
    assert.match(readiness, /artifactFileSha256/);
    assert.match(readiness, /creationBytecodeSha256/);
    assert.match(readiness, /runtimeBytecodeSha256/);
    assert.match(readiness, /exactCommitPinned:\s*true/);
    assert.match(readiness, /compiledArtifactHashesPinned:\s*true/);
  });
});

function fixture() {
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),"lqc-evidence-"));
  const dex=path.join(repo,"dex");
  fs.mkdirSync(path.join(dex,"scripts"),{recursive:true});
  for(const name of ["master7-7-evidence-context.mjs","verify-master7-7-evidence-reports.mjs",
    "verify-master7-7-current-release-readiness.mjs","verify-futures-bsc-testnet.js","verify-futures-deployment-lineage.mjs"]) {
    fs.copyFileSync(path.join(root,"scripts",name),path.join(dex,"scripts",name));
  }
  const put=(file,content)=>{const dest=path.join(dex,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);};
  put("scripts/preflight-futures-testnet-deploy.mjs","MockLQCFuturesOracle");
  put("contracts/futures/LQCAggregatorOracleAdapter.sol","referenceFeed maxDeviationBps StaleFeedPrice ExcessivePriceDeviation");
  put("contracts/futures/LQCV3TwapReferenceAdapter.sol","observationWindow minimumLiquidity observe(secondsAgos) _mulDiv");
  for(const name of ["LQCAggregatorOracleAdapter","LQCV3TwapReferenceAdapter","LQCFuturesMarketRegistry","LQCFuturesVault","LQCPerpEngine","MockLQCFuturesOracle"]) {
    const source=`futures/${name.startsWith("Mock")?"mocks/":""}${name}.sol`;
    put(`artifacts/contracts/${source}/${name}.json`,JSON.stringify({bytecode:"0xabcd",deployedBytecode:"0x1234",immutableReferences:{}}));
  }
  put("node_modules/ethers/package.json",JSON.stringify({name:"ethers",main:"index.cjs"}));
  put("node_modules/ethers/index.cjs",`
    const crypto=require('node:crypto');
    const owner='0x89d992f696B40ABbDB6610144faeF336911D8175';
    const registry='0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0';
    const vault='0xb532c65294a7b35ca510a7df025e934fa17c8d7e';
    const engine='0xe4f1320c8709631776c7e39e0916584935882525';
    const addresses=[registry,vault,'0xbf6a446c5e17228e70e45645ab47f751bdfc4b41',engine];
    const txs=['0x3ee3a4f09711d889793b2d9f96071d0ecc4d7c1994b3a8d93f1df9f90b7d3f2d','0x263e7d9135a646caa958e3a317867a13f056e0c712ddd9429d9b432a2d45cda0','0x902d3e5924f11c54d794a109b20181dcb70242c19a514bca31f07d6808372cd7','0x16a112f0cdfa053e9af81eb56ebfb00ee91dd7538b003addf7069028ab41c870'];
    const expectedBlock=Number(process.env.LQC_OBSERVED_BLOCK_NUMBER||500);
    function check(tag){if(tag!==expectedBlock)throw Error('RPC read is not pinned to observation block');}
    class JsonRpcProvider {
      constructor(){this.blockReads=0;}
      async getNetwork(){return {chainId:97n};}
      async getBlock(tag){this.blockReads++;if(tag!=='latest')check(tag);return {number:expectedBlock,hash:'0x'+(process.env.FIXTURE_MODE==='reorg'&&this.blockReads>1?'b':'a').repeat(64),timestamp:12345};}
      async getCode(address,tag){check(tag);return process.env.FIXTURE_MODE==='missing-runtime'?'0x':process.env.FIXTURE_MODE==='diverged'?'0x5678':'0x1234';}
      async getTransactionReceipt(tx){return {status:1,contractAddress:addresses[txs.indexOf(tx)],blockNumber:100};}
      async getTransaction(){return {to:null,from:'0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB'};}
    }
    class Contract {
      async owner(o){check(o.blockTag);return owner;}
      async pendingOwner(o){check(o.blockTag);return '0x'+'0'.repeat(40);}
      async engine(o){check(o.blockTag);return engine;}
      async registry(o){check(o.blockTag);return registry;}
      async vault(o){check(o.blockTag);return vault;}
    }
    exports.ethers={JsonRpcProvider,Contract,getAddress:x=>x.toLowerCase(),keccak256:x=>'0x'+crypto.createHash('sha256').update(x).digest('hex')};
  `);
  execFileSync("git",["init","-q"],{cwd:repo});
  execFileSync("git",["-c","user.name=LQC test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","fixture"],{cwd:repo});
  const evidence=commitEvidence(dex,{});
  const env={...process.env,GITHUB_SHA:evidence.testedCommitSha,LQC_PR_HEAD_SHA:"",GITHUB_EVENT_NAME:"local"};
  delete env.LQC_OBSERVED_BLOCK_NUMBER;
  delete env.LQC_OBSERVED_BLOCK_HASH;
  delete env.FIXTURE_MODE;
  return {
    root:dex,evidence,put,
    run:(script,extra={})=>spawnSync(process.execPath,[path.join(dex,"scripts",script)],{cwd:repo,env:{...env,...extra},encoding:"utf8"}),
    read:file=>JSON.parse(fs.readFileSync(path.join(dex,file),"utf8")),
    close:()=>fs.rmSync(repo,{recursive:true,force:true})
  };
}

describe("Master 7/7 evidence behavioral regression",()=>{
  it("distinguishes PR head from checkout commit and rejects a mismatched checkout",()=>{
    const f=fixture();
    try {
      const head="b".repeat(40);
      const evidence=commitEvidence(f.root,{GITHUB_SHA:f.evidence.testedCommitSha,LQC_PR_HEAD_SHA:head,GITHUB_EVENT_NAME:"pull_request"});
      assert.equal(evidence.pullRequestHeadSha,head);
      assert.equal(evidence.testedCommitSha,f.evidence.testedCommitSha);
      assert.throws(()=>commitEvidence(f.root,{GITHUB_SHA:head}),/Checkout commit/);
      const result=f.run("verify-master7-7-current-release-readiness.mjs",{GITHUB_SHA:head});
      assert.equal(result.status,1);
      assert.equal(f.read("master7-7-current-release-readiness.json").stage,"commit");
    } finally {f.close();}
  });
  it("computes actual hashes and rejects a tampered artifact report",()=>{
    const f=fixture();
    try {
      const result=f.run("verify-master7-7-current-release-readiness.mjs");
      assert.equal(result.status,0,result.stderr);
      const report=f.read("master7-7-current-release-readiness.json");
      validateReadiness(report,f.root,f.evidence);
      report.artifacts[0].creationBytecodeSha256="0".repeat(64);
      assert.throws(()=>validateReadiness(report,f.root,f.evidence),/Creation bytecode hash mismatch/);
    } finally {f.close();}
  });
  it("persists failure evidence instead of a success report for malformed bytecode",()=>{
    const f=fixture();
    try {
      f.put("artifacts/contracts/futures/LQCPerpEngine.sol/LQCPerpEngine.json",JSON.stringify({bytecode:"0xabcg",deployedBytecode:"0x1234"}));
      const result=f.run("verify-master7-7-current-release-readiness.mjs");
      assert.equal(result.status,1);
      const report=f.read("master7-7-current-release-readiness.json");
      assert.equal(report.status,"FAILED");
      assert.equal(report.stage,"compiled-artifacts");
      assert.equal(report.activationAuthorized,false);
      assert.throws(()=>bytecodeBuffer("0x123"),/Invalid/);
    } finally {f.close();}
  });
  it("pins every wiring and lineage state read to one block and validates both reports",()=>{
    const f=fixture();
    try {
      const first=f.run("verify-futures-bsc-testnet.js");
      assert.equal(first.status,0,first.stderr);
      const wiring=f.read("futures-chain97-wiring-report.json");
      const second=f.run("verify-futures-deployment-lineage.mjs",{LQC_OBSERVED_BLOCK_NUMBER:String(wiring.observedBlockNumber),LQC_OBSERVED_BLOCK_HASH:wiring.observedBlockHash});
      assert.equal(second.status,0,second.stderr);
      const lineage=f.read("futures-lineage-report.json");
      validateChainReports(wiring,lineage,f.evidence);
      lineage.observedBlockHash="0x"+"b".repeat(64);
      assert.throws(()=>validateChainReports(wiring,lineage,f.evidence),/Observation block hash mismatch/);
    } finally {f.close();}
  });
  it("preserves historical divergence without claiming current-release deployment",()=>{
    const f=fixture();
    try {
      const result=f.run("verify-futures-deployment-lineage.mjs",{FIXTURE_MODE:"diverged"});
      assert.equal(result.status,0,result.stderr);
      const report=f.read("futures-lineage-report.json");
      assert.equal(report.currentArtifactLineage,"ONE_OR_MORE_RECORDED_RUNTIMES_DIVERGE_FROM_CURRENT_ARTIFACTS");
      assert.equal(report.currentReleaseDeploymentVerified,false);
      assert.equal(report.productionOracleReady,false);
    } finally {f.close();}
  });
  for(const mode of ["missing-runtime","reorg"]) {
    it(`persists a failed wiring report for ${mode}`,()=>{
      const f=fixture();
      try {
        const result=f.run("verify-futures-bsc-testnet.js",{FIXTURE_MODE:mode});
        assert.equal(result.status,1);
        const report=f.read("futures-chain97-wiring-report.json");
        assert.equal(report.status,"FAILED");
        assert.equal(report.stage,mode==="reorg"?"block-consistency":"runtime");
        assert.equal(report.transactionOccurred,false);
      } finally {f.close();}
    });
  }
  it("rejects unavailable blocks and mismatched supplied block hashes",async()=>{
    const block={number:50,hash:"0x"+"a".repeat(64),timestamp:1};
    await assert.rejects(observationBlock({getBlock:async()=>null},{}),/unavailable/);
    await assert.rejects(observationBlock({getBlock:async()=>block},{LQC_OBSERVED_BLOCK_NUMBER:"50",LQC_OBSERVED_BLOCK_HASH:"0x"+"b".repeat(64)}),/hash mismatch/);
    await assert.rejects(observationBlock({getBlock:async()=>block},{LQC_OBSERVED_BLOCK_NUMBER:"-1"}),/Invalid/);
  });
});
