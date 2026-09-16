// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One-time on-chain record of the Governance-approved Intent Bond token.
contract LQCBondSelection {
    address public immutable governanceSafe;
    address public bondToken;
    bytes32 public inspectionDigest;
    uint256 public approvedAt;

    event BondTokenApproved(address indexed bondToken, bytes32 indexed inspectionDigest, uint256 approvedAt);

    error Unauthorized();
    error ZeroAddress();
    error InvalidSelection();

    constructor(address governanceSafe_) {
        if (governanceSafe_ == address(0)) revert ZeroAddress();
        governanceSafe = governanceSafe_;
    }

    function approveBondToken(address token, bytes32 digest) external {
        if (msg.sender != governanceSafe) revert Unauthorized();
        if (bondToken != address(0) || token == address(0) || token.code.length == 0 || digest == bytes32(0)) {
            revert InvalidSelection();
        }
        bondToken = token;
        inspectionDigest = digest;
        approvedAt = block.timestamp;
        emit BondTokenApproved(token, digest, block.timestamp);
    }
}
