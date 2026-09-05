// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SafeTransferLib {
    error TransferFailed();
    error TransferFromFailed();
    error NativeTransferFailed();

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

    function safeTransferBNB(address to, uint256 amount) internal {
        (bool success,) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }
}
