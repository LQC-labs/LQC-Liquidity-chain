import test from "node:test";
import assert from "node:assert/strict";
import { generateMaster6LiveExecutionPacket } from "../dex/scripts/generate-master6-live-execution-packet.mjs";

test("Master 6 live execution packet rejects missing or invalid deployer before any RPC use",async()=>{
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:"",
      sourceCommit:"0xc48e0bfa12df5c93a1320f520b7b356ca8471cfa",
      approvalPhrase:"APPROVE_6_12_TESTNET_DEPLOYMENT",
      providers:[{},{}]
    }),
    /MASTER6_DEPLOYER/
  );
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:"0x0000000000000000000000000000000000000000",
      sourceCommit:"0xc48e0bfa12df5c93a1320f520b7b356ca8471cfa",
      approvalPhrase:"APPROVE_6_12_TESTNET_DEPLOYMENT",
      providers:[{},{}]
    }),
    /MASTER6_DEPLOYER/
  );
});

test("Master 6 live execution packet requires the exact execution approval phrase",async()=>{
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:"0x1111111111111111111111111111111111111111",
      sourceCommit:"0xc48e0bfa12df5c93a1320f520b7b356ca8471cfa",
      approvalPhrase:"success",
      providers:[{},{}]
    }),
    /approval phrase/
  );
});
