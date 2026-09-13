import assert from "node:assert/strict";
import { ethers } from "ethers";
import { createReadinessProvider, inspectTestnetReadiness } from "../scripts/inspect-testnet-readiness.mjs";

const address = number => ethers.getAddress(`0x${number.toString(16).padStart(40, "0")}`);
const deployer = address(1), lqc = address(2), wbnb = address(3);
const roles = { FACTORY_OWNER: address(4), RISK_ADMIN: address(5), GUARDIAN_ADDRESS: address(6), TREASURY_ADDRESS: address(7) };
const env = { DEPLOYER_ADDRESS: deployer, TEST_LQC_ADDRESS: lqc, WBNB_ADDRESS: wbnb, REQUIRED_TBNB: "1", ...roles };
const factoryInterface = new ethers.Interface(["function getPool(address,address,uint24) view returns(address)"]);
const provider = ({ balance = ethers.parseEther("1.2"), pool = address(8), code = "0x6000" } = {}) => ({
  getNetwork: async () => ({ chainId: 97n }), getBalance: async () => balance, getCode: async () => code,
  call: async transaction => transaction.data.slice(0, 10) === factoryInterface.getFunction("getPool").selector
    ? factoryInterface.encodeFunctionResult("getPool", [pool]) : "0x"
});

describe("BSC testnet read-only readiness inspection", function () {
  it("builds a failover provider without exposing a private key", function () {
    const result = createReadinessProvider({ BSC_TESTNET_RPC_URL: "https://example.invalid" });
    for (const method of ["getNetwork", "getBalance", "getCode", "call", "resolveName"])
      assert.equal(typeof result[method], "function");
  });

  it("reports ready without requiring a deployer private key", async function () {
    const result = await inspectTestnetReadiness(env, provider());
    assert.equal(result.status, "ready");
    assert.equal("DEPLOYER_PRIVATE_KEY" in env, false);
  });

  it("reports funding, role, contract, and pool blockers together", async function () {
    const result = await inspectTestnetReadiness({ ...env, TREASURY_ADDRESS: "" },
      provider({ balance: ethers.parseEther("0.3"), pool: ethers.ZeroAddress, code: "0x" }));
    assert.equal(result.status, "blocked");
    assert.ok(result.checks.some(check => check.name === "deployer" && !check.pass));
    assert.ok(result.checks.some(check => check.name === "TREASURY_ADDRESS" && !check.pass));
    assert.ok(result.checks.some(check => check.name === "pancakeV3Pool" && !check.pass));
  });
});
