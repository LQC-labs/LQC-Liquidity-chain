import assert from "node:assert/strict";
import { ethers } from "ethers";
import { validateDeploymentAuthorization, buildOwnerConfiguration } from "../scripts/deploy-futures-testnet.mjs";
const deployer="0x1111111111111111111111111111111111111111", owner="0x2222222222222222222222222222222222222222";
const base={BSC_TESTNET_RPC_URL:"https://example.invalid",FUTURES_DEPLOYER_ADDRESS:deployer,FUTURES_OWNER_ADDRESS:owner};
describe("Futures testnet deployment gate",()=>{
 it("fails closed without explicit authorization",()=>assert.throws(()=>validateDeploymentAuthorization(base),/authorization/));
 it("requires a runtime private key only after authorization",()=>assert.throws(()=>validateDeploymentAuthorization({...base,FUTURES_EXECUTE_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_TESTNET_TRANSACTIONS"}),/PRIVATE_KEY/));
 it("rejects any wrong authorization phrase",()=>assert.throws(()=>validateDeploymentAuthorization({...base,FUTURES_EXECUTE_DEPLOYMENT:"yes"}),/authorization/));
 it("rejects the legacy Mock-Oracle path unless explicitly classified test-only",()=>{
   const key="0x"+"11".repeat(32);
   const signer=new ethers.Wallet(key);
   assert.throws(()=>validateDeploymentAuthorization({
     ...base,
     FUTURES_DEPLOYER_ADDRESS:signer.address,
     FUTURES_EXECUTE_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_TESTNET_TRANSACTIONS",
     DEPLOYER_PRIVATE_KEY:key
   }),/TEST ONLY/);
 });
 it("builds owner-only Vault engine configuration without impersonating deployer",()=>{
   const vault="0x3333333333333333333333333333333333333333", engine="0x4444444444444444444444444444444444444444";
   const action=buildOwnerConfiguration(vault,engine);
   const iface=new ethers.Interface(["function setEngine(address newEngine)"]);
   assert.equal(action.to,vault); assert.equal(action.value,"0");
   assert.equal(iface.decodeFunctionData("setEngine",action.data)[0],engine);
 });
});
