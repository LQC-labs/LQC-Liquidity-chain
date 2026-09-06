// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SafeTransferLib {
    error TransferFailed();
    error TransferFromFailed();
    error NativeTransferFailed();
    error ApproveFailed();

    function safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("transferFrom(address,address,uint256)")), from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFromFailed();
    }

    /// @notice Sets an exact allowance, including compatibility with tokens that require zero-first approval.
    function forceApprove(address token, address spender, uint256 amount) internal {
        if (!_approve(token, spender, amount)) {
            if (!_approve(token, spender, 0) || !_approve(token, spender, amount)) revert ApproveFailed();
        }
    }

    function _approve(address token, address spender, uint256 amount) private returns (bool) {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("approve(address,uint256)")), spender, amount)
        );
        return success && (data.length == 0 || (data.length == 32 && abi.decode(data, (bool))));
    }

    function safeTransferBNB(address to, uint256 amount) internal {
        (bool success,) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }
}
