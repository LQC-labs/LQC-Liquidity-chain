import assert from "node:assert/strict";
import { validateDeploymentAuthorization } from "../scripts/deploy-futures-testnet.mjs";
const deployer="0x1111111111111111111111111111111111111111", owner="0x2222222222222222222222222222222222222222";
const base={BSC_TESTNET_RPC_URL:"https://example.invalid",FUTURES_DEPLOYER_ADDRESS:deployer,FUTURES_OWNER_ADDRESS:owner};
describe("Futures testnet deployment gate",()=>{
 it("fails closed without explicit authorization",()=>assert.throws(()=>validateDeploymentAuthorization(base),/authorization/));
 it("requires a runtime private key only after authorization",()=>assert.throws(()=>validateDeploymentAuthorization({...base,FUTURES_EXECUTE_DEPLOYMENT:"I_UNDERSTAND_THIS_SENDS_TESTNET_TRANSACTIONS"}),/PRIVATE_KEY/));
 it("rejects any wrong authorization phrase",()=>assert.throws(()=>validateDeploymentAuthorization({...base,FUTURES_EXECUTE_DEPLOYMENT:"yes"}),/authorization/));
});
