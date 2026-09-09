// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Audit-only token with hostile balance reads and transfer callbacks.
contract MockAdversarialERC20 {
    uint8 public balanceMode;
    address public callbackTarget;
    bytes public callbackData;
    uint256 public totalSupply;
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setBalanceMode(uint8 mode) external { balanceMode = mode; }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function balanceOf(address account) external view returns (uint256) {
        uint8 mode = balanceMode;
        if (mode == 1) revert("HOSTILE_BALANCE");
        uint256 value = balances[account];
        if (mode == 2) assembly { mstore8(0, value) return(0, 1) }
        return value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _callback();
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _callback();
        _transfer(from, to, amount);
        return true;
    }

    function rawBalanceOf(address account) external view returns (uint256) { return balances[account]; }

    function _callback() private {
        address target = callbackTarget;
        if (target == address(0)) return;
        (bool success,) = target.call(callbackData);
        require(success, "CALLBACK_REJECTED");
    }

    function _transfer(address from, address to, uint256 amount) private {
        balances[from] -= amount;
        balances[to] += amount;
        emit Transfer(from, to, amount);
    }
}
