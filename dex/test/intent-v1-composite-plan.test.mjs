import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=()=>JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/intent-v1/LQCCompositePlan.sol/LQCCompositePlan.json",import.meta.url)));

describe("LQC Intent v1 composite action plan",function(){
  this.timeout(30000);
  let validator,addresses;
  const intentHash=ethers.id("composite-intent"),deadline=2_000_000_000n;
  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}})),owner=await provider.getSigner(0);
    addresses=await Promise.all(Array.from({length:8},async(_,index)=>(await provider.getSigner(index+1)).getAddress()));
    const a=artifact();validator=await new ethers.ContractFactory(a.abi,a.bytecode,owner).deploy();await validator.waitForDeployment();
  });
  const actions=()=>[
    {kind:0,adapter:addresses[0],tokenIn:addresses[3],tokenOut:addresses[4],minAmountOut:900n,dataHash:ethers.id("swap-route")},
    {kind:1,adapter:addresses[1],tokenIn:addresses[4],tokenOut:addresses[5],minAmountOut:850n,dataHash:ethers.id("vault-deposit")},
    {kind:2,adapter:addresses[2],tokenIn:addresses[5],tokenOut:addresses[6],minAmountOut:800n,dataHash:ethers.id("lending-supply")}
  ];
  const hash=async(value=actions(),overrides={})=>validator.validateAndHash(intentHash,addresses[3],addresses[6],addresses[7],800n,deadline,value,{...overrides});

  it("commits an ordered swap, Vault deposit and Lending supply chain",async function(){
    const [planHash,actionsHash]=await hash();
    assert.match(planHash,/^0x[0-9a-f]{64}$/);assert.match(actionsHash,/^0x[0-9a-f]{64}$/);assert.notEqual(planHash,actionsHash);
  });

  it("changes the commitment for every security-relevant field",async function(){
    const [baseline]=await hash();
    for(const mutate of[
      value=>value.reverse(),value=>value[0].adapter=addresses[2],value=>value[1].minAmountOut=851n,value=>value[2].dataHash=ethers.id("changed")
    ]){const value=actions();mutate(value);try{const [changed]=await hash(value);assert.notEqual(changed,baseline)}catch(error){assert.match(String(error),/revert|BrokenTokenContinuity/)}}
    const [recipientChanged]=await validator.validateAndHash(intentHash,addresses[3],addresses[6],addresses[0],800n,deadline,actions());
    assert.notEqual(recipientChanged,baseline);
  });

  it("rejects broken token continuity and a mismatched final token",async function(){
    const broken=actions();broken[1].tokenIn=addresses[0];await assert.rejects(hash(broken));
    await assert.rejects(validator.validateAndHash(intentHash,addresses[3],addresses[0],addresses[7],800n,deadline,actions()));
  });

  it("rejects empty fields, weak final output and action-count bounds",async function(){
    const empty=actions();empty[0].dataHash=ethers.ZeroHash;await assert.rejects(hash(empty));
    await assert.rejects(validator.validateAndHash(intentHash,addresses[3],addresses[6],addresses[7],801n,deadline,actions()));
    await assert.rejects(validator.validateAndHash(intentHash,addresses[3],addresses[4],addresses[7],900n,deadline,[actions()[0]]));
    const tooMany=Array.from({length:9},(_,index)=>({kind:0,adapter:addresses[0],tokenIn:index?addresses[4]:addresses[3],tokenOut:addresses[4],minAmountOut:900n,dataHash:ethers.id(`action-${index}`)}));
    await assert.rejects(validator.validateAndHash(intentHash,addresses[3],addresses[4],addresses[7],900n,deadline,tooMany));
  });

  it("exposes no execution, approval or custody path",function(){
    const source=fs.readFileSync(new URL("../contracts/intent-v1/LQCCompositePlan.sol",import.meta.url),"utf8");
    assert.doesNotMatch(source,/transferFrom|safeTransfer|approve\(|\.call\{|delegatecall|executePlan/);
  });
});
