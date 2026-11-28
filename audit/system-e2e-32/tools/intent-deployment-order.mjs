import {getAddress, getCreateAddress, ZeroAddress} from "ethers";

// Offline plan. The Gate address is resolved from its deployment receipt before constructing Relay.
export function planIntentDeployments({chainId, deployer, firstNonce, payoutGateRelayer}) {
    if (chainId !== 97 || typeof firstNonce !== "bigint" || firstNonce < 0n || firstNonce + 4n >= 2n ** 64n - 1n) {
        throw new RangeError("BSC97 and a valid five-transaction nonce range are required");
    }
    deployer = getAddress(deployer);
    payoutGateRelayer = getAddress(payoutGateRelayer);
    if (deployer === ZeroAddress || payoutGateRelayer === ZeroAddress || deployer === payoutGateRelayer) {
        throw new Error("Payout Gate setup requires a separate nonzero relayer");
    }
    const names = ["LQCSignedIntentEscrow", "LQCInternalSolver", "LQCIntentSolverBinding",
        "LQCCompetitiveIntentHub", "LQCServiceEmergencyRelay"];
    return names.map((contract, i) => {
        const nonce = firstNonce + BigInt(i);
        return {contract, from: deployer, nonce, expectedAddress: getCreateAddress({from: deployer, nonce})};
    });
}

export function verifyDeploymentSlot(step, observation) {
    if (observation.chainId !== 97 || getAddress(observation.from) !== step.from ||
        observation.pendingNonce !== step.nonce) {
        throw new Error("Deployment chain, sender or pending nonce changed");
    }
    return step.expectedAddress;
}
