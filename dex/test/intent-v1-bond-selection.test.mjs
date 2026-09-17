import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
describe("LQC Intent v1 Governance Bond selection",function(){
  this.timeout(30000);
  let provider,governance,outsider,token,selection;
  beforeEach(async function(){provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));governance=await provider.getSigner(0);outsider=await provider.getSigner(1);const deploy=async(name,source,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,governance).deploy(...args);await c.waitForDeployment();return c};token=await deploy("MockERC20","mocks/MockERC20","Bond","BOND");selection=await deploy("LQCBondSelection","intent-v1/LQCBondSelection",await governance.getAddress());});
  it("records exactly one bytecode-backed token and inspection digest",async function(){const digest=ethers.id("inspection");await(await selection.approveBondToken(await token.getAddress(),digest)).wait();assert.equal(await selection.bondToken(),await token.getAddress());assert.equal(await selection.inspectionDigest(),digest);assert.notEqual(await selection.approvedAt(),0n);await assert.rejects(selection.approveBondToken(await token.getAddress(),ethers.id("replacement")));});
  it("rejects non-governance, EOAs and empty evidence",async function(){await assert.rejects(selection.connect(outsider).approveBondToken(await token.getAddress(),ethers.id("inspection")));await assert.rejects(selection.approveBondToken(await outsider.getAddress(),ethers.id("inspection")));await assert.rejects(selection.approveBondToken(await token.getAddress(),ethers.ZeroHash));});
});
