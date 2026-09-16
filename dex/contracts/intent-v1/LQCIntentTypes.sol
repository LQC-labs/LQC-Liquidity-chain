// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library LQCIntentTypes {
    struct Intent {
        address user;
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destinationChainId;
        address destinationToken;
        address recipient;
        uint256 minAmountOut;
        uint256 deadline;
        uint256 nonce;
        bytes32 salt;
    }

    enum IntentStatus {
        NONE,
        OPEN,
        EXECUTED,
        CANCELLED,
        EXPIRED,
        DISPUTED
    }
}
