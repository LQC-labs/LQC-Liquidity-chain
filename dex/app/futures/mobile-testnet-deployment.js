const BSC_TESTNET_CHAIN_ID = "0x61";
const BSC_TESTNET_CHAIN_ID_DECIMAL = 97;
const EXPECTED_DEPLOYER = "0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const GOVERNANCE_OWNER = "0x89d992f696B40ABbDB6610144faeF336911D8175";
const MIN_RESERVE_WEI = 300000000000000000n;
const MAX_DEPLOYMENT_SPEND_WEI = 1000000000000000000n;

function normalizeAddress(value) {
  return String(value || "").toLowerCase();
}

export function assertMobileDeploymentContext({ chainId, account }) {
  const parsed = typeof chainId === "string" && chainId.startsWith("0x")
    ? Number.parseInt(chainId, 16)
    : Number(chainId);
  if (parsed !== BSC_TESTNET_CHAIN_ID_DECIMAL) {
    throw new Error("Wrong network: BSC Testnet chain 97 is required.");
  }
  if (normalizeAddress(account) !== normalizeAddress(EXPECTED_DEPLOYER)) {
    throw new Error("Wrong signer: expected the approved Futures deployer.");
  }
  if (normalizeAddress(EXPECTED_DEPLOYER) === normalizeAddress(GOVERNANCE_OWNER)) {
    throw new Error("Unsafe configuration: deployer and governance owner must remain separated.");
  }
  return { chainId: BSC_TESTNET_CHAIN_ID_DECIMAL, account, owner: GOVERNANCE_OWNER };
}

export function assertMobileDeploymentBudget({ balanceWei, estimatedCostWei }) {
  const balance = BigInt(balanceWei);
  const estimatedCost = BigInt(estimatedCostWei);
  if (estimatedCost <= 0n || estimatedCost > MAX_DEPLOYMENT_SPEND_WEI) {
    throw new Error("Estimated Futures deployment cost must be greater than zero and at most 1.0 tBNB.");
  }
  if (balance < estimatedCost + MIN_RESERVE_WEI) {
    throw new Error("Deployer balance cannot cover deployment while preserving the 0.3 tBNB reserve.");
  }
  return balance - estimatedCost;
}

export async function connectApprovedMobileWallet(provider = globalThis.ethereum) {
  if (!provider?.request) throw new Error("No injected mobile wallet provider found. Open this page inside TokenPocket DApp browser.");
  const chainId = await provider.request({ method: "eth_chainId" });
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !accounts[0]) throw new Error("Wallet did not expose an account.");
  return assertMobileDeploymentContext({ chainId, account: accounts[0] });
}

export async function requestExplicitTransaction(provider, tx, expectedFrom) {
  if (!provider?.request) throw new Error("Wallet provider is required.");
  if (!tx || typeof tx !== "object" || !tx.data) throw new Error("Prepared transaction data is required.");
  if (normalizeAddress(tx.from) !== normalizeAddress(expectedFrom)) throw new Error("Transaction signer mismatch.");
  return provider.request({ method: "eth_sendTransaction", params: [tx] });
}

export const MOBILE_FUTURES_DEPLOYMENT = Object.freeze({
  chainId: BSC_TESTNET_CHAIN_ID_DECIMAL,
  chainIdHex: BSC_TESTNET_CHAIN_ID,
  deployer: EXPECTED_DEPLOYER,
  owner: GOVERNANCE_OWNER,
  minReserveWei: MIN_RESERVE_WEI.toString(),
  maxDeploymentSpendWei: MAX_DEPLOYMENT_SPEND_WEI.toString(),
  privateKeyInputSupported: false,
});
