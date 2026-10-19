import fs from "node:fs";
import { execFileSync } from "node:child_process";

export function commitEvidence(root, env=process.env) {
  const testedCommitSha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  if(!/^[0-9a-f]{40}$/i.test(testedCommitSha)) throw new Error("Unable to pin tested commit SHA");
  if(env.GITHUB_SHA && env.GITHUB_SHA.toLowerCase()!==testedCommitSha.toLowerCase()) {
    throw new Error("Checkout commit does not match GITHUB_SHA");
  }
  const pullRequestHeadSha=env.LQC_PR_HEAD_SHA || null;
  if(pullRequestHeadSha && !/^[0-9a-f]{40}$/i.test(pullRequestHeadSha)) throw new Error("Invalid PR head SHA");
  return {testedCommitSha,pullRequestHeadSha,eventName:env.GITHUB_EVENT_NAME || "local",exactCommitPinned:true};
}

export function bytecodeBuffer(code) {
  if(typeof code!=="string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
    throw new Error("Invalid or empty compiled bytecode");
  }
  return Buffer.from(code.slice(2),"hex");
}

export async function observationBlock(provider, env=process.env) {
  const value=env.LQC_OBSERVED_BLOCK_NUMBER;
  if(value!==undefined && !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid observation block number");
  const tag=value===undefined ? "latest" : Number(value);
  if(typeof tag==="number" && !Number.isSafeInteger(tag)) throw new Error("Unsafe observation block number");
  const block=await provider.getBlock(tag);
  if(!block || !Number.isSafeInteger(block.number) || block.number<0 || !Number.isSafeInteger(block.timestamp) || !/^0x[0-9a-f]{64}$/i.test(block.hash || "")) {
    throw new Error("Observation block unavailable");
  }
  if(typeof tag==="number" && block.number!==tag) throw new Error("Observation block number mismatch");
  if(env.LQC_OBSERVED_BLOCK_HASH && block.hash.toLowerCase()!==env.LQC_OBSERVED_BLOCK_HASH.toLowerCase()) {
    throw new Error("Observation block hash mismatch");
  }
  return {number:block.number,hash:block.hash,timestamp:block.timestamp};
}

export async function assertObservationBlock(provider, block) {
  const current=await provider.getBlock(block.number);
  if(!current || current.hash!==block.hash) throw new Error("Observation block changed during verification");
}

export function writeFailure(file, {evidence=null,stage,block=null}, error) {
  fs.writeFileSync(file,JSON.stringify({
    schema:"lqc-master7-7-evidence-failure-v1",status:"FAILED",stage,evidence,
    observationBlock:block,error:{message:error.message},
    transactionOccurred:false,deploymentAuthorized:false,activationAuthorized:false
  },null,2)+"\n");
}
